import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'

/**
 * createMerchCheckoutAction: §4.1, §13.1 спеки merch-orders.md. Тяжёлые части
 * (рендер sharp, реальный compile) замоканы - тест проверяет ветвление действия,
 * а не сам рендер (тот уже покрыт lib/merch/print.test.ts).
 */

let merchConfigured = true
vi.mock('@/lib/merch/config', () => ({
  isMerchConfigured: () => merchConfigured,
}))

vi.mock('@/lib/promo/config', () => ({
  isPrintfulConfigured: () => true,
}))

vi.mock('@/lib/stripe/config', () => ({
  STRIPE_SECRET_KEY: 'sk_test_1',
  isStripeConfigured: () => true,
}))

const getCurrentUser = vi.fn()
vi.mock('@/lib/supabase/session', () => ({
  getCurrentUser: () => getCurrentUser(),
}))

vi.mock('@/lib/engine', () => ({
  compile: (design: unknown) => ({ design }),
  // makeCheckerboard (lib/designs/samples.ts) читает SCHEMA_VERSION напрямую из
  // '@/lib/engine' при сборке образца проекта для теста: без него мок модуля
  // возвращает undefined, и сборка образца падает ещё до самого теста.
  SCHEMA_VERSION: 3,
}))

vi.mock('@/lib/merch/print', () => ({
  MERCH_PRINTS_BUCKET: 'merch-prints',
  merchPrintPath: (userId: string, orderId: string) => `${userId}/${orderId}.png`,
  merchThumbPath: (printPath: string) => printPath.replace(/\.png$/i, '.thumb.png'),
  renderMerchPrint: () => Promise.resolve({ buffer: Buffer.from('fake-png'), sidePx: 1800 }),
  renderMerchThumb: () => Promise.resolve(Buffer.from('fake-thumb-png')),
}))

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ origin: 'https://app.endgrain.app' })),
}))

interface DbState {
  pendingCount: number
  countError: unknown
  insertError: unknown
  updateError: unknown
  uploadError: unknown
  publicUrl: string | null
  /** null - проект не найден/не принадлежит пользователю (ownership-запрос вернёт пусто). */
  projectRow: { id: string } | null
  projectError: unknown
}

const dbState: DbState = {
  pendingCount: 0,
  countError: null,
  insertError: null,
  updateError: null,
  uploadError: null,
  publicUrl: 'https://cdn.example/merch-prints/user-1/order-1.png',
  projectRow: null,
  projectError: null,
}

const insertedRows: Record<string, unknown>[] = []

function makeSupabaseService() {
  return {
    from: vi.fn((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(() => Promise.resolve({ data: dbState.projectRow, error: dbState.projectError })),
              })),
            })),
          })),
        }
      }
      if (table !== 'merch_orders') throw new Error(`unexpected table ${table}`)
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              gte: vi.fn(() => Promise.resolve({ count: dbState.pendingCount, error: dbState.countError })),
            })),
          })),
        })),
        insert: vi.fn((row: Record<string, unknown>) => {
          insertedRows.push(row)
          return Promise.resolve({ error: dbState.insertError })
        }),
        update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: dbState.updateError })) })),
      }
    }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => Promise.resolve({ error: dbState.uploadError })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: dbState.publicUrl } })),
      })),
    },
  }
}

vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => true,
  getSupabaseService: () => makeSupabaseService(),
}))

const design = makeCheckerboard()

function validInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product: 'tshirt',
    size: 'm',
    projectId: null,
    design,
    ...overrides,
  }
}

describe('createMerchCheckoutAction', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    merchConfigured = true
    getCurrentUser.mockReset()
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'user@example.com' })
    dbState.pendingCount = 0
    dbState.countError = null
    dbState.insertError = null
    dbState.updateError = null
    dbState.uploadError = null
    dbState.publicUrl = 'https://cdn.example/merch-prints/user-1/order-1.png'
    dbState.projectRow = null
    dbState.projectError = null
    insertedRows.length = 0
  })

  it('invalid на недопустимой паре товар+размер (кружка + размер L)', async () => {
    const { createMerchCheckoutAction } = await import('./merch')
    const res = await createMerchCheckoutAction(validInput({ product: 'mug', size: 'l' }))
    expect(res).toEqual({ ok: false, error: 'invalid' })
  })

  it('invalid на битом входе (не проходит zod вовсе)', async () => {
    const { createMerchCheckoutAction } = await import('./merch')
    const res = await createMerchCheckoutAction({ product: 'tshirt' })
    expect(res).toEqual({ ok: false, error: 'invalid' })
  })

  it('unauthenticated без сессии', async () => {
    getCurrentUser.mockResolvedValue(null)
    const { createMerchCheckoutAction } = await import('./merch')
    const res = await createMerchCheckoutAction(validInput())
    expect(res).toEqual({ ok: false, error: 'unauthenticated' })
  })

  it('disabled при выключенном MERCH_ENABLED (isMerchConfigured=false)', async () => {
    merchConfigured = false
    const { createMerchCheckoutAction } = await import('./merch')
    const res = await createMerchCheckoutAction(validInput())
    expect(res).toEqual({ ok: false, error: 'disabled' })
  })

  it('failed при превышении лимита незавершённых заказов (10 pending_payment в час)', async () => {
    dbState.pendingCount = 10
    const { createMerchCheckoutAction } = await import('./merch')
    const res = await createMerchCheckoutAction(validInput())
    expect(res).toEqual({ ok: false, error: 'failed' })
  })

  it('storage при ошибке заливки print-файла', async () => {
    dbState.uploadError = { message: 'bucket unavailable' }
    const { createMerchCheckoutAction } = await import('./merch')
    const res = await createMerchCheckoutAction(validInput())
    expect(res).toEqual({ ok: false, error: 'storage' })
  })

  it('failed при ошибке записи строки заказа', async () => {
    dbState.insertError = { message: 'constraint violation' }
    const { createMerchCheckoutAction } = await import('./merch')
    const res = await createMerchCheckoutAction(validInput())
    expect(res).toEqual({ ok: false, error: 'failed' })
  })

  it('failed, если Stripe не ответил', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('stripe down') }))
    const { createMerchCheckoutAction } = await import('./merch')
    const res = await createMerchCheckoutAction(validInput())
    expect(res).toEqual({ ok: false, error: 'failed' })
  })

  it('happy path: создаёт заказ pending_payment и возвращает url кассы, цена в сессии равна цене строки заказа', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'cs_1', url: 'https://checkout.stripe.com/pay/cs_1' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchCheckoutAction } = await import('./merch')

    const res = await createMerchCheckoutAction(validInput())

    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe.com/pay/cs_1' })
    expect(insertedRows).toHaveLength(1)
    const row = insertedRows[0] as Record<string, unknown>
    expect(row['status']).toBe('pending_payment')
    expect(row['user_id']).toBe('user-1')
    expect(row['product']).toBe('tshirt')
    expect(row['size']).toBe('m')

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = new URLSearchParams(init.body as string)
    // Единственный тест, который ловит расхождение витрины и кассы (§13.1 спеки):
    // цена в теле сессии Stripe обязана быть равна retail_cents строки заказа.
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe(String(row['retail_cents']))
    expect(body.get('metadata[kind]')).toBe('merch')
    expect(body.get('metadata[supabase_user_id]')).toBe('user-1')
    expect(body.get('metadata[merch_order_id]')).toBe(row['id'])
    expect(body.get('mode')).toBe('payment')
    expect(body.get('shipping_options[0][shipping_rate_data][fixed_amount][amount]')).toBe('0')
    expect(body.get('shipping_address_collection[allowed_countries][0]')).toBe('US')
  })

  it('projectId чужого пользователя (или удалённого проекта) пишется как null, заказ не отбивается (ревью 15.08.2026, п.7)', async () => {
    dbState.projectRow = null // ownership-запрос вернул пусто: чужой проект или его больше нет
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'cs_1', url: 'https://checkout.stripe.com/pay/cs_1' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchCheckoutAction } = await import('./merch')

    const res = await createMerchCheckoutAction(validInput({ projectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }))

    expect(res.ok).toBe(true)
    expect(insertedRows).toHaveLength(1)
    expect(insertedRows[0]?.['project_id']).toBeNull()
  })

  it('failed при превышении лимита попыток покупки в час, включая неудачные попытки (ревью 15.08.2026, п.4)', async () => {
    // Отдельный user.id: счётчик не должен нести хвост от предыдущих тестов файла.
    getCurrentUser.mockResolvedValue({ id: 'user-rate-test', email: 'rate@example.com' })
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'cs_1', url: 'https://checkout.stripe.com/pay/cs_1' }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchCheckoutAction } = await import('./merch')

    const results: Awaited<ReturnType<typeof createMerchCheckoutAction>>[] = []
    for (let i = 0; i < 11; i += 1) {
      results.push(await createMerchCheckoutAction(validInput()))
    }

    // Ровно 10 попыток в час (MERCH_ATTEMPTS_PER_HOUR) успевают до кассы, 11-я упирается в лимит.
    expect(results.slice(0, 10).every((r) => r.ok)).toBe(true)
    expect(results[10]).toEqual({ ok: false, error: 'failed' })
  })
})
