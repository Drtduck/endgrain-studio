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
  STRIPE_PRICE_API_MONTHLY: 'price_api_monthly',
  STRIPE_PRICE_API_YEARLY: 'price_api_yearly',
  STRIPE_PRICE_PASS: 'price_pass',
  STRIPE_PRO_DEFAULT_PRICE: 'yearly',
  STRIPE_PORTAL_URL: '',
  isStripeConfigured: () => true,
  hasPublicPrices: () => true,
  hasApiPrices: () => true,
  hasPassPrice: () => true,
}))

const supabase = { from: vi.fn(), rpc: vi.fn() }
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
  // Прочтение существующей строки идёт .eq('user_id', ...).eq('product', ...).maybeSingle():
  // второй .eq возвращает объект с maybeSingle, первый - объект со вторым .eq.
  const eq2 = vi.fn().mockReturnValue({ maybeSingle })
  const eq = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq })
  const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null })
  supabase.from.mockReturnValue({ select, upsert })
  return { select, eq, eq2, maybeSingle, upsert }
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
    expect(row['product']).toBe('pro')
    expect(sb.upsert.mock.calls[0]?.[1]).toEqual({ onConflict: 'user_id,product' })
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

function topupEventBody(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'checkout.session.completed',
    created: CREATED_SEC,
    data: {
      object: {
        id: 'cs_1',
        mode: 'payment',
        payment_status: 'paid',
        amount_total: 500,
        currency: 'usd',
        metadata: { supabase_user_id: 'user-1', kind: 'wallet_topup' },
        ...overrides,
      },
    },
  })
}

describe('POST /api/stripe/webhook: разовый платёж', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('пополнение с валидной подписью зовёт wallet_topup с p_ref = session.id', async () => {
    mockSupabase()
    supabase.rpc.mockResolvedValue({ data: 500, error: null })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(topupEventBody()))

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(supabase.rpc).toHaveBeenCalledWith('wallet_topup', {
      p_user_id: 'user-1',
      p_amount: 500,
      p_ref: 'cs_1',
    })
  })

  it('повторная доставка того же события отвечает 200, а не 500 (идемпотентность в SQL)', async () => {
    mockSupabase()
    supabase.rpc.mockResolvedValue({ data: 500, error: null })
    const { POST } = await import('./route')

    const first = await POST(signedRequest(topupEventBody()))
    const second = await POST(signedRequest(topupEventBody()))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(supabase.rpc).toHaveBeenCalledTimes(2)
  })

  it('ошибка базы при пополнении даёт 500: Stripe переотправит', async () => {
    mockSupabase()
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(topupEventBody()))
    expect(res.status).toBe(500)
  })

  it('событие подписки после новой ветки обрабатывается как раньше (регрессия)', async () => {
    const sb = mockSupabase({ existing: null })
    const { POST } = await import('./route')

    const res = await POST(signedRequest(eventBody()))

    expect(res.status).toBe(200)
    expect(sb.upsert).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('gallery_purchase отвечает 200 и ничего не пишет', async () => {
    mockSupabase()
    const { POST } = await import('./route')

    const res = await POST(
      signedRequest(topupEventBody({ metadata: { supabase_user_id: 'user-1', kind: 'gallery_purchase', published_id: 'pub-1' } })),
    )

    expect(res.status).toBe(200)
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('pro_pass зовёт grant_pro_pass с p_days = 90 и p_ref = session.id', async () => {
    mockSupabase()
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    const { POST } = await import('./route')

    const res = await POST(
      signedRequest(topupEventBody({ metadata: { supabase_user_id: 'user-1', kind: 'pro_pass' }, amount_total: 1900 })),
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(supabase.rpc).toHaveBeenCalledWith('grant_pro_pass', { p_user_id: 'user-1', p_ref: 'cs_1', p_days: 90 })
  })

  it('ошибка базы при выдаче пропуска даёт 500: Stripe переотправит', async () => {
    mockSupabase()
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    const { POST } = await import('./route')

    const res = await POST(
      signedRequest(topupEventBody({ metadata: { supabase_user_id: 'user-1', kind: 'pro_pass' }, amount_total: 1900 })),
    )
    expect(res.status).toBe(500)
  })

  it('живая подписка product=api поднимает тир ключей до developer', async () => {
    const sb = mockSupabase({ existing: null })
    supabase.rpc.mockResolvedValue({ error: null })
    const { POST } = await import('./route')

    const res = await POST(
      signedRequest(
        eventBody({
          items: { data: [{ price: { id: 'price_api_yearly' }, current_period_end: CREATED_SEC + 2_592_000 }] },
        }),
      ),
    )

    expect(res.status).toBe(200)
    expect(sb.upsert.mock.calls[0]?.[0]).toMatchObject({ product: 'api' })
    expect(supabase.rpc).toHaveBeenCalledWith('set_api_tier', { p_user_id: 'user-1', p_tier: 'developer' })
  })

  it('отменённая подписка product=api опускает тир ключей до free', async () => {
    const sb = mockSupabase({ existing: null })
    supabase.rpc.mockResolvedValue({ error: null })
    const { POST } = await import('./route')

    const res = await POST(
      signedRequest(
        eventBody({
          status: 'canceled',
          items: { data: [{ price: { id: 'price_api_yearly' }, current_period_end: CREATED_SEC + 2_592_000 }] },
        }),
      ),
    )

    expect(res.status).toBe(200)
    expect(sb.upsert.mock.calls[0]?.[0]).toMatchObject({ product: 'api' })
    expect(supabase.rpc).toHaveBeenCalledWith('set_api_tier', { p_user_id: 'user-1', p_tier: 'free' })
  })
})
