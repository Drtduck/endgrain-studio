import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Отдельный файл от остальных гвардов галереи (публикация/лайк/копия покрыты
 * руками на проде до этой волны техдолга): покупка добавлена в фазе 2 спеки
 * docs/superpowers/specs/2026-08-13-commerce-social-design.md, тестируется
 * тем же приёмом, что и app/actions/projects.test.ts - мок getSupabaseServer
 * с цепочкой from().select().eq()....maybeSingle(), fetch подменён глобально.
 */

let stripeConfigured = true
vi.mock('@/lib/stripe/config', () => ({
  STRIPE_SECRET_KEY: 'sk_test_1',
  isStripeConfigured: () => stripeConfigured,
}))

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ origin: 'https://app.endgrain.app' })),
}))

vi.mock('next/cache', () => ({ revalidatePath: () => {} }))

const getUser = vi.fn()
const from = vi.fn()
vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => true }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({ auth: { getUser }, from }),
}))

const PUBLISHED_ID = '11111111-1111-4111-8111-111111111111'

interface PublishedRow {
  readonly title?: string
  readonly price_cents: number
  readonly author_id: string
  readonly status?: string
}

/**
 * Роут читает published_projects одним .eq('id', ...).maybeSingle(), затем
 * (если применимо) project_purchases по трём .eq подряд перед .maybeSingle().
 * from() различает таблицу по имени - оба чтения идут через один и тот же мок.
 */
function mockTables(options: { readonly published?: PublishedRow | null; readonly purchase?: { id: string } | null } = {}) {
  const published = options.published === undefined ? { title: 'Шахматка', price_cents: 1200, author_id: 'author-1', status: 'public' } : options.published

  from.mockImplementation((table: string) => {
    if (table === 'published_projects') {
      const maybeSingle = vi.fn().mockResolvedValue({ data: published, error: null })
      const eq = vi.fn().mockReturnValue({ maybeSingle })
      const select = vi.fn().mockReturnValue({ eq })
      return { select }
    }
    if (table === 'project_purchases') {
      const maybeSingle = vi.fn().mockResolvedValue({ data: options.purchase ?? null, error: null })
      const eq3 = vi.fn().mockReturnValue({ maybeSingle })
      const eq2 = vi.fn().mockReturnValue({ eq: eq3 })
      const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
      const select = vi.fn().mockReturnValue({ eq: eq1 })
      return { select }
    }
    throw new Error(`unexpected table ${table}`)
  })
}

describe('app/actions/gallery: createPurchaseCheckoutAction', () => {
  beforeEach(() => {
    stripeConfigured = true
    getUser.mockReset()
    from.mockReset()
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('без кассы Stripe даёт disabled и не читает базу', async () => {
    stripeConfigured = false
    const { createPurchaseCheckoutAction } = await import('./gallery')

    const res = await createPurchaseCheckoutAction(PUBLISHED_ID)

    expect(res).toEqual({ ok: false, error: 'disabled' })
    expect(from).not.toHaveBeenCalled()
  })

  it('невалидный id даёт invalid', async () => {
    const { createPurchaseCheckoutAction } = await import('./gallery')
    const res = await createPurchaseCheckoutAction('не-uuid')
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(from).not.toHaveBeenCalled()
  })

  it('без пользователя даёт unauthenticated и не читает базу', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { createPurchaseCheckoutAction } = await import('./gallery')

    const res = await createPurchaseCheckoutAction(PUBLISHED_ID)

    expect(res).toEqual({ ok: false, error: 'unauthenticated' })
    expect(from).not.toHaveBeenCalled()
  })

  it('удалённая или несуществующая публикация даёт notFound', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'buyer-1', email: 'buyer@example.com' } } })
    mockTables({ published: null })
    const { createPurchaseCheckoutAction } = await import('./gallery')

    const res = await createPurchaseCheckoutAction(PUBLISHED_ID)

    expect(res).toEqual({ ok: false, error: 'notFound' })
  })

  it('бесплатный проект (price_cents = 0) даёт invalid: покупать нечего', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'buyer-1', email: 'buyer@example.com' } } })
    mockTables({ published: { title: 'Бесплатная', price_cents: 0, author_id: 'author-1', status: 'public' } })
    const { createPurchaseCheckoutAction } = await import('./gallery')

    const res = await createPurchaseCheckoutAction(PUBLISHED_ID)

    expect(res).toEqual({ ok: false, error: 'invalid' })
  })

  it('свой проект даёт own', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'author-1', email: 'author@example.com' } } })
    mockTables({ published: { title: 'Своя', price_cents: 1200, author_id: 'author-1', status: 'public' } })
    const { createPurchaseCheckoutAction } = await import('./gallery')

    const res = await createPurchaseCheckoutAction(PUBLISHED_ID)

    expect(res).toEqual({ ok: false, error: 'own' })
  })

  it('уже купленный проект даёт already и fetch не зовётся', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'buyer-1', email: 'buyer@example.com' } } })
    mockTables({ purchase: { id: 'purchase-1' } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createPurchaseCheckoutAction } = await import('./gallery')

    const res = await createPurchaseCheckoutAction(PUBLISHED_ID)

    expect(res).toEqual({ ok: false, error: 'already' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('успешный путь создаёт Checkout Session с price_data и metadata.kind=gallery_purchase', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'buyer-1', email: 'buyer@example.com' } } })
    mockTables()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://checkout.stripe.com/pay/cs_1' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { createPurchaseCheckoutAction } = await import('./gallery')

    const res = await createPurchaseCheckoutAction(PUBLISHED_ID)

    expect(res).toEqual({ ok: true, url: 'https://checkout.stripe.com/pay/cs_1' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.stripe.com/v1/checkout/sessions')
    const body = new URLSearchParams(init.body as string)
    expect(body.get('mode')).toBe('payment')
    expect(body.get('line_items[0][price_data][unit_amount]')).toBe('1200')
    expect(body.get('line_items[0][price_data][currency]')).toBe('usd')
    expect(body.get('metadata[kind]')).toBe('gallery_purchase')
    expect(body.get('metadata[supabase_user_id]')).toBe('buyer-1')
    expect(body.get('metadata[published_id]')).toBe(PUBLISHED_ID)
    expect(body.get('success_url')).toBe(`https://app.endgrain.app/gallery/${PUBLISHED_ID}?purchase=success`)
  })

  it('провал Stripe даёт failed', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'buyer-1', email: 'buyer@example.com' } } })
    mockTables()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' }))
    const { createPurchaseCheckoutAction } = await import('./gallery')

    const res = await createPurchaseCheckoutAction(PUBLISHED_ID)

    expect(res).toEqual({ ok: false, error: 'failed' })
  })
})
