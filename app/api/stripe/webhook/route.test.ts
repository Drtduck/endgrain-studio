import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const WEBHOOK_SECRET = 'whsec_тестовый'
const PRICE_MONTHLY = 'price_monthly'

// Конфиг подменяем целиком: настоящие переменные в тестах пусты, а роут без них
// честно отвечает 503 и до логики записи не доходит.
vi.mock('@/lib/stripe/config', () => ({
  STRIPE_SECRET_KEY: 'sk_test_1',
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_MONTHLY: PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY: 'price_yearly',
  STRIPE_PORTAL_URL: '',
  isStripeConfigured: () => true,
  hasPublicPrices: () => true,
}))

const supabase = { from: vi.fn() }
vi.mock('@/lib/supabase/admin', () => ({
  isSupabaseAdminConfigured: () => true,
  getSupabaseAdmin: () => supabase,
}))

interface SbOptions {
  readonly existing?: Record<string, unknown> | null
  readonly readError?: unknown
  readonly upsertError?: unknown
}

/** Мокается только клиент Supabase: подпись считается настоящая, событие разбирается настоящим парсером. */
function mockSupabase(options: SbOptions = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: options.existing ?? null,
    error: options.readError ?? null,
  })
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null })
  supabase.from.mockReturnValue({ select, upsert })
  return { select, eq, maybeSingle, upsert }
}

const CREATED_SEC = 1_760_000_000

function eventBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'customer.subscription.created',
    created: CREATED_SEC,
    data: {
      object: {
        id: 'sub_B',
        customer: 'cus_1',
        status: 'active',
        cancel_at_period_end: false,
        metadata: { supabase_user_id: 'user-1' },
        items: { data: [{ price: { id: PRICE_MONTHLY }, current_period_end: CREATED_SEC + 2_592_000 }] },
        ...overrides,
      },
    },
  })
}

function signedRequest(body: string): Request {
  const t = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${body}`, 'utf8').digest('hex')
  return new Request('https://app.endgrain.app/api/stripe/webhook', {
    method: 'POST',
    headers: { 'stripe-signature': `t=${t},v1=${signature}` },
    body,
  })
}

describe('POST /api/stripe/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('happy path: подписка пишется апсертом и роут отвечает ok', async () => {
    const sb = mockSupabase({ existing: null })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(eventBody()))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(sb.upsert).toHaveBeenCalledTimes(1)
    const row = sb.upsert.mock.calls[0]?.[0] as Record<string, unknown>
    expect(row['user_id']).toBe('user-1')
    expect(row['stripe_subscription_id']).toBe('sub_B')
    expect(row['plan']).toBe('monthly')
    expect(row['status']).toBe('active')
    expect(sb.upsert.mock.calls[0]?.[1]).toEqual({ onConflict: 'user_id' })
  })

  it('ошибка чтения last_event_at даёт 500 и ничего не пишет', async () => {
    const sb = mockSupabase({ readError: { message: 'connection reset' } })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(eventBody()))

    expect(res.status).toBe(500)
    expect(sb.upsert).not.toHaveBeenCalled()
  })

  it('чужой subscription_id поверх живой подписки даёт 500, а не потерю события', async () => {
    // created по новой подписке B может обогнать deleted по старой A. Ответить 200
    // значит потерять B навсегда, поэтому просим Stripe повторить доставку.
    const sb = mockSupabase({
      existing: { last_event_at: new Date((CREATED_SEC - 100) * 1000).toISOString(), stripe_subscription_id: 'sub_A', status: 'active' },
    })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(eventBody()))

    expect(res.status).toBe(500)
    expect(await res.text()).toBe('foreign subscription')
    expect(sb.upsert).not.toHaveBeenCalled()
  })

  it('чужой subscription_id поверх отменённой подписки применяется', async () => {
    const sb = mockSupabase({
      existing: { last_event_at: new Date((CREATED_SEC - 100) * 1000).toISOString(), stripe_subscription_id: 'sub_A', status: 'canceled' },
    })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(eventBody()))

    expect(res.status).toBe(200)
    expect(sb.upsert).toHaveBeenCalledTimes(1)
  })

  it('устаревшее событие отбрасывается с 200 и не пишется', async () => {
    const sb = mockSupabase({
      existing: { last_event_at: new Date((CREATED_SEC + 100) * 1000).toISOString(), stripe_subscription_id: 'sub_B', status: 'active' },
    })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(eventBody()))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('stale')
    expect(sb.upsert).not.toHaveBeenCalled()
  })

  it('ошибка записи даёт 500: Stripe переотправит', async () => {
    mockSupabase({ upsertError: { message: 'constraint violation' } })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(eventBody()))
    expect(res.status).toBe(500)
  })

  it('битая подпись даёт 400 и не ходит в базу', async () => {
    const sb = mockSupabase()
    const { POST } = await import('./route')
    const body = eventBody()
    const request = new Request('https://app.endgrain.app/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${Math.floor(Date.now() / 1000)},v1=deadbeef` },
      body,
    })

    const res = await POST(request)

    expect(res.status).toBe(400)
    expect(supabase.from).not.toHaveBeenCalled()
    expect(sb.upsert).not.toHaveBeenCalled()
  })

  it('чужое событие без metadata отвечает 200 ignored и не пишется', async () => {
    const sb = mockSupabase()
    const { POST } = await import('./route')

    const res = await POST(signedRequest(eventBody({ metadata: {} })))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ignored')
    expect(sb.upsert).not.toHaveBeenCalled()
  })
})
