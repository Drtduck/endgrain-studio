'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { APP_ORIGIN } from '@/lib/routing/host'
import type { CheckoutResult } from '@/lib/stripe/billing'
import { STRIPE_SECRET_KEY, isStripeConfigured } from '@/lib/stripe/config'
import { priceIdFor } from '@/lib/stripe/plans'
import { getProStatus } from '@/lib/stripe/pro'
import { getCurrentUser } from '@/lib/supabase/session'

const planSchema = z.enum(['monthly', 'yearly'])

/**
 * Checkout Session через REST Stripe, без SDK: один POST с form-encoded телом
 * не стоит трёх мегабайт зависимости (тот же довод, что и в app/actions/subscribe.ts).
 * Карточные данные мы не видим никогда, оплата целиком на hosted-странице Stripe.
 */
export async function createCheckoutAction(plan: unknown): Promise<CheckoutResult> {
  const parsed = planSchema.safeParse(plan)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  if (!isStripeConfigured()) return { ok: false, error: 'disabled' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  // Второй чек-аут поверх активной подписки создал бы вторую подписку и двойное списание.
  const status = await getProStatus()
  if (status.reason === 'subscription') return { ok: false, error: 'already' }

  // Origin из запроса, а не жёстко зашитый APP_ORIGIN: иначе с localhost
  // после оплаты уводило бы на прод.
  const headerList = await headers()
  const origin = headerList.get('origin') ?? APP_ORIGIN

  const body = new URLSearchParams({
    mode: 'subscription',
    'line_items[0][price]': priceIdFor(parsed.data),
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
