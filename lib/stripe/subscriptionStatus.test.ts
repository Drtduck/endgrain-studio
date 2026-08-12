import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Отдельный файл от pro.test.ts: там проверяется чистое ядро без единого мока,
// здесь нужны подменённые Supabase и окружение, и смешивать их в одном файле
// значит тащить моки в тесты, которым они не нужны.

const getUser = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/supabase/config', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  isSupabaseConfigured: () => true,
}))

vi.mock('@/lib/supabase/session', () => ({
  getCurrentUser: () => getUser(),
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}))

const ACTIVE_ROW = {
  status: 'active',
  plan: 'yearly',
  current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  cancel_at_period_end: false,
}

/** Флаг читается на верхнем уровне lib/flags.ts, поэтому модуль импортируется заново. */
async function loadPro(unlock: '0' | '1', env: Record<string, string> = {}) {
  vi.unstubAllEnvs()
  vi.stubEnv('NEXT_PUBLIC_PRO_UNLOCK', unlock)
  vi.stubEnv('PRO_UNLOCK_ALL', env['PRO_UNLOCK_ALL'] ?? '')
  vi.stubEnv('AI_ALLOWLIST_EMAILS', env['AI_ALLOWLIST_EMAILS'] ?? '')
  vi.resetModules()
  return import('./pro')
}

describe('getSubscriptionStatus', () => {
  beforeEach(() => {
    getUser.mockReset()
    maybeSingle.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('игнорирует аварийный флаг: с NEXT_PUBLIC_PRO_UNLOCK=1 и без строки даёт free', async () => {
    getUser.mockResolvedValue({ id: 'user-1', email: 'a@example.com' })
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const { getSubscriptionStatus, getProStatus } = await loadPro('1')

    // Ровно та развилка, ради которой хелпер и заведён: getProStatus под флагом
    // говорит «Pro есть», а касса обязана видеть, что подписки нет.
    expect(await getProStatus()).toMatchObject({ pro: true, reason: 'flag' })
    expect(await getSubscriptionStatus()).toMatchObject({ pro: false, reason: 'free' })
  })

  it('читает живую строку и под поднятым флагом отдаёт subscription', async () => {
    getUser.mockResolvedValue({ id: 'user-1', email: 'a@example.com' })
    maybeSingle.mockResolvedValue({ data: ACTIVE_ROW, error: null })
    const { getSubscriptionStatus } = await loadPro('1')

    const res = await getSubscriptionStatus()
    expect(res.pro).toBe(true)
    expect(res.reason).toBe('subscription')
    expect(res.plan).toBe('yearly')
    expect(maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('без пользователя даёт free и в базу не ходит', async () => {
    getUser.mockResolvedValue(null)
    const { getSubscriptionStatus } = await loadPro('0')

    expect(await getSubscriptionStatus()).toMatchObject({ pro: false, reason: 'free' })
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('отменённая подписка не считается живой: касса пустит на оплату', async () => {
    getUser.mockResolvedValue({ id: 'user-1', email: 'a@example.com' })
    maybeSingle.mockResolvedValue({ data: { ...ACTIVE_ROW, status: 'canceled' }, error: null })
    const { getSubscriptionStatus } = await loadPro('1')

    expect((await getSubscriptionStatus()).reason).toBe('free')
  })

  it('упавшая база не роняет вызов, а даёт free', async () => {
    getUser.mockResolvedValue({ id: 'user-1', email: 'a@example.com' })
    maybeSingle.mockRejectedValue(new Error('нет связи'))
    const { getSubscriptionStatus } = await loadPro('0')

    expect(await getSubscriptionStatus()).toMatchObject({ pro: false, reason: 'free' })
  })
})

describe('getProStatus', () => {
  beforeEach(() => {
    getUser.mockReset()
    maybeSingle.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('ненастроенный Stripe больше не открывает Pro: без подписки это free', async () => {
    // Раньше отсутствие кассы отдавало pro: true, то есть один незаведённый ключ
    // на проде открывал платные AI-фичи всем подряд. Проверяем, что это в прошлом.
    getUser.mockResolvedValue({ id: 'user-1', email: 'a@example.com' })
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const { getProStatus } = await loadPro('0')

    expect(await getProStatus()).toMatchObject({ pro: false, reason: 'free' })
  })

  it('гость без подписки не Pro и в базу за строкой не ходит', async () => {
    getUser.mockResolvedValue(null)
    const { getProStatus } = await loadPro('0')

    expect(await getProStatus()).toMatchObject({ pro: false, reason: 'free' })
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('адрес из AI_ALLOWLIST_EMAILS получает Pro без подписки: обход для жюри', async () => {
    getUser.mockResolvedValue({ id: 'user-1', email: 'Jury@endgrain.app' })
    const { getProStatus } = await loadPro('0', { AI_ALLOWLIST_EMAILS: 'jury@endgrain.app, drtloki@gmail.com' })

    expect(await getProStatus()).toMatchObject({ pro: true, reason: 'allowlist' })
    // Строку подписки читать незачем: право выдано списком.
    expect(maybeSingle).not.toHaveBeenCalled()
  })

  it('адрес не из списка проходит обычной дорогой через подписку', async () => {
    getUser.mockResolvedValue({ id: 'user-1', email: 'someone@example.com' })
    maybeSingle.mockResolvedValue({ data: ACTIVE_ROW, error: null })
    const { getProStatus } = await loadPro('0', { AI_ALLOWLIST_EMAILS: 'jury@endgrain.app' })

    expect(await getProStatus()).toMatchObject({ pro: true, reason: 'subscription' })
  })

  it('серверный рубильник PRO_UNLOCK_ALL=1 открывает Pro без сессии вовсе', async () => {
    getUser.mockResolvedValue(null)
    const { getProStatus } = await loadPro('0', { PRO_UNLOCK_ALL: '1' })

    expect(await getProStatus()).toMatchObject({ pro: true, reason: 'flag' })
    expect(getUser).not.toHaveBeenCalled()
  })

  it('пустой список никого не пускает', async () => {
    getUser.mockResolvedValue({ id: 'user-1', email: 'a@example.com' })
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const { getProStatus } = await loadPro('0', { AI_ALLOWLIST_EMAILS: '' })

    expect(await getProStatus()).toMatchObject({ pro: false, reason: 'free' })
  })
})
