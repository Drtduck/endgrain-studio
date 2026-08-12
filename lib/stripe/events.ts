import { z } from 'zod'
import { planForPriceId, type PlanId } from './plans'

export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

export interface SubscriptionUpsert {
  readonly userId: string
  readonly customerId: string
  readonly subscriptionId: string
  readonly priceId: string
  readonly plan: PlanId
  readonly status: SubscriptionStatus
  /** ISO-строка или null, если Stripe не прислал период (см. раздел про версию API в спеке). */
  readonly currentPeriodEnd: string | null
  readonly cancelAtPeriodEnd: boolean
  /** event.created в ISO: защита от применения устаревшего события поверх свежего. */
  readonly eventAt: string
}

/** Обрабатываем ровно три типа. checkout.session.completed сознательно не нужен: */
/** идентификатор пользователя приезжает в каждом событии подписки через */
/** subscription_data[metadata][supabase_user_id], выставленный при создании сессии. */
const HANDLED_TYPES: readonly string[] = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]

const statusSchema = z.enum([
  'trialing',
  'active',
  'past_due',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'unpaid',
  'paused',
])

/** customer приезжает то строкой, то развёрнутым объектом: зависит от expand в аккаунте. */
const referenceSchema = z.union([z.string(), z.object({ id: z.string() })])

const itemSchema = z.object({
  price: z.object({ id: z.string() }).optional(),
  current_period_start: z.number().nullish(),
  current_period_end: z.number().nullish(),
})

const subscriptionSchema = z.object({
  id: z.string(),
  customer: referenceSchema,
  status: statusSchema,
  cancel_at_period_end: z.boolean().optional(),
  current_period_end: z.number().nullish(),
  metadata: z.object({ supabase_user_id: z.string().optional() }).nullish(),
  items: z.object({ data: z.array(itemSchema) }).optional(),
})

const eventSchema = z.object({
  type: z.string(),
  created: z.number().optional(),
  data: z.object({ object: subscriptionSchema }),
})

function refId(value: string | { id: string }): string {
  return typeof value === 'string' ? value : value.id
}

/**
 * Возвращает null для всего, что нас не касается: чужих типов событий,
 * подписок без metadata.supabase_user_id, битого JSON.
 * Null это не ошибка: роут отвечает 200, иначе Stripe будет ретраить вечно.
 */
export function parseSubscriptionEvent(raw: unknown): SubscriptionUpsert | null {
  const parsed = eventSchema.safeParse(raw)
  if (!parsed.success) return null
  const event = parsed.data
  if (!HANDLED_TYPES.includes(event.type)) return null

  const subscription = event.data.object
  const userId = subscription.metadata?.supabase_user_id ?? ''
  if (userId.length === 0) return null

  // В API-версии 2025-03-31.basil период переехал с подписки на её элементы.
  // Заголовок Stripe-Version мы не шлём, значит терпим обе формы и отсутствие обеих.
  const item = subscription.items?.data[0]
  const periodEndSec = item?.current_period_end ?? subscription.current_period_end ?? null
  const priceId = item?.price?.id ?? ''

  return {
    userId,
    customerId: refId(subscription.customer),
    subscriptionId: subscription.id,
    priceId,
    // Неизвестный price id не повод оставить заплатившего человека без Pro:
    // пишем 'monthly' и активируем подписку, расхождение видно в логе и в price_id.
    plan: planForPriceId(priceId) ?? 'monthly',
    status: subscription.status,
    currentPeriodEnd: periodEndSec === null ? null : new Date(periodEndSec * 1000).toISOString(),
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
    // Без created берём текущее время, а не эпоху: 1970 год сделал бы событие
    // заведомо более старым, чем любая уже сохранённая отметка, и вебхук молча
    // отвечал бы stale на каждое такое событие вместо того, чтобы его применить.
    eventAt: new Date(event.created === undefined ? Date.now() : event.created * 1000).toISOString(),
  }
}
