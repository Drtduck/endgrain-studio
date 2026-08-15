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
  STRIPE_PORTAL_URL: '',
  isStripeConfigured: () => true,
  hasPublicPrices: () => true,
  hasApiPrices: () => true,
}))

const supabase = { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } }
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

  describe('gallery_purchase', () => {
    /**
     * Отдельный мок from(): ветка покупки трогает две таблицы (published_projects
     * на чтение автора, project_purchases на запись), а mockSupabase() из блока выше
     * заточен под одну таблицу подписок и тут не подходит.
     */
    function mockPurchaseSupabase(options: { readonly published?: { author_id: string } | null; readonly readError?: unknown; readonly upsertError?: unknown } = {}) {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: options.published === undefined ? { author_id: 'author-1' } : options.published,
        error: options.readError ?? null,
      })
      // Роут читает published_projects одним .eq('id', ...) перед .maybeSingle() -
      // в отличие от подписочной ветки выше, где читают по двум .eq подряд.
      const eq = vi.fn().mockReturnValue({ maybeSingle })
      const select = vi.fn().mockReturnValue({ eq })
      const upsert = vi.fn().mockResolvedValue({ error: options.upsertError ?? null })
      supabase.from.mockImplementation((table: string) => {
        if (table === 'published_projects') return { select }
        if (table === 'project_purchases') return { upsert }
        throw new Error(`unexpected table ${table}`)
      })
      return { select, eq, maybeSingle, upsert }
    }

    it('пишет чек в project_purchases с amount_total события и отвечает 200', async () => {
      const sb = mockPurchaseSupabase()
      const { POST } = await import('./route')

      const res = await POST(
        signedRequest(
          topupEventBody({
            amount_total: 1200,
            metadata: { supabase_user_id: 'buyer-1', kind: 'gallery_purchase', published_id: 'pub-1' },
          }),
        ),
      )

      expect(res.status).toBe(200)
      expect(await res.text()).toBe('ok')
      expect(sb.upsert).toHaveBeenCalledTimes(1)
      const [row, opts] = sb.upsert.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>]
      expect(row).toMatchObject({
        published_id: 'pub-1',
        buyer_id: 'buyer-1',
        author_id: 'author-1',
        price_cents: 1200,
        currency: 'usd',
        stripe_session_id: 'cs_1',
        status: 'paid',
      })
      expect(opts).toEqual({ onConflict: 'stripe_session_id', ignoreDuplicates: true })
      expect(supabase.rpc).not.toHaveBeenCalled()
    })

    it('повторная доставка того же события отвечает 200 (идемпотентность в SQL по stripe_session_id)', async () => {
      const sb = mockPurchaseSupabase()
      const { POST } = await import('./route')

      const body = topupEventBody({ metadata: { supabase_user_id: 'buyer-1', kind: 'gallery_purchase', published_id: 'pub-1' } })
      const first = await POST(signedRequest(body))
      const second = await POST(signedRequest(body))

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(sb.upsert).toHaveBeenCalledTimes(2)
    })

    it('без published_id в metadata отвечает 200 и не пишет (ретрай не помог бы)', async () => {
      const sb = mockPurchaseSupabase()
      const { POST } = await import('./route')

      const res = await POST(
        signedRequest(topupEventBody({ metadata: { supabase_user_id: 'buyer-1', kind: 'gallery_purchase' } })),
      )

      expect(res.status).toBe(200)
      expect(sb.upsert).not.toHaveBeenCalled()
    })

    it('удалённая публикация отвечает 200 и не пишет чек', async () => {
      const sb = mockPurchaseSupabase({ published: null })
      const { POST } = await import('./route')

      const res = await POST(
        signedRequest(topupEventBody({ metadata: { supabase_user_id: 'buyer-1', kind: 'gallery_purchase', published_id: 'pub-1' } })),
      )

      expect(res.status).toBe(200)
      expect(sb.upsert).not.toHaveBeenCalled()
    })

    it('ошибка чтения публикации даёт 500: Stripe переотправит', async () => {
      mockPurchaseSupabase({ readError: { message: 'connection reset' } })
      const { POST } = await import('./route')

      const res = await POST(
        signedRequest(topupEventBody({ metadata: { supabase_user_id: 'buyer-1', kind: 'gallery_purchase', published_id: 'pub-1' } })),
      )

      expect(res.status).toBe(500)
    })

    it('ошибка записи чека даёт 500: Stripe переотправит', async () => {
      mockPurchaseSupabase({ upsertError: { message: 'constraint violation' } })
      const { POST } = await import('./route')

      const res = await POST(
        signedRequest(topupEventBody({ metadata: { supabase_user_id: 'buyer-1', kind: 'gallery_purchase', published_id: 'pub-1' } })),
      )

      expect(res.status).toBe(500)
    })
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

  describe('merch', () => {
    const MERCH_ORDER_ID = 'order-1'

    function merchOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        id: MERCH_ORDER_ID,
        user_id: 'user-1',
        product: 'tshirt',
        variant_id: 4012,
        print_path: 'user-1/order-1.png',
        retail_cents: 2199,
        printful_order_id: null,
        printful_attempts: 0,
        status: 'pending_payment',
        ...overrides,
      }
    }

    function merchEventBody(overrides: Record<string, unknown> = {}): string {
      return topupEventBody({
        amount_total: 2199,
        metadata: { supabase_user_id: 'user-1', kind: 'merch', merch_order_id: MERCH_ORDER_ID },
        shipping_details: {
          name: 'John Doe',
          address: { line1: '1 Main St', line2: null, city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US' },
        },
        customer_details: { email: 'john@example.com', phone: '+15551234567', name: null },
        ...overrides,
      })
    }

    /**
     * Отдельный мок from(): merch трогает одну таблицу (merch_orders), но двумя
     * разными формами запроса - select().eq('id').maybeSingle() на чтение и
     * update(...).eq(...) (одно или два условия подряд) на запись. update()
     * возвращает "thenable"-цепочку: и await после одного .eq, и после двух
     * должны увидеть { error }.
     */
    function mockMerchSupabase(
      options: {
        readonly order?: Record<string, unknown> | null
        readonly readError?: unknown
        readonly updateError?: unknown
        readonly publicUrl?: string | null
      } = {},
    ) {
      const maybeSingle = vi.fn().mockResolvedValue({ data: options.order === undefined ? merchOrder() : options.order, error: options.readError ?? null })
      const selectEq = vi.fn().mockReturnValue({ maybeSingle })
      const select = vi.fn().mockReturnValue({ eq: selectEq })

      const updateCalls: Record<string, unknown>[] = []
      function updateChain(): { eq: (...a: unknown[]) => unknown; then: Promise<{ error: unknown }>['then'] } {
        const result = Promise.resolve({ error: options.updateError ?? null })
        const chain = {
          eq: vi.fn(() => chain),
          then: result.then.bind(result),
        }
        return chain
      }
      const update = vi.fn((payload: Record<string, unknown>) => {
        updateCalls.push(payload)
        return updateChain()
      })

      supabase.from.mockImplementation((table: string) => {
        if (table === 'merch_orders') return { select, update }
        throw new Error(`unexpected table ${table}`)
      })

      const url = options.publicUrl === undefined ? 'https://cdn.example/merch-prints/user-1/order-1.png' : options.publicUrl
      const getPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: url } })
      supabase.storage.from.mockReturnValue({ getPublicUrl })

      return { select, selectEq, maybeSingle, update, updateCalls, getPublicUrl }
    }

    function printfulOk(id: number | string = 555): Response {
      return { ok: true, status: 200, json: () => Promise.resolve({ code: 200, result: { id } }) } as unknown as Response
    }
    function printfulError(status: number, message: string): Response {
      return { ok: false, status, json: () => Promise.resolve({ error: { message } }) } as unknown as Response
    }

    beforeEach(() => {
      vi.unstubAllGlobals()
    })

    it('успех: pending_payment -> paid -> Printful created -> draft_created, 200', async () => {
      const sb = mockMerchSupabase()
      const fetchMock = vi.fn().mockResolvedValue(printfulOk(555))
      vi.stubGlobal('fetch', fetchMock)
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(await res.text()).toBe('ok')
      // Первый update - переход в paid с адресом, второй - draft_created с printful_order_id.
      expect(sb.updateCalls[0]).toMatchObject({ status: 'paid', ship_name: 'John Doe', ship_country: 'US' })
      expect(sb.updateCalls.at(-1)).toMatchObject({ status: 'draft_created', printful_order_id: '555' })
      const [url] = fetchMock.mock.calls[0] as [string]
      expect(url).toContain('/orders?confirm=false')
    })

    it('«order already exists» (4xx с external_id в тексте) трактуется успехом', async () => {
      const sb = mockMerchSupabase({ order: merchOrder({ status: 'paid' }) })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(printfulError(400, 'Order with this external_id already exists')))
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(sb.updateCalls.at(-1)).toMatchObject({ status: 'draft_created' })
    })

    it('прочие 4xx Printful дают failed и 200 (ретрай не поможет)', async () => {
      const sb = mockMerchSupabase({ order: merchOrder({ status: 'paid' }) })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(printfulError(400, 'Invalid recipient country')))
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(sb.updateCalls.at(-1)).toMatchObject({ status: 'failed', printful_attempts: 1 })
    })

    it('5xx Printful даёт 500 (Stripe переотправит), статус остаётся не failed до потолка попыток', async () => {
      const sb = mockMerchSupabase({ order: merchOrder({ status: 'paid', printful_attempts: 1 }) })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(printfulError(502, 'internal error')))
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(500)
      const last = sb.updateCalls.at(-1) as Record<string, unknown>
      expect(last['printful_attempts']).toBe(2)
      expect(last['status']).toBeUndefined()
    })

    it('5xx на пятой попытке достигает потолка: status=failed и 200, а не 500', async () => {
      const sb = mockMerchSupabase({ order: merchOrder({ status: 'paid', printful_attempts: 4 }) })
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(printfulError(502, 'internal error')))
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(sb.updateCalls.at(-1)).toMatchObject({ printful_attempts: 5, status: 'failed' })
    })

    it('status=failed и attempts уже на потолке: 200 без нового похода в Printful', async () => {
      mockMerchSupabase({ order: merchOrder({ status: 'failed', printful_attempts: 5 }) })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('повторная доставка события на уже доведённом заказе не создаёт второй заказ у Printful', async () => {
      mockMerchSupabase({ order: merchOrder({ status: 'draft_created', printful_order_id: '555' }) })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('cancelled заказ отвечает 200 и ничего не трогает', async () => {
      mockMerchSupabase({ order: merchOrder({ status: 'cancelled' }) })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('чужой user_id (подделанные metadata) отвечает 200 и не идёт в Printful', async () => {
      mockMerchSupabase({ order: merchOrder({ user_id: 'someone-else' }) })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('сумма события расходится с retail_cents заказа: 200 без записи и без Printful', async () => {
      mockMerchSupabase({ order: merchOrder({ retail_cents: 3000 }) })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('без адреса доставки в событии: заказ уходит в failed, 200, Printful не трогаем', async () => {
      const sb = mockMerchSupabase()
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody({ shipping_details: null, customer_details: null })))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(sb.updateCalls.at(-1)).toMatchObject({ status: 'failed', last_error: 'no shipping address' })
    })

    it('merch_order_id отсутствует в metadata: 200, чтения заказа не было', async () => {
      const sb = mockMerchSupabase()
      const { POST } = await import('./route')

      const res = await POST(
        signedRequest(topupEventBody({ amount_total: 2199, metadata: { supabase_user_id: 'user-1', kind: 'merch' } })),
      )

      expect(res.status).toBe(200)
      expect(sb.select).not.toHaveBeenCalled()
    })

    it('заказ не найден в базе: 200, Printful не трогаем', async () => {
      mockMerchSupabase({ order: null })
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(200)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('ошибка чтения заказа даёт 500: Stripe переотправит', async () => {
      mockMerchSupabase({ readError: { message: 'connection reset' } })
      const { POST } = await import('./route')

      const res = await POST(signedRequest(merchEventBody()))

      expect(res.status).toBe(500)
    })
  })
})
