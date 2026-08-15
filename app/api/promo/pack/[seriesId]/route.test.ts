import sharp from 'sharp'
import { unzipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RateLimitVerdict } from '@/lib/promo/rateLimit'

let user: { readonly id: string } | null = { id: 'user-1' }
let supabaseConfigured = true

vi.mock('@/lib/supabase/session', () => ({ getCurrentUser: () => Promise.resolve(user) }))

// Реальный promoLimiter - синглтон на процесс: без мока счётчик копился бы
// между тестами этого файла (все запросы бьют по одному и тому же 'unknown'
// адресу без x-forwarded-for) и не пятый, а шестой вызов этого же файла падал
// бы 429-й, ломая тесты, не имеющие отношения к лимиту.
let rateLimitVerdict: RateLimitVerdict = 'ok'
vi.mock('@/lib/promo/rateLimit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/promo/rateLimit')>('@/lib/promo/rateLimit')
  return { ...actual, promoLimiter: { take: () => rateLimitVerdict } }
})

interface ShotRow {
  readonly id: string
  readonly project_id: string
  readonly kind_slug: string
  readonly variant_no: number
  readonly storage_path: string | null
  readonly status: string
}

let shotRows: readonly ShotRow[] = []
let shotsError: unknown = null
let projectRow: { readonly name: string } | null = { name: 'Walnut Board' }

function chain(table: string) {
  const builder: Record<string, unknown> = {}
  const self = () => builder
  builder['select'] = self
  builder['eq'] = self
  builder['in'] = self
  builder['maybeSingle'] = () =>
    Promise.resolve(table === 'projects' ? { data: projectRow, error: null } : { data: null, error: null })
  builder['then'] = (resolve: (v: { readonly data: unknown; readonly error: unknown }) => void) =>
    Promise.resolve({ data: table === 'promo_shots' ? shotRows : [], error: table === 'promo_shots' ? shotsError : null }).then(resolve)
  return builder
}

vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => supabaseConfigured,
  getSupabaseService: () => ({ from: (table: string) => chain(table) }),
}))

let downloaded: Buffer | null = null
vi.mock('@/lib/promo/assets', () => ({
  downloadPromoAsset: () => Promise.resolve(downloaded),
}))

const SHOT_A = '11111111-1111-4111-8111-111111111111'
const SHOT_B = '22222222-2222-4222-8222-222222222222'
const SERIES_A = '33333333-3333-4333-8333-333333333333'
const PROJECT_A = '44444444-4444-4444-8444-444444444444'

async function fixture(): Promise<Buffer> {
  return sharp({ create: { width: 512, height: 512, channels: 3, background: '#336699' } }).png().toBuffer()
}

function req(query: string): Request {
  return new Request(`http://localhost/api/promo/pack/${SERIES_A}${query}`)
}

function ctx(seriesId: string = SERIES_A) {
  return { params: Promise.resolve({ seriesId }) }
}

beforeEach(async () => {
  user = { id: 'user-1' }
  supabaseConfigured = true
  rateLimitVerdict = 'ok'
  shotsError = null
  projectRow = { name: 'Walnut Board' }
  downloaded = await fixture()
  shotRows = [
    { id: SHOT_A, project_id: PROJECT_A, kind_slug: 'hero', variant_no: 1, storage_path: 'user-1/s/hero.png', status: 'done' },
    { id: SHOT_B, project_id: PROJECT_A, kind_slug: 'island', variant_no: 1, storage_path: 'user-1/s/island.png', status: 'done' },
  ]
})

describe('GET /api/promo/pack/[seriesId]', () => {
  it('401 без пользователя', async () => {
    user = null
    const { GET } = await import('./route')
    const res = await GET(req(`?market=amazon&shots=${SHOT_A}`), ctx())
    expect(res.status).toBe(401)
  })

  it('429 при выбранном лимите: до sharp и до чтения кадров дело не доходит', async () => {
    rateLimitVerdict = 'ip'
    const { GET } = await import('./route')
    const res = await GET(req(`?market=amazon&shots=${SHOT_A}`), ctx())
    expect(res.status).toBe(429)
  })

  it('400 при неизвестной площадке', async () => {
    const { GET } = await import('./route')
    const res = await GET(req(`?market=nope&shots=${SHOT_A}`), ctx())
    expect(res.status).toBe(400)
  })

  it('400 при кривом id серии в пути', async () => {
    const { GET } = await import('./route')
    const res = await GET(req(`?market=amazon&shots=${SHOT_A}`), ctx('not-a-uuid'))
    expect(res.status).toBe(400)
  })

  it('404, если ни один запрошенный кадр не найден готовым', async () => {
    shotRows = []
    const { GET } = await import('./route')
    const res = await GET(req(`?market=amazon&shots=${SHOT_A}`), ctx())
    expect(res.status).toBe(404)
  })

  it('отдаёт zip с кропнутыми кадрами под площадку, имена и README на месте', async () => {
    const { GET } = await import('./route')
    const res = await GET(req(`?market=ozon&shots=${SHOT_A},${SHOT_B}`), ctx())
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/zip')
    expect(res.headers.get('Content-Disposition')).toContain('attachment')
    expect(res.headers.get('Content-Disposition')).toContain(".zip")

    const bytes = new Uint8Array(await res.arrayBuffer())
    const files = unzipSync(bytes)
    const names = Object.keys(files)
    expect(names).toContain('README.txt')
    expect(names.some((n) => n.startsWith('01-hero'))).toBe(true)
    expect(names.some((n) => n.startsWith('02-island'))).toBe(true)
    // Ozon не подтверждён первоисточником: README обязан честно предупреждать.
    const readme = new TextDecoder().decode(files['README.txt'])
    expect(readme).toContain('seller account')

    // Файл кадра действительно кропнут под 3:4 (Ozon продаёт витрину, не квадрат).
    const heroFile = names.find((n) => n.startsWith('01-hero'))!
    const meta = await sharp(Buffer.from(files[heroFile]!)).metadata()
    expect(Math.abs((meta.width ?? 0) / (meta.height ?? 1) - 3 / 4)).toBeLessThan(0.02)
  }, 20_000)

  it('площадка confirmed:true (Яндекс.Маркет) не пишет предупреждение в README', async () => {
    const { GET } = await import('./route')
    const res = await GET(req(`?market=yandexmarket&shots=${SHOT_A}`), ctx())
    expect(res.status).toBe(200)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const files = unzipSync(bytes)
    const readme = new TextDecoder().decode(files['README.txt'])
    expect(readme).not.toContain('seller account')
  }, 20_000)

  it('пропускает кадры без storage_path и не падает, если хотя бы один готов', async () => {
    shotRows = [
      { id: SHOT_A, project_id: PROJECT_A, kind_slug: 'hero', variant_no: 1, storage_path: null, status: 'done' },
      { id: SHOT_B, project_id: PROJECT_A, kind_slug: 'island', variant_no: 1, storage_path: 'user-1/s/island.png', status: 'done' },
    ]
    const { GET } = await import('./route')
    const res = await GET(req(`?market=amazon&shots=${SHOT_A},${SHOT_B}`), ctx())
    expect(res.status).toBe(200)
    const bytes = new Uint8Array(await res.arrayBuffer())
    const files = unzipSync(bytes)
    expect(Object.keys(files).some((n) => n.startsWith('01-island'))).toBe(true)
  }, 20_000)
})
