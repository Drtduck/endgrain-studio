import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * createPackCheckoutAction / readCreditsAction: покупка пакета кадров и чтение
 * счётчика для /account/billing. По образцу app/actions/billing.test.ts и
 * app/actions/wallet.ts - price_data инлайном, а не Price-объект в Stripe.
 */

let stripeConfigured = true
vi.mock('@/lib/stripe/config', () => ({
  STRIPE_SECRET_KEY: 'sk_test_1',
  isStripeConfigured: () => stripeConfigured,
}))

const getCurrentUser = vi.fn()
vi.mock('@/lib/supabase/session', () => ({
  getCurrentUser: () => getCurrentUser(),
}))

const getAiAccess = vi.fn()
vi.mock('@/lib/ai/entitlements', () => ({
  getAiAccess: () => getAiAccess(),
}))

const readCreditTransactions = vi.fn()
vi.mock('@/lib/ai/credits', () => ({
  readCreditTransactions: (userId: string) => readCreditTransactions(userId),
}))

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ origin: 'https://app.endgrain.app' })),
}))

describe('app/actions/credits createPackCheckoutAction', () => {
  beforeEach(() => {
    stripeConfigured = true
    getCurrentUser.mockReset()
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('невалидный id пакета отбивается до всякой сети: сервер не верит клиенту', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createPackCheckoutAction } = await import('./credits')

    const res = await createPackCheckoutAction('bogus-pack')

    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('касса не настроена - disabled без похода в сеть', async () => {
    stripeConfigured = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createPackCheckoutAction } = await import('./credits')

    const res = await createPackCheckoutAction('frames10')

    expect(res).toEqual({ ok: false, error: 'disabled' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('аноним не может открыть Checkout на покупку кадров', async () => {
    getCurrentUser.mockResolvedValue(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createPackCheckoutAction } = await import('./credits')

    const res = await createPackCheckoutAction('frames10')

    expect(res).toEqual({ ok: false, error: 'unauthenticated' })
  })

  it('валидный пакет создаёт Checkout Session с ценой из lib/ai/packs, не из клиента', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/pay/cs_pack' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { createPackCheckoutAction } = await import('./credits')

    const res = await createPackCheckoutAction('frames30')

    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe.com/pay/cs_pack' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = String(init.body)
    expect(body).toContain('mode=payment')
    expect(body).toContain('unit_amount%5D=500')
    expect(body).toContain('metadata%5Bkind%5D=ai_pack')
    expect(body).toContain('metadata%5Bpack_id%5D=frames30')
    expect(body).toContain('success_url=https%3A%2F%2Fapp.endgrain.app%2Faccount%2Fbilling%3Fpack%3Dsuccess')
  })

  it('Stripe вернул не ok - failed, не пятисотка', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' })
    vi.stubGlobal('fetch', fetchMock)
    const { createPackCheckoutAction } = await import('./credits')

    const res = await createPackCheckoutAction('frames10')

    expect(res).toEqual({ ok: false, error: 'failed' })
  })
})

describe('app/actions/credits readCreditsAction', () => {
  beforeEach(() => {
    getCurrentUser.mockReset()
    getAiAccess.mockReset()
    readCreditTransactions.mockReset()
  })

  it('анониму отдаёт пустой счётчик без похода в базу', async () => {
    getCurrentUser.mockResolvedValue(null)
    const { readCreditsAction } = await import('./credits')

    const res = await readCreditsAction()

    expect(res).toEqual({ credits: 0, freeRemaining: 0, freeLimit: 0, totalRemaining: 0, transactions: [] })
    expect(getAiAccess).not.toHaveBeenCalled()
  })

  it('вошедшему считает из getAiAccess - той же арифметики, что и в шапке аккаунта', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
    getAiAccess.mockResolvedValue({
      state: 'credits',
      limit: 3,
      used: 3,
      freeRemaining: 0,
      credits: 7,
      remaining: 7,
      tier: 'credits',
    })
    readCreditTransactions.mockResolvedValue([])
    const { readCreditsAction } = await import('./credits')

    const res = await readCreditsAction()

    expect(res).toEqual({ credits: 7, freeRemaining: 0, freeLimit: 3, totalRemaining: 7, transactions: [] })
  })
})
