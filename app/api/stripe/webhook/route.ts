import { aiPack, isAiPackId } from '@/lib/ai/packs'
import { parseSubscriptionEvent } from '@/lib/stripe/events'
import { parseOneTimeEvent } from '@/lib/stripe/oneTime'
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
async function handleOneTime(payment: import('@/lib/stripe/oneTime').OneTimePayment): Promise<Response> {
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
