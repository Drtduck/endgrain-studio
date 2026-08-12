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
async function loadPro(unlock: '0' | '1') {
  vi.unstubAllEnvs()
  vi.stubEnv('NEXT_PUBLIC_PRO_UNLOCK', unlock)
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
