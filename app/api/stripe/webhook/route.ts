import { aiPack, isAiPackId } from '@/lib/ai/packs'
import { PRINTFUL_CONFIRM_ORDERS } from '@/lib/merch/config'
import { MERCH_PRINTS_BUCKET } from '@/lib/merch/print'
import { createPrintfulOrder, type PrintfulOrderOutcome } from '@/lib/merch/printfulOrder'
import { recipientFrom } from '@/lib/merch/recipient'
import { PRINTFUL_API_KEY, PRINTFUL_STORE_ID } from '@/lib/promo/config'
import type { PrintfulAuth } from '@/lib/promo/printful'
import type { MerchProductId } from '@/lib/promo/types'
import { parseSubscriptionEvent } from '@/lib/stripe/events'
import { parseOneTimeEvent, type OneTimePayment } from '@/lib/stripe/oneTime'
import { STRIPE_WEBHOOK_SECRET, isStripeConfigured } from '@/lib/stripe/config'
import { verifyStripeSignature } from '@/lib/stripe/signature'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase/admin'

// node:crypto и сырое тело запроса: edge-рантайм не подходит.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Статусы, при которых сохранённая подписка считается живой и её нельзя перетереть чужой. */
const LIVE_STATUSES: readonly string[] = ['active', 'trialing', 'past_due']

/** Потолок попыток заказа Printful (§6.2 спеки): дальше разбирается человек, а не Stripe-ретрай. */
const MAX_PRINTFUL_ATTEMPTS = 5

interface MerchOrderRow {
  readonly id: string
  readonly user_id: string
  readonly product: MerchProductId
  readonly variant_id: number
  readonly print_path: string
  readonly retail_cents: number
  readonly printful_order_id: string | null
  readonly printful_attempts: number
  readonly status: 'pending_payment' | 'paid' | 'draft_created' | 'failed' | 'cancelled'
}

/** Ответ всегда короткий текст: никакого JSON и никакого эха события наружу. */
function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

/**
 * Разовый платёж. wallet_topup зовёт SQL-функцию под service-role: она сама
 * идемпотентна по (kind, ref), поэтому повторная доставка того же события просто
 * вернёт текущий баланс, не увеличив его дважды.
 *
 * gallery_purchase (фаза 2 спеки docs/superpowers/specs/2026-08-13-commerce-social-design.md):
 * пишет строку в project_purchases под service-role - единственный писатель этой таблицы,
 * у клиентских ролей политик insert нет вовсе (см. миграцию 20260813100000_gallery.sql).
 * Идемпотентность даёт уникальный индекс purchases_session_idx по stripe_session_id:
 * upsert с ignoreDuplicates на повторной доставке не создаёт вторую строку и не роняет ответ.
 * Доступ к design открывает published_project_design() сама, по наличию этой строки -
 * никакого отдельного «разблокирования» тут делать не нужно.
 */
/**
 * Заказ мерча (§6.2, §6.4 спеки merch-orders.md). Три рубежа идемпотентности:
 * stripe_session_id unique в таблице, условный update where status='pending_payment'
 * на переводе в paid, и external_id = наш order.id в самом Printful (ветка 'exists'
 * из createPrintfulOrder). Порядок шагов жёсткий и весь про «не потерять деньги»:
 * 4xx Printful это «мы прислали ерунду» -> failed + 200 (ретрай не поможет),
 * 5xx/таймаут это «у них не работает» -> 500 (Stripe переотправит около трёх суток).
 */
async function handleMerchOrder(payment: OneTimePayment): Promise<Response> {
  const merchOrderId = payment.merchOrderId
  if (merchOrderId === null) {
    // Сессия создана не нашим action (либо испорченные metadata): ретраить бессмысленно.
    console.error('stripe webhook: merch без merch_order_id', { sessionId: payment.sessionId })
    return text('ok', 200)
  }

  const sb = getSupabaseAdmin()
  const { data: order, error: readError } = await sb
    .from('merch_orders')
    .select('id, user_id, product, variant_id, print_path, retail_cents, printful_order_id, printful_attempts, status')
    .eq('id', merchOrderId)
    .maybeSingle<MerchOrderRow>()
  if (readError) {
    console.error('stripe webhook: merch чтение заказа упало', readError)
    return text('read failed', 500)
  }
  if (!order) {
    // Строку не создали (упавший server action) или её снесли руками: чинить нечего.
    console.warn('stripe webhook: merch заказ не найден', { merchOrderId })
    return text('ok', 200)
  }
  if (order.user_id !== payment.userId) {
    // Подделка metadata на чужую сессию: печатать нельзя ни в коем случае.
    console.error('stripe webhook: merch чужой user_id', { merchOrderId, orderUser: order.user_id, paymentUser: payment.userId })
    return text('ok', 200)
  }
  if (order.retail_cents !== payment.amountCents) {
    console.error('stripe webhook: merch сумма разошлась', { merchOrderId, retail: order.retail_cents, paid: payment.amountCents })
    return text('ok', 200)
  }

  // Повторная доставка событий по уже доведённому или отменённому заказу: всё уже сделано.
  if (order.status === 'draft_created' || order.status === 'cancelled') return text('ok', 200)

  if (order.status === 'pending_payment') {
    const shipping = payment.shipping
    const { error: paidError } = await sb
      .from('merch_orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        ship_name: shipping?.name ?? null,
        ship_address1: shipping?.line1 ?? null,
        ship_address2: shipping?.line2 ?? null,
        ship_city: shipping?.city ?? null,
        ship_state: shipping?.state ?? null,
        ship_country: shipping?.country ?? null,
        ship_zip: shipping?.postalCode ?? null,
        ship_email: shipping?.email ?? null,
        ship_phone: shipping?.phone ?? null,
      })
      // Условный update: повторная доставка события не перезапишет уже продвинутый
      // статус и не сдвинет paid_at (§6.4, п.2).
      .eq('id', merchOrderId)
      .eq('status', 'pending_payment')
    if (paidError) {
      console.error('stripe webhook: merch запись paid упала', paidError)
      return text('write failed', 500)
    }
  } else if (order.status === 'failed' && order.printful_attempts >= MAX_PRINTFUL_ATTEMPTS) {
    // Потолок попыток исчерпан прошлыми доставками: дальше разбирается человек руками.
    return text('ok', 200)
  }

  const recipient = recipientFrom(payment.shipping)
  if (recipient === null) {
    // Без адреса печатать физически некуда, а ретраить нечего: адрес больше не появится.
    const { error } = await sb.from('merch_orders').update({ status: 'failed', last_error: 'no shipping address' }).eq('id', merchOrderId)
    if (error) console.error('stripe webhook: merch запись failed(no address) упала', error)
    return text('ok', 200)
  }

  const { data: publicUrlData } = sb.storage.from(MERCH_PRINTS_BUCKET).getPublicUrl(order.print_path)
  const printFileUrl = publicUrlData.publicUrl
  if (!printFileUrl) {
    console.error('stripe webhook: merch нет публичного url print-файла', { merchOrderId })
    return text('write failed', 500)
  }

  const auth: PrintfulAuth = { apiKey: PRINTFUL_API_KEY, storeId: PRINTFUL_STORE_ID }
  let outcome: PrintfulOrderOutcome
  try {
    outcome = await createPrintfulOrder(
      {
        orderId: order.id,
        product: order.product,
        variantId: order.variant_id,
        retailCents: order.retail_cents,
        printFileUrl,
        recipient,
      },
      PRINTFUL_CONFIRM_ORDERS,
      auth,
      fetch,
    )
  } catch (err) {
    console.error('stripe webhook: merch createPrintfulOrder threw', err)
    return text('write failed', 500)
  }

  if (outcome.kind === 'created' || outcome.kind === 'exists') {
    const printfulOrderId = outcome.kind === 'created' ? outcome.printfulOrderId : (order.printful_order_id ?? 'exists')
    const { error } = await sb
      .from('merch_orders')
      .update({ status: 'draft_created', printful_order_id: printfulOrderId })
      .eq('id', merchOrderId)
    if (error) {
      console.error('stripe webhook: merch запись draft_created упала', error)
      return text('write failed', 500)
    }
    return text('ok', 200)
  }

  const nextAttempts = order.printful_attempts + 1

  if (outcome.kind === 'rejected') {
    // 4xx (кривые данные): мы прислали ерунду, ретрай её не исправит.
    const { error } = await sb
      .from('merch_orders')
      .update({ status: 'failed', printful_attempts: nextAttempts, last_error: outcome.message })
      .eq('id', merchOrderId)
    if (error) console.error('stripe webhook: merch запись failed(4xx) упала', error)
    return text('ok', 200)
  }

  // 5xx / таймаут / сеть: у них не работает, статус остаётся как есть (не failed),
  // пока не исчерпан потолок попыток. 500 просит Stripe переотправить событие.
  const hitCeiling = nextAttempts >= MAX_PRINTFUL_ATTEMPTS
  const { error: attemptError } = await sb
    .from('merch_orders')
    .update({ printful_attempts: nextAttempts, last_error: outcome.message, ...(hitCeiling ? { status: 'failed' } : {}) })
    .eq('id', merchOrderId)
  if (attemptError) console.error('stripe webhook: merch запись attempts упала', attemptError)

  if (hitCeiling) return text('ok', 200)
  return text('write failed', 500)
}

async function handleOneTime(payment: import('@/lib/stripe/oneTime').OneTimePayment): Promise<Response> {
  if (payment.kind === 'merch') return handleMerchOrder(payment)

  if (payment.kind === 'gallery_purchase') {
    const publishedId = payment.publishedId
    if (publishedId === null) {
      // Сессия создана не нашим action (либо испорченные metadata): ретраить
      // бессмысленно, чинить нечего.
      console.error('stripe webhook: gallery_purchase без published_id', { sessionId: payment.sessionId })
      return text('ok', 200)
    }
    try {
      const sb = getSupabaseAdmin()
      const { data: published, error: readError } = await sb
        .from('published_projects')
        .select('author_id')
        .eq('id', publishedId)
        .maybeSingle()
      if (readError) {
        console.error('stripe webhook: gallery_purchase чтение публикации упало', readError)
        return text('read failed', 500)
      }
      if (!published) {
        // Публикацию успели удалить между Checkout и вебхуком: писать чек не к чему,
        // ретрай ничего не исправит.
        console.warn('stripe webhook: gallery_purchase публикация не найдена', { publishedId })
        return text('ok', 200)
      }
      const { error: insertError } = await sb.from('project_purchases').upsert(
        {
          published_id: publishedId,
          buyer_id: payment.userId,
          author_id: published.author_id,
          price_cents: payment.amountCents,
          currency: payment.currency,
          stripe_session_id: payment.sessionId,
          status: 'paid',
        },
        { onConflict: 'stripe_session_id', ignoreDuplicates: true },
      )
      if (insertError) {
        console.error('stripe webhook: gallery_purchase запись покупки упала', insertError)
        return text('write failed', 500)
      }
    } catch (err) {
      console.error('stripe webhook: gallery_purchase threw', err)
      return text('write failed', 500)
    }
    return text('ok', 200)
  }

  // Пропуск снят с продажи 08.2026, ветка живёт ради поздних событий. Удалить после 01.11.2026.
  if (payment.kind === 'pro_pass') {
    try {
      const sb = getSupabaseAdmin()
      // Идемпотентна по stripe_session_id (on conflict do nothing) и продлевает
      // от greatest(now(), max(expires_at)) при живом пропуске - см. миграцию
      // 20260814XXXXXX_pro_passes.sql.
      const { error } = await sb.rpc('grant_pro_pass', {
        p_user_id: payment.userId,
        p_ref: payment.sessionId,
        p_days: 90,
      })
      if (error) {
        console.error('stripe webhook: grant_pro_pass failed', error)
        return text('write failed', 500)
      }
    } catch (err) {
      console.error('stripe webhook: grant_pro_pass threw', err)
      return text('write failed', 500)
    }
    return text('ok', 200)
  }

  if (payment.kind === 'ai_pack') {
    const pack = isAiPackId(payment.packId) ? aiPack(payment.packId) : null
    if (pack === null) {
      console.error('stripe webhook: ai_pack с неизвестным pack_id', { sessionId: payment.sessionId })
      return text('ok', 200) // ретрай не поможет, чинить нечего
    }
    try {
      const sb = getSupabaseAdmin()
      const { error } = await sb.rpc('ai_credits_grant', {
        p_user_id: payment.userId,
        p_frames: pack.frames,
        p_ref: payment.sessionId,
        p_kind: 'purchase',
        p_revenue_cents: payment.amountCents,
        p_meta: { pack_id: pack.id },
      })
      if (error) {
        console.error('stripe webhook: ai_credits_grant failed', error)
        return text('write failed', 500)
      }
    } catch (err) {
      console.error('stripe webhook: ai_credits_grant threw', err)
      return text('write failed', 500)
    }
    return text('ok', 200)
  }

  try {
    const sb = getSupabaseAdmin()
    const { error } = await sb.rpc('wallet_topup', {
      p_user_id: payment.userId,
      p_amount: payment.amountCents,
      p_ref: payment.sessionId,
    })
    if (error) {
      console.error('stripe webhook: wallet_topup failed', error)
      return text('write failed', 500)
    }
  } catch (err) {
    console.error('stripe webhook: wallet_topup threw', err)
    return text('write failed', 500)
  }

  return text('ok', 200)
}

export async function POST(request: Request): Promise<Response> {
  // 503, а не 200: Stripe отложит доставку и переотправит, когда ключи появятся,
  // вместо того чтобы посчитать событие принятым и потерять его.
  if (!isStripeConfigured() || !isSupabaseAdminConfigured()) return text('stripe disabled', 503)

  // Именно текст, до всякого JSON.parse: подпись считается по байтам исходного тела.
  const payload = await request.text()
  const verified = verifyStripeSignature({
    payload,
    header: request.headers.get('stripe-signature'),
    secret: STRIPE_WEBHOOK_SECRET,
  })
  if (!verified.ok) return text(verified.reason, 400)

  let raw: unknown
  try {
    raw = JSON.parse(payload)
  } catch {
    return text('bad json', 400)
  }

  // Ветка разового платежа идёт первой и не трогает подписочную: checkout.session.completed
  // в mode=payment это чужой тип для parseSubscriptionEvent (там разбирается только объект
  // подписки), поэтому порядок веток тут не создаёт двусмысленности.
  const oneTime = parseOneTimeEvent(raw)
  if (oneTime !== null) return handleOneTime(oneTime)

  const upsert = parseSubscriptionEvent(raw)
  // Событие не наше или без metadata: ретраить его бессмысленно, отвечаем 200.
  if (upsert === null) return text('ignored', 200)

  try {
    const sb = getSupabaseAdmin()

    // Защита от гонки. Stripe при ретрае может доставить created после updated,
    // и без проверки активная подписка откатилась бы в incomplete. Условие .lte()
    // в upsert не работает, поэтому сначала читаем сохранённую строку. Продукт
    // в условии: у пользователя может быть живая Pro-подписка и отдельно API,
    // и они друг друга не должны видеть как «чужую» подписку поверх живой.
    const { data: existing, error: readError } = await sb
      .from('subscriptions')
      .select('last_event_at, stripe_subscription_id, status')
      .eq('user_id', upsert.userId)
      .eq('product', upsert.product)
      .maybeSingle()
    if (readError) {
      // Молча писать поверх непрочитанной строки нельзя: именно эта строка и
      // защищает от отката. Отдаём 500, Stripe переотправит событие.
      console.error('stripe webhook read failed', readError)
      return text('read failed', 500)
    }

    const seenAt = existing?.last_event_at
    // Сравнение строгое: у event.created секундное разрешение, и два события
    // одной секунды получают одинаковый eventAt. При равенстве применяем
    // пришедшее, иначе второе событие той же секунды потерялось бы.
    if (typeof seenAt === 'string' && Date.parse(seenAt) > Date.parse(upsert.eventAt)) {
      return text('stale', 200)
    }

    // У пользователя уже есть другая живая подписка: событие по старой,
    // отменённой или задвоенной подписке не должно её перетереть. Строка одна
    // на пользователя, поэтому решаем именно здесь.
    const knownId = existing?.stripe_subscription_id
    const knownStatus = existing?.status
    if (
      typeof knownId === 'string' &&
      knownId !== upsert.subscriptionId &&
      typeof knownStatus === 'string' &&
      LIVE_STATUSES.includes(knownStatus)
    ) {
      // 500, а не 200: событие может быть created по новой подписке B, обогнавшее
      // deleted по старой A. Ответить 200 значит потерять его навсегда и оставить
      // заплатившего человека без Pro. Stripe ретраит около трёх суток, за это
      // время deleted по A применится, и повтор B пройдёт штатно.
      console.error('stripe webhook: чужая подписка поверх живой', { knownId, incoming: upsert.subscriptionId })
      return text('foreign subscription', 500)
    }

    const { error } = await sb.from('subscriptions').upsert(
      {
        user_id: upsert.userId,
        product: upsert.product,
        stripe_customer_id: upsert.customerId,
        stripe_subscription_id: upsert.subscriptionId,
        price_id: upsert.priceId,
        plan: upsert.plan,
        status: upsert.status,
        current_period_end: upsert.currentPeriodEnd,
        cancel_at_period_end: upsert.cancelAtPeriodEnd,
        last_event_at: upsert.eventAt,
      },
      { onConflict: 'user_id,product' },
    )
    if (error) {
      console.error('stripe webhook upsert failed', error)
      // 500 значит «попробуйте ещё раз»: Stripe переотправит событие.
      return text('write failed', 500)
    }

    // Подписка Developer управляет тиром ключей API: живой статус поднимает
    // все неотозванные ключи пользователя до 'developer', смерть подписки
    // возвращает их на 'free'. Ошибка здесь не 500: событие подписки уже
    // записано, а set_api_tier идемпотентна и досчитается на следующем событии.
    if (upsert.product === 'api') {
      const tier = LIVE_STATUSES.includes(upsert.status) ? 'developer' : 'free'
      const { error: tierError } = await sb.rpc('set_api_tier', { p_user_id: upsert.userId, p_tier: tier })
      if (tierError) console.error('stripe webhook: set_api_tier failed', tierError)
    }
  } catch (err) {
    console.error('stripe webhook threw', err)
    return text('write failed', 500)
  }

  return text('ok', 200)
}
