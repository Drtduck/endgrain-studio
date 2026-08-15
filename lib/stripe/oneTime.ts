import { z } from 'zod'

/**
 * Разбор разового платежа (Stripe Checkout mode=payment). Файл чистый, без сети,
 * тестируется напрямую, ровно как ./events.ts для подписок.
 *
 * Пополнение кошелька и покупка проекта из галереи (фаза 2) обслуживаются одним
 * механизмом: событие checkout.session.completed на том же эндпойнте вебхука,
 * различает сценарии metadata.kind. Инварианты подписочной ветки (last_event_at,
 * защита от чужой подписки поверх живой) сюда неприменимы: у разового платежа
 * нет состояния, которое можно откатить, идемпотентность даёт уникальный индекс
 * (kind, ref) в public.wallet_transactions / stripe_session_id в project_purchases.
 */

export type OneTimeKind = 'wallet_topup' | 'gallery_purchase' | 'pro_pass' | 'ai_pack' | 'merch'

/**
 * Адрес доставки и контакты покупателя для заказа мерча (§6.1, §6.3 спеки).
 * Строки, а не null у отсутствующих полей: undefined/null внутри Stripe-объекта
 * нормализуются в null здесь же, чтобы lib/merch/recipient.ts работал с одной
 * формой пустоты.
 */
export interface OneTimeShipping {
  readonly name: string | null
  readonly line1: string | null
  readonly line2: string | null
  readonly city: string | null
  readonly state: string | null
  readonly postalCode: string | null
  readonly country: string | null
  readonly email: string | null
  readonly phone: string | null
}

export interface OneTimePayment {
  readonly kind: OneTimeKind
  readonly userId: string
  readonly sessionId: string
  /** Целое число центов. Берётся из amount_total события, а не из metadata клиента. */
  readonly amountCents: number
  readonly currency: string
  readonly eventAt: string
  /** Только для gallery_purchase: какая публикация куплена. */
  readonly publishedId: string | null
  /** Только для ai_pack: какой пакет кадров куплен. */
  readonly packId: string | null
  /** Только для merch: id строки merch_orders. */
  readonly merchOrderId: string | null
  /** Только для merch: адрес доставки, если он вообще пришёл в событии. */
  readonly shipping: OneTimeShipping | null
}

const kindSchema = z.enum(['wallet_topup', 'gallery_purchase', 'pro_pass', 'ai_pack', 'merch'])

/**
 * Адрес доставки лежит по разным путям в разных версиях Stripe API: в старых
 * это session.shipping_details, в новых session.collected_information.shipping_details
 * (§6.1). Схема принимает оба, парсер берёт первый непустой.
 */
const shippingDetailsSchema = z
  .object({
    name: z.string().nullish(),
    address: z
      .object({
        line1: z.string().nullish(),
        line2: z.string().nullish(),
        city: z.string().nullish(),
        state: z.string().nullish(),
        postal_code: z.string().nullish(),
        country: z.string().nullish(),
      })
      .nullish(),
  })
  .nullish()

const sessionSchema = z.object({
  id: z.string(),
  mode: z.string(),
  payment_status: z.string(),
  amount_total: z.number().nullish(),
  currency: z.string().nullish(),
  metadata: z
    .object({
      supabase_user_id: z.string().optional(),
      kind: z.string().optional(),
      published_id: z.string().optional(),
      pack_id: z.string().optional(),
      merch_order_id: z.string().optional(),
    })
    .nullish(),
  shipping_details: shippingDetailsSchema,
  collected_information: z.object({ shipping_details: shippingDetailsSchema }).nullish(),
  customer_details: z
    .object({
      email: z.string().nullish(),
      phone: z.string().nullish(),
      name: z.string().nullish(),
    })
    .nullish(),
})

type SessionShippingDetails = z.infer<typeof shippingDetailsSchema>
type SessionData = z.infer<typeof sessionSchema>

function nullify(value: string | null | undefined): string | null {
  return value === null || value === undefined || value.trim().length === 0 ? null : value
}

/**
 * Собирает адрес и контакты из сессии для merch. Первый непустой источник
 * побеждает: новый collected_information, иначе старый shipping_details.
 * customer_details даёт email/телефон и (в редком случае) имя, если его нет
 * в самом shipping_details.
 */
function shippingFrom(session: SessionData): OneTimeShipping {
  const details: SessionShippingDetails = session.collected_information?.shipping_details ?? session.shipping_details ?? null
  const address = details?.address ?? null
  return {
    name: nullify(details?.name) ?? nullify(session.customer_details?.name),
    line1: nullify(address?.line1),
    line2: nullify(address?.line2),
    city: nullify(address?.city),
    state: nullify(address?.state),
    postalCode: nullify(address?.postal_code),
    country: nullify(address?.country),
    email: nullify(session.customer_details?.email),
    phone: nullify(session.customer_details?.phone),
  }
}

const eventSchema = z.object({
  type: z.string(),
  created: z.number().optional(),
  data: z.object({ object: sessionSchema }),
})

/**
 * Возвращает null для всего, что не разовый платёж пополнения или покупки:
 * подписочный checkout (тут его вовсе не заводят), неоплаченная сессия, чужая
 * валюта, отсутствие supabase_user_id. Null не ошибка: роут отвечает 200, дальше
 * пробует разобрать как событие подписки parseSubscriptionEvent.
 */
export function parseOneTimeEvent(raw: unknown): OneTimePayment | null {
  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) return null
  const event = parsed.data
  if (event.type !== 'checkout.session.completed') return null

  const session = event.data.object
  if (session.mode !== 'payment') return null
  if (session.payment_status !== 'paid') return null

  const userId = session.metadata?.supabase_user_id ?? ''
  if (userId.length === 0) return null

  const kindParsed = kindSchema.safeParse(session.metadata?.kind)
  if (!kindParsed.success) return null

  const currency = session.currency ?? ''
  if (currency !== 'usd') return null

  const amountCents = session.amount_total
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) return null

  return {
    kind: kindParsed.data,
    userId,
    sessionId: session.id,
    amountCents,
    currency,
    eventAt: new Date(event.created === undefined ? Date.now() : event.created * 1000).toISOString(),
    publishedId: session.metadata?.published_id ?? null,
    packId: session.metadata?.pack_id ?? null,
    merchOrderId: session.metadata?.merch_order_id ?? null,
    shipping: kindParsed.data === 'merch' ? shippingFrom(session) : null,
  }
}
