'use server'

import { headers } from 'next/headers'
import { compile } from '@/lib/engine'
import { findMerchVariant, type MerchSize } from '@/lib/merch/catalog'
import { isMerchConfigured } from '@/lib/merch/config'
import type { MerchOrderStatus, MerchOrderView } from '@/lib/merch/orders'
import { MERCH_MARGIN, retailCents } from '@/lib/merch/pricing'
import { MERCH_PRINTS_BUCKET, merchPrintPath, renderMerchPrint } from '@/lib/merch/print'
import { merchOrderSchema } from '@/lib/merch/schema'
import { isPrintfulConfigured } from '@/lib/promo/config'
import type { MerchProductId } from '@/lib/promo/types'
import { APP_ORIGIN } from '@/lib/routing/host'
import { STRIPE_SECRET_KEY, isStripeConfigured } from '@/lib/stripe/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/supabase/session'

/**
 * Server action создания заказа мерча (§4.1 спеки merch-orders.md). Форма
 * ответа по образцу PackCheckoutResult (app/actions/credits.ts).
 */
export type MerchCheckoutError =
  | 'invalid' // не прошла схема zod / недопустимая пара товар+размер
  | 'disabled' // нет ключей Stripe или Printful, либо рубильник MERCH_ENABLED выключен
  | 'unauthenticated' // нужен вход
  | 'render' // не собрался print-файл
  | 'storage' // не залился в bucket
  | 'failed' // Stripe не ответил, лимит заказов, ошибка базы

export type MerchCheckoutResult = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly error: MerchCheckoutError }

/** Куда доставляем (§2.5 спеки). Россия и Беларусь не входят: Printful туда не отправляет. */
const MERCH_ALLOWED_COUNTRIES: readonly string[] = [
  'US',
  'CA',
  'GB',
  'DE',
  'FR',
  'ES',
  'IT',
  'NL',
  'PL',
  'SE',
  'IE',
  'PT',
  'AT',
  'BE',
  'DK',
  'FI',
  'CZ',
  'AU',
  'NZ',
  'JP',
]

/** Защита от дурака, не от карты: не больше 10 незавершённых заказов на пользователя в час (§4.1). */
const MERCH_PENDING_LIMIT = 10
const MERCH_PENDING_WINDOW_MS = 60 * 60 * 1000

/** Название товара на английском для строки Stripe Checkout: странице оплаты нужен латинский текст. */
const PRODUCT_TITLE_EN: Readonly<Record<MerchProductId, string>> = {
  tshirt: 'T-Shirt',
  mug: 'Mug',
  poster: 'Poster',
  apron: 'Apron',
}

/** Подпись размера/варианта под названием товара на странице оплаты. */
const SIZE_LABEL: Readonly<Record<MerchProductId, (size: MerchSize) => string>> = {
  tshirt: (size) => `Size ${size.toUpperCase()}`,
  mug: () => '11 oz',
  poster: () => '18x24 in',
  apron: () => 'One size',
}

async function tooManyPendingOrders(userId: string): Promise<boolean> {
  const sb = getSupabaseService()
  const since = new Date(Date.now() - MERCH_PENDING_WINDOW_MS).toISOString()
  const { count, error } = await sb
    .from('merch_orders')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending_payment')
    .gte('created_at', since)
  if (error) {
    console.error('merch checkout: подсчёт незавершённых заказов упал', error)
    // Читать не смогли - не топим действие тихой дырой в лимите, считаем перебором.
    return true
  }
  return (count ?? 0) >= MERCH_PENDING_LIMIT
}

/**
 * Создаёт заказ мерча: рендерит print-файл, кладёт его в публичный bucket,
 * заводит строку merch_orders в pending_payment ДО кассы (§4 спеки) и
 * открывает Stripe Checkout Session с адресом доставки.
 */
export async function createMerchCheckoutAction(input: unknown): Promise<MerchCheckoutResult> {
  const parsed = merchOrderSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  if (!isMerchConfigured(isStripeConfigured(), isPrintfulConfigured())) return { ok: false, error: 'disabled' }
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'disabled' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const variant = findMerchVariant(parsed.data.product, parsed.data.size)
  if (variant === undefined) return { ok: false, error: 'invalid' }

  if (await tooManyPendingOrders(user.id)) {
    console.error('merch checkout: превышен лимит незавершённых заказов', { userId: user.id })
    return { ok: false, error: 'failed' }
  }

  // Рендер print-файла синхронно, до кассы (§3.4): если он падает, деньги ещё
  // не списаны, и человек просто пробует ещё раз.
  let printFile
  try {
    const model = compile(parsed.data.design)
    printFile = await renderMerchPrint(model, parsed.data.product)
  } catch (err) {
    console.error('merch checkout: рендер print-файла упал', err)
    return { ok: false, error: 'render' }
  }

  // orderId рождается здесь, до записи строки: путь объекта в bucket и id
  // заказа обязаны совпасть (§3.3), а вставить строку раньше нечем - print_path
  // обязателен (not null) в схеме merch_orders.
  const orderId = crypto.randomUUID()
  const sb = getSupabaseService()
  const printPath = merchPrintPath(user.id, orderId)
  const { error: uploadError } = await sb.storage.from(MERCH_PRINTS_BUCKET).upload(printPath, printFile.buffer, {
    contentType: 'image/png',
    upsert: false,
  })
  if (uploadError) {
    console.error('merch checkout: заливка print-файла упала', uploadError.message)
    return { ok: false, error: 'storage' }
  }
  const { data: publicUrlData } = sb.storage.from(MERCH_PRINTS_BUCKET).getPublicUrl(printPath)
  const printFileUrl = publicUrlData.publicUrl
  if (!printFileUrl) return { ok: false, error: 'storage' }

  const price = retailCents(variant)

  const { error: insertError } = await sb.from('merch_orders').insert({
    id: orderId,
    user_id: user.id,
    project_id: parsed.data.projectId,
    product: parsed.data.product,
    size: parsed.data.size,
    variant_id: variant.variantId,
    print_path: printPath,
    retail_cents: price,
    cost_cents: variant.costCents,
    ship_cents: variant.shipCents,
    margin: MERCH_MARGIN,
    status: 'pending_payment',
  })
  if (insertError) {
    console.error('merch checkout: запись заказа упала', insertError)
    return { ok: false, error: 'failed' }
  }

  const headerList = await headers()
  const origin = headerList.get('origin') ?? APP_ORIGIN

  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(price),
    'line_items[0][price_data][product_data][name]': `${PRODUCT_TITLE_EN[parsed.data.product]} с узором Endgrain`,
    'line_items[0][price_data][product_data][description]': SIZE_LABEL[parsed.data.product](parsed.data.size),
    'line_items[0][price_data][product_data][images][0]': printFileUrl,
    success_url: `${origin}/account/orders?merch=success`,
    cancel_url: `${origin}/?merch=cancel`,
    client_reference_id: user.id,
    customer_email: user.email,
    'phone_number_collection[enabled]': 'true',
    'shipping_options[0][shipping_rate_data][type]': 'fixed_amount',
    'shipping_options[0][shipping_rate_data][fixed_amount][amount]': '0',
    'shipping_options[0][shipping_rate_data][fixed_amount][currency]': 'usd',
    'shipping_options[0][shipping_rate_data][display_name]': 'Shipping included',
    'metadata[supabase_user_id]': user.id,
    'metadata[kind]': 'merch',
    'metadata[merch_order_id]': orderId,
  })
  MERCH_ALLOWED_COUNTRIES.forEach((country, index) => {
    body.set(`shipping_address_collection[allowed_countries][${index}]`, country)
  })

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error('merch checkout: Stripe ответил ошибкой', res.status, await res.text())
      return { ok: false, error: 'failed' }
    }
    const json = (await res.json()) as { id?: unknown; url?: unknown }
    if (typeof json.url !== 'string' || json.url.length === 0) {
      console.error('merch checkout: Stripe вернул сессию без url')
      return { ok: false, error: 'failed' }
    }

    if (typeof json.id === 'string' && json.id.length > 0) {
      const { error: updateError } = await sb.from('merch_orders').update({ stripe_session_id: json.id }).eq('id', orderId)
      // Не фатально: заказ находится вебхуком по merch_order_id из metadata, а не по
      // stripe_session_id. Потерянная запись session_id это только более слабая защита
      // уникальным индексом, а не потерянные деньги.
      if (updateError) console.error('merch checkout: не удалось записать stripe_session_id', updateError)
    }

    return { ok: true, url: json.url }
  } catch (err) {
    console.error('merch checkout: Stripe threw', err)
    return { ok: false, error: 'failed' }
  }
}

export type MerchOrdersError = 'unauthenticated' | 'failed'
export type MerchOrdersResult =
  | { readonly ok: true; readonly data: readonly MerchOrderView[] }
  | { readonly ok: false; readonly error: MerchOrdersError }

interface MerchOrderRow {
  readonly id: string
  readonly product: MerchProductId
  readonly size: MerchSize
  readonly retail_cents: number
  readonly status: string
  readonly created_at: string
  readonly print_path: string
  readonly ship_email: string | null
}

const MERCH_ORDER_VISIBLE_STATUSES: readonly MerchOrderStatus[] = ['paid', 'draft_created', 'failed', 'cancelled']

/**
 * Чтение своих заказов (§7 спеки merch-orders.md). Клиент под пользовательской
 * сессией, не service-role: RLS-политика merch_orders_select_own уже отдаёт
 * только строки текущего пользователя, ровно как в listProjectsAction
 * (app/actions/projects.ts). pending_payment не выбираем: строка в этом
 * статусе значит только «человек нажал Купить», половина таких - брошенные
 * корзины (§5.2), и пугать ими человека нечестно.
 */
export async function readMerchOrdersAction(): Promise<MerchOrdersResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const sb = await getSupabaseServer()
  const { data, error } = await sb
    .from('merch_orders')
    .select('id, product, size, retail_cents, status, created_at, print_path, ship_email')
    .in('status', MERCH_ORDER_VISIBLE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error || !data) {
    console.error('merch orders: чтение упало', error)
    return { ok: false, error: 'failed' }
  }

  const rows = data as unknown as MerchOrderRow[]
  return {
    ok: true,
    data: rows.map((row) => {
      const { data: publicUrlData } = sb.storage.from(MERCH_PRINTS_BUCKET).getPublicUrl(row.print_path)
      return {
        id: row.id,
        product: row.product,
        size: row.size,
        retailCents: row.retail_cents,
        status: row.status as MerchOrderStatus,
        createdAt: row.created_at,
        printUrl: publicUrlData.publicUrl || null,
        shipEmail: row.ship_email,
      }
    }),
  }
}
