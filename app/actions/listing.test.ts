import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SaleListing } from '@/lib/promo/listing'

let gemini = true
let openRouter = true
let supabase = true
let user: { id: string } | null = { id: 'user-1' }
let verdict: 'ok' | 'ip' = 'ok'
const take = vi.fn<(key: string, limit: number, now: number) => 'ok' | 'ip'>(() => verdict)

const grant = { ok: true as const, tier: 'pro' as const, userId: 'user-1', period: '2026-08', cost: 1, used: 1, remaining: 29, ref: 'r', free: 1, credits: 0 }
const allowed = vi.fn<(feature: string, units: number, ref: string) => Promise<typeof grant>>(() => Promise.resolve(grant))
const release = vi.fn<(g: unknown) => Promise<void>>(() => Promise.resolve())

vi.mock('@/lib/ai/entitlements', () => ({
  assertAiAllowed: (feature: string, units: number, ref: string) => allowed(feature, units, ref),
  releaseAiQuota: (g: unknown) => release(g),
}))

vi.mock('@/lib/promo/config', () => ({
  isGeminiConfigured: () => gemini,
  isOpenRouterConfigured: () => openRouter,
}))

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })),
}))

vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => supabase }))
vi.mock('@/lib/supabase/session', () => ({ getCurrentUser: () => Promise.resolve(user) }))

vi.mock('@/lib/persist', () => ({ parseDesign: (d: unknown) => d }))
vi.mock('@/lib/engine', () => ({
  compile: (d: { widthMm?: number; lengthMm?: number; thicknessMm?: number; cells?: unknown[] }) => ({
    widthMm: d.widthMm ?? 300,
    lengthMm: d.lengthMm ?? 450,
    thicknessMm: d.thicknessMm ?? 30,
    cells: d.cells ?? [],
  }),
}))

const DESCRIPTION = {
  species: ['Black Walnut', 'Hard Maple'],
  sizeMm: '300 x 450 x 30 mm',
  cellCount: 64,
  text: 'An end-grain cutting board, 300 x 450 x 30 mm, made of Black Walnut, Hard Maple.',
}
vi.mock('@/lib/promo/describe', () => ({ describeBoard: () => DESCRIPTION }))

const requestListing = vi.fn<(prompt: string) => Promise<{ ok: true; listing: SaleListing } | { ok: false }>>()
vi.mock('@/lib/promo/listingRequest', () => ({ requestListing: (p: string) => requestListing(p) }))

vi.mock('@/lib/promo/rateLimit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/promo/rateLimit')>('@/lib/promo/rateLimit')
  return { ...actual, promoLimiter: { take: (k: string, l: number, n: number) => take(k, l, n) } }
})

let projectRow: { design: unknown } | null = {
  design: { name: 'walnut board', widthMm: 300, lengthMm: 450, thicknessMm: 30, cells: [] },
}
function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder['select'] = self
  builder['eq'] = self
  builder['in'] = self
  builder['maybeSingle'] = () => Promise.resolve(result)
  return builder
}
vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => supabase,
  getSupabaseService: () => ({
    from: () => chain({ data: projectRow, error: null }),
  }),
}))

const PROJECT_ID = '11e7d6b5-7651-4358-a42c-0436423464f5'
const WALLET_REF = '0486487f-72f3-4766-a8e1-6e88389d300b'

function validListing(): SaleListing {
  return {
    title: 'Walnut End-Grain Cutting Board',
    bullets: ['one', 'two', 'three', 'four', 'five'],
    keywords: Array.from({ length: 13 }, (_, i) => `tag${i}`),
    description: 'A handmade board.',
    materials: ['Black walnut'],
    care: 'Hand wash only.',
  }
}

function resetCommon(): void {
  gemini = true
  openRouter = true
  supabase = true
  user = { id: 'user-1' }
  verdict = 'ok'
  projectRow = { design: { name: 'walnut board', widthMm: 300, lengthMm: 450, thicknessMm: 30, cells: [] } }
  allowed.mockClear()
  allowed.mockResolvedValue(grant)
  release.mockClear()
  requestListing.mockReset()
  take.mockClear()
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

describe('app/actions/listing: generateListingAction', () => {
  beforeEach(resetCommon)

  it('ни Gemini, ни OpenRouter не настроены: демо-заготовка сразу, requestListing не вызывается', async () => {
    gemini = false
    openRouter = false
    const { generateListingAction } = await import('./listing')
    const res = await generateListingAction({ projectId: PROJECT_ID, marketplace: 'amazon', shotIds: [], walletRef: WALLET_REF })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('ожидался успех')
    expect(res.mock).toBe(true)
    expect(requestListing).not.toHaveBeenCalled()
    expect(allowed).not.toHaveBeenCalled()
  })

  it('Gemini падает, OpenRouter отвечает валидным JSON: ok:true mock:false, кадр списан', async () => {
    requestListing.mockResolvedValue({ ok: true, listing: validListing() })
    const { generateListingAction } = await import('./listing')
    const res = await generateListingAction({ projectId: PROJECT_ID, marketplace: 'amazon', shotIds: [], walletRef: WALLET_REF })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('ожидался успех')
    expect(res.mock).toBe(false)
    expect(release).not.toHaveBeenCalled()
  })

  it('оба провайдера отказали: ok:true mock:true с демо-листингом, квота освобождена', async () => {
    requestListing.mockResolvedValue({ ok: false })
    const { generateListingAction } = await import('./listing')
    const res = await generateListingAction({ projectId: PROJECT_ID, marketplace: 'amazon', shotIds: [], walletRef: WALLET_REF })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('ожидался успех')
    expect(res.mock).toBe(true)
    expect(res.listing.title.toLowerCase()).toContain('walnut')
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('requestListing отвечает, но разбор под площадку не проходит: демо-заготовка, квота освобождена', async () => {
    requestListing.mockResolvedValue({ ok: true, listing: { ...validListing(), title: '' } as unknown as SaleListing })
    const { generateListingAction } = await import('./listing')
    const res = await generateListingAction({ projectId: PROJECT_ID, marketplace: 'amazon', shotIds: [], walletRef: WALLET_REF })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('ожидался успех')
    expect(res.mock).toBe(true)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('только OpenRouter настроен (нет Gemini): платный путь всё равно идёт, не сваливается в демо сразу', async () => {
    gemini = false
    requestListing.mockResolvedValue({ ok: true, listing: validListing() })
    const { generateListingAction } = await import('./listing')
    const res = await generateListingAction({ projectId: PROJECT_ID, marketplace: 'amazon', shotIds: [], walletRef: WALLET_REF })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('ожидался успех')
    expect(res.mock).toBe(false)
    expect(requestListing).toHaveBeenCalledTimes(1)
  })

  it('аноним получает свой код отказа, минуя платный путь', async () => {
    user = null
    supabase = false
    const { generateListingAction } = await import('./listing')
    const res = await generateListingAction({
      projectId: PROJECT_ID,
      marketplace: 'amazon',
      shotIds: [],
      walletRef: WALLET_REF,
      design: { name: 'x', widthMm: 300, lengthMm: 300, thicknessMm: 20, cells: [] },
    })
    expect(res.ok).toBe(true)
    if (!res.ok) throw new Error('ожидался успех')
    expect(res.mock).toBe(true)
    expect(requestListing).not.toHaveBeenCalled()
  })
})
