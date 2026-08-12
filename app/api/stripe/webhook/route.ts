import { parseSubscriptionEvent } from '@/lib/stripe/events'
import { STRIPE_WEBHOOK_SECRET, isStripeConfigured } from '@/lib/stripe/config'
import { verifyStripeSignature } from '@/lib/stripe/signature'
import { getSupabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabase/admin'

// node:crypto и сырое тело запроса: edge-рантайм не подходит.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Статусы, при которых сохранённая подписка считается живой и её нельзя перетереть чужой. */
const LIVE_STATUSES: readonly string[] = ['active', 'trialing', 'past_due']

/** Ответ всегда короткий текст: никакого JSON и никакого эха события наружу. */
function text(body: string, status: number): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
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

  const upsert = parseSubscriptionEvent(raw)
  // Событие не наше или без metadata: ретраить его бессмысленно, отвечаем 200.
  if (upsert === null) return text('ignored', 200)

  try {
    const sb = getSupabaseAdmin()

    // Защита от гонки. Stripe при ретрае может доставить created после updated,
    // и без проверки активная подписка откатилась бы в incomplete. Условие .lte()
    // в upsert не работает, поэтому сначала читаем сохранённую строку.
    const { data: existing, error: readError } = await sb
      .from('subscriptions')
      .select('last_event_at, stripe_subscription_id, status')
      .eq('user_id', upsert.userId)
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
        stripe_customer_id: upsert.customerId,
        stripe_subscription_id: upsert.subscriptionId,
        price_id: upsert.priceId,
        plan: upsert.plan,
        status: upsert.status,
        current_period_end: upsert.currentPeriodEnd,
        cancel_at_period_end: upsert.cancelAtPeriodEnd,
        last_event_at: upsert.eventAt,
      },
      { onConflict: 'user_id' },
    )
    if (error) {
      console.error('stripe webhook upsert failed', error)
      // 500 значит «попробуйте ещё раз»: Stripe переотправит событие.
      return text('write failed', 500)
    }
  } catch (err) {
    console.error('stripe webhook threw', err)
    return text('write failed', 500)
  }

  return text('ok', 200)
}
