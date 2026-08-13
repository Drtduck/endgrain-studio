'use server'

import { headers } from 'next/headers'
import { APP_ORIGIN } from '@/lib/routing/host'
import { STRIPE_SECRET_KEY, isStripeConfigured } from '@/lib/stripe/config'
import { getCurrentUser } from '@/lib/supabase/session'
import { isWalletPreset, type WalletPreset } from '@/lib/wallet/format'
import { readWallet, readWalletTransactions, type WalletState, type WalletTransactionRow } from '@/lib/wallet/server'

export type WalletCheckoutResult = { readonly ok: true; readonly url: string } | { readonly ok: false; readonly error: WalletCheckoutError }

export type WalletCheckoutError = 'invalid' | 'disabled' | 'unauthenticated' | 'failed'

/**
 * Checkout Session через REST Stripe, mode=payment, ровно как createCheckoutAction
 * в app/actions/billing.ts, но без Price-объекта: сумма пресета известна на сервере,
 * поэтому берём price_data инлайном, а не заводим три Price в Stripe заранее.
 * Это не открывает произвольную сумму: preset проверен zod-подобным гвардом
 * isWalletPreset и не читается из тела запроса как число.
 */
export async function createTopUpCheckoutAction(preset: unknown): Promise<WalletCheckoutResult> {
  if (!isWalletPreset(preset)) return { ok: false, error: 'invalid' }
  if (!isStripeConfigured()) return { ok: false, error: 'disabled' }

  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const headerList = await headers()
  const origin = headerList.get('origin') ?? APP_ORIGIN

  const amount: WalletPreset = preset

  const body = new URLSearchParams({
    mode: 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amount),
    'line_items[0][price_data][product_data][name]': `Endgrain App: пополнение кошелька $${(amount / 100).toFixed(2)}`,
    success_url: `${origin}/?wallet=success`,
    cancel_url: `${origin}/?wallet=cancel`,
    client_reference_id: user.id,
    customer_email: user.email,
    'metadata[supabase_user_id]': user.id,
    'metadata[kind]': 'wallet_topup',
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
      console.error('wallet checkout failed', res.status, await res.text())
      return { ok: false, error: 'failed' }
    }
    const json = (await res.json()) as { url?: unknown }
    if (typeof json.url !== 'string' || json.url.length === 0) {
      console.error('wallet checkout returned no url')
      return { ok: false, error: 'failed' }
    }
    return { ok: true, url: json.url }
  } catch (err) {
    console.error('wallet checkout threw', err)
    return { ok: false, error: 'failed' }
  }
}

export interface WalletView {
  readonly balanceCents: number
  readonly transactions: readonly WalletTransactionRow[]
}

/** Чтение для панели: анониму и без Supabase отдаём нулевой баланс, не 500. */
export async function readWalletAction(): Promise<WalletView> {
  const user = await getCurrentUser()
  if (!user) return { balanceCents: 0, transactions: [] }
  const [wallet, transactions]: [WalletState, readonly WalletTransactionRow[]] = await Promise.all([
    readWallet(user.id),
    readWalletTransactions(user.id),
  ])
  return { balanceCents: wallet.balanceCents, transactions }
}
