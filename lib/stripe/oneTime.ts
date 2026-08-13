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

export type OneTimeKind = 'wallet_topup' | 'gallery_purchase'

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
}

const kindSchema = z.enum(['wallet_topup', 'gallery_purchase'])

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
    })
    .nullish(),
})

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
  }
}
