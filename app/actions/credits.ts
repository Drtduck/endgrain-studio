'use server'

import { headers } from 'next/headers'
import { getAiAccess } from '@/lib/ai/entitlements'
import { readCreditTransactions, type CreditTransactionRow } from '@/lib/ai/credits'
import { aiPack, isAiPackId } from '@/lib/ai/packs'
import type { AiAccess } from '@/lib/ai/quota'
import { APP_ORIGIN } from '@/lib/routing/host'
import { STRIPE_SECRET_KEY, isStripeConfigured } from '@/lib/stripe/config'
import { getCurrentUser } from '@/lib/supabase/session'

export type PackCheckoutError = 'invalid' | 'disabled' | 'unauthenticated' | 'failed'
export type PackCheckoutResult = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly error: PackCheckoutError }

/** Пакет кадров. Отдельный Product в Stripe не нужен: price_data инлайном, как в createTopUpCheckoutAction. */
export async function createPackCheckoutAction(packId: unknown): Promise<PackCheckoutResult> {
  if (!isAiPackId(packId)) return { ok: false, error: 'invalid' }
  if (!isStripeConfigured()) return { ok: false, error: 'disabled' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const headerList = await headers()
  const origin = headerList.get('origin') ?? APP_ORIGIN

  const pack = aiPack(packId)

  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(pack.priceCents),
    'line_items[0][price_data][product_data][name]': `Endgrain App: ${pack.frames} кадров AI`,
    success_url: `${origin}/account/billing?pack=success`,
    cancel_url: `${origin}/account/billing?pack=cancel`,
    client_reference_id: user.id,
    customer_email: user.email,
    'metadata[supabase_user_id]': user.id,
    'metadata[kind]': 'ai_pack',
    'metadata[pack_id]': pack.id,
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
      console.error('ai pack checkout failed', res.status, await res.text())
      return { ok: false, error: 'failed' }
    }
    const json = (await res.json()) as { url?: unknown }
    if (typeof json.url !== 'string' || json.url.length === 0) {
      console.error('ai pack checkout returned no url')
      return { ok: false, error: 'failed' }
    }
    return { ok: true, url: json.url }
  } catch (err) {
    console.error('ai pack checkout threw', err)
    return { ok: false, error: 'failed' }
  }
}

/**
 * Свежий остаток кадров для интерфейса. ProProvider отдаёт снапшот, посчитанный
 * серверным layout один раз на загрузку страницы, и после генерации счётчик под
 * кнопкой врал ровно на списанное (баг ручной приёмки 15.08.2026: «Осталось 7
 * кадров» при двух на балансе). Клиент перечитывает остаток этим действием
 * сразу после списания, не перезагружая страницу.
 */
export async function readAiAccessAction(): Promise<AiAccess> {
  return await getAiAccess()
}

export interface CreditsView {
  readonly credits: number
  readonly freeRemaining: number
  readonly freeLimit: number
  readonly totalRemaining: number
  readonly transactions: readonly CreditTransactionRow[]
}

const EMPTY_VIEW: CreditsView = { credits: 0, freeRemaining: 0, freeLimit: 0, totalRemaining: 0, transactions: [] }

/**
 * Чтение для панели покупки: анониму и без Supabase отдаём нулевые значения,
 * не 500. Счётчик переиспользует getAiAccess - ту же арифметику, что и
 * ProProvider/layout, чтобы «осталось кадров» на /account/billing никогда не
 * разошлось с числом в шапке аккаунта.
 */
export async function readCreditsAction(): Promise<CreditsView> {
  const user = await getCurrentUser()
  if (!user) return EMPTY_VIEW

  const [access, transactions] = await Promise.all([getAiAccess(), readCreditTransactions(user.id)])

  return {
    credits: access.credits,
    freeRemaining: access.freeRemaining,
    freeLimit: access.limit,
    totalRemaining: access.remaining,
    transactions,
  }
}
