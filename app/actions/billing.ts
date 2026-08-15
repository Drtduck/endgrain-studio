'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { APP_ORIGIN } from '@/lib/routing/host'
import type { CheckoutResult } from '@/lib/stripe/billing'
import { STRIPE_SECRET_KEY, hasApiPrices, isStripeConfigured } from '@/lib/stripe/config'
import { checkoutPriceFor } from '@/lib/stripe/plans'
import { getSubscriptionStatus } from '@/lib/stripe/pro'
import { getCurrentUser } from '@/lib/supabase/session'

const planSchema = z.enum(['pro', 'api'])

/**
 * Checkout Session через REST Stripe, без SDK: один POST с form-encoded телом
 * не стоит трёх мегабайт зависимости (тот же довод, что и в app/actions/subscribe.ts).
 * Карточные данные мы не видим никогда, оплата целиком на hosted-странице Stripe.
 * Две ветки, обе mode=subscription: pro и api (Developer). Тумблер месяц/год
 * живёт в Dashboard как Subscription upsell, поэтому сессия всегда стартует
 * с месячной цены (checkoutPriceFor). Продукт «Пропуск» снят с продажи
 * 08.2026: путь покупки удалён, но у купленных пропусков права сохраняются
 * (lib/stripe/pro.ts, таблица pro_passes, ветка вебхука pro_pass).
 */
export async function createCheckoutAction(plan: unknown): Promise<CheckoutResult> {
  const parsed = planSchema.safeParse(plan)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const product = parsed.data
  if (!isStripeConfigured()) return { ok: false, error: 'disabled' }
  if (product === 'api' && !hasApiPrices()) return { ok: false, error: 'disabled' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  // Второй чек-аут поверх активной подписки создал бы вторую подписку и
  // двойное списание. Спрашиваем живую строку, а не getProStatus(): при
  // аварийном флаге NEXT_PUBLIC_PRO_UNLOCK=1 причина была бы 'flag', и защита
  // бы не сработала.
  if (product === 'pro') {
    // Живой Пропуск не блокирует покупку Pro: подписка даёт больше, чем разовый
    // пропуск (автопродление), и купивший пропуск должен мочь апгрейднуться, а не
    // упереться в «already» до истечения 90 дней.
    const subscription = await getSubscriptionStatus('pro')
    if (subscription.reason === 'subscription') return { ok: false, error: 'already' }
  } else {
    const subscription = await getSubscriptionStatus('api')
    if (subscription.reason === 'subscription') return { ok: false, error: 'already' }
  }

  // Origin из запроса, а не жёстко зашитый APP_ORIGIN: иначе с localhost
  // после оплаты уводило бы на прод.
  const headerList = await headers()
  const origin = headerList.get('origin') ?? APP_ORIGIN

  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': checkoutPriceFor(product),
    'line_items[0][quantity]': '1',
    success_url: `${origin}/?checkout=success`,
    cancel_url: `${origin}/pricing?checkout=cancel`,
    client_reference_id: user.id,
    customer_email: user.email,
    'metadata[supabase_user_id]': user.id,
    // Самая важная строка файла: благодаря ей идентификатор пользователя приезжает
    // в каждом событии подписки, включая продления и отмену через полгода.
    // Поэтому вебхук одноветочный, а checkout.session.completed не нужен вовсе.
    'subscription_data[metadata][supabase_user_id]': user.id,
    'subscription_data[metadata][product]': product,
    allow_promotion_codes: 'true',
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
      // В лог уходит ответ Stripe, но никогда не ключ.
      console.error('stripe checkout failed', res.status, await res.text())
      return { ok: false, error: 'failed' }
    }
    const json = (await res.json()) as { url?: unknown }
    if (typeof json.url !== 'string' || json.url.length === 0) {
      console.error('stripe checkout returned no url')
      return { ok: false, error: 'failed' }
    }
    return { ok: true, url: json.url }
  } catch (err) {
    // Сеть моргнула или Stripe недоступен: человеку честная ошибка, а не белый экран.
    console.error('stripe checkout threw', err)
    return { ok: false, error: 'failed' }
  }
}
