import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * createCheckoutAction: гвард «уже есть плата за этот продукт» перед созданием
 * Checkout Session. Основной кейс ревью - купивший разовый Пропуск не должен
 * запираться от покупки настоящей Pro-подписки (см. фикс #3 волны техдолга):
 * getSubscriptionStatus('pro') с reason='pass' обязан пропускать plan='pro'
 * дальше, к вызову Stripe, и блокировать только reason='subscription'.
 */

let stripeConfigured = true
let passPrice = 'price_pass'
vi.mock('@/lib/stripe/config', () => ({
  STRIPE_SECRET_KEY: 'sk_test_1',
  STRIPE_PRICE_PASS: 'price_pass',
  isStripeConfigured: () => stripeConfigured,
  hasApiPrices: () => true,
  hasPassPrice: () => passPrice.length > 0,
}))

vi.mock('@/lib/stripe/plans', () => ({
  checkoutPriceFor: (product: string) => (product === 'api' ? 'price_api_monthly' : 'price_pro_yearly'),
}))

const getSubscriptionStatus = vi.fn()
vi.mock('@/lib/stripe/pro', () => ({
  getSubscriptionStatus: (product?: string) => getSubscriptionStatus(product),
}))

const getCurrentUser = vi.fn()
vi.mock('@/lib/supabase/session', () => ({
  getCurrentUser: () => getCurrentUser(),
}))

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ origin: 'https://app.endgrain.app' })),
}))

function statusFree() {
  return { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }
}
function statusSubscription() {
  return { pro: true, reason: 'subscription', plan: 'yearly', currentPeriodEnd: '2026-12-01T00:00:00.000Z', cancelAtPeriodEnd: false }
}
function statusPass() {
  return { pro: true, reason: 'pass', plan: null, currentPeriodEnd: '2026-12-01T00:00:00.000Z', cancelAtPeriodEnd: true }
}

describe('app/actions/billing createCheckoutAction', () => {
  beforeEach(() => {
    stripeConfigured = true
    passPrice = 'price_pass'
    getSubscriptionStatus.mockReset()
    getCurrentUser.mockReset()
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('живой Пропуск (reason=pass) не блокирует покупку Pro', async () => {
    getSubscriptionStatus.mockResolvedValue(statusPass())
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/pay/cs_1' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { createCheckoutAction } = await import('./billing')

    const res = await createCheckoutAction('pro')

    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe.com/pay/cs_1' })
    expect(getSubscriptionStatus).toHaveBeenCalledWith('pro')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('живая подписка (reason=subscription) блокирует повторную покупку Pro', async () => {
    getSubscriptionStatus.mockResolvedValue(statusSubscription())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createCheckoutAction } = await import('./billing')

    const res = await createCheckoutAction('pro')

    expect(res).toEqual({ ok: false, error: 'already' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('без Pro (reason=free) покупка Pro проходит', async () => {
    getSubscriptionStatus.mockResolvedValue(statusFree())
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/pay/cs_2' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { createCheckoutAction } = await import('./billing')

    const res = await createCheckoutAction('pro')

    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe.com/pay/cs_2' })
  })

  it('живая Pro-подписка блокирует повторную покупку Пропуска', async () => {
    getSubscriptionStatus.mockResolvedValue(statusSubscription())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createCheckoutAction } = await import('./billing')

    const res = await createCheckoutAction('pass')

    expect(res).toEqual({ ok: false, error: 'already' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('живой Пропуск не блокирует повторную покупку/продление Пропуска', async () => {
    getSubscriptionStatus.mockResolvedValue(statusPass())
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/pay/cs_3' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { createCheckoutAction } = await import('./billing')

    const res = await createCheckoutAction('pass')

    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe.com/pay/cs_3' })
  })
})
