import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_MONTHLY_LIMIT, FREE_TRIAL_LIMIT } from './quota'

let gemini = true
let fal = false
let freeTrialSecret = ''
let supabase = true
let service = true
let pro = true
let user: { id: string; email: string } | null = { id: 'user-1', email: 'a@example.com' }

const rpc = vi.fn()
const maybeSingle = vi.fn()

// Cookie-хранилище теста: Map-подобный сет/гет, как next/headers cookies().
let cookieStore = new Map<string, string>()
const cookieSet = vi.fn((name: string, value: string) => {
  cookieStore.set(name, value)
})

vi.mock('@/lib/promo/config', () => ({
  get FREE_TRIAL_SECRET() {
    return freeTrialSecret
  },
  isGeminiConfigured: () => gemini,
  isFalConfigured: () => fal,
  isFreeTrialConfigured: () => freeTrialSecret.length > 0 && fal,
}))
vi.mock('@/lib/promo/rateLimit', () => ({ clientIp: (fwd: string | null, real: string | null) => real ?? fwd ?? 'unknown' }))
vi.mock('@/lib/routing/cookieDomain', () => ({ isSecureCookieHost: () => true }))
vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => supabase }))
vi.mock('@/lib/supabase/session', () => ({ getCurrentUser: () => Promise.resolve(user) }))
vi.mock('@/lib/stripe/pro', () => ({
  getProStatus: () =>
    Promise.resolve({ pro, reason: pro ? 'subscription' : 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }),
}))
vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => service,
  getSupabaseService: () => ({
    rpc: (name: string, args: unknown) => rpc(name, args),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle }) }) }) }),
  }),
}))
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7', host: 'app.endgrain.app' })),
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name) } : undefined),
      set: (name: string, value: string) => {
        cookieSet(name, value)
      },
    }),
}))

const { assertAiAllowed, getAiAccess, isAiDemoMode, releaseAiQuota } = await import('./entitlements')
const { createGuestId, signGuestCookie } = await import('./freeSubjects')

describe('assertAiAllowed', () => {
  beforeEach(() => {
    gemini = true
    fal = false
    freeTrialSecret = ''
    supabase = true
    service = true
    pro = true
    user = { id: 'user-1', email: 'a@example.com' }
    rpc.mockReset()
    maybeSingle.mockReset()
    rpc.mockResolvedValue({ data: 1, error: null })
    cookieStore = new Map()
    cookieSet.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('без настроенного Supabase не пускает: гейт не построить, а модель платная', async () => {
    // Ровно тот дефект, из-за которого правка и затевалась: незаведённый ключ
    // не должен открывать платные фичи всем подряд.
    supabase = false
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'unavailable', remaining: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('аноним без пробного тира получает отказ и в базу за квотой не идёт', async () => {
    user = null
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'anonymous', remaining: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('вошедший без Pro и без пробного тира получает notPro и квоту не тратит', async () => {
    pro = false
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'notPro', remaining: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('Pro получает резерв и остаток из ответа базы', async () => {
    rpc.mockResolvedValue({ data: 5, error: null })
    const verdict = await assertAiAllowed('promoShots')
    expect(verdict).toEqual({ ok: true, tier: 'pro', userId: 'user-1', period: expect.any(String), cost: 1, used: 5, remaining: 25 })
  })

  it('списание идёт одной атомарной функцией с лимитом на стороне SQL', async () => {
    await assertAiAllowed('promoShots')
    expect(rpc).toHaveBeenCalledTimes(1)
    const [name, args] = rpc.mock.calls[0] as [string, Record<string, unknown>]
    expect(name).toBe('consume_ai_quota')
    expect(args.p_user_id).toBe('user-1')
    expect(args.p_limit).toBe(AI_MONTHLY_LIMIT)
    expect(args.p_cost).toBe(1)
    expect(args.p_period).toMatch(/^[0-9]{4}-[0-9]{2}$/)
  })

  it('пустой ответ функции значит выбранную квоту', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'quota', remaining: 0 })
  })

  it('упавшая база это unavailable, а не выдуманный лимит', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'connection reset' } })
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'unavailable', remaining: 0 })
  })

  it('брошенный вызов rpc тоже не роняет действие', async () => {
    rpc.mockRejectedValue(new Error('нет связи'))
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'unavailable', remaining: 0 })
  })

  it('без service-ключа считать квоту нечем, значит не пускаем', async () => {
    service = false
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'unavailable', remaining: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('мокапы мерча требуют Pro, но квоту не трогают', async () => {
    const verdict = await assertAiAllowed('merchMockups')
    expect(verdict.ok).toBe(true)
    if (!verdict.ok) throw new Error('ожидался доступ')
    expect(verdict.tier).toBe('pro')
    if (verdict.tier !== 'pro') throw new Error('ожидался pro')
    expect(verdict.cost).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('мокапы мерча без Pro всё равно закрыты', async () => {
    pro = false
    expect(await assertAiAllowed('merchMockups')).toEqual({ ok: false, reason: 'notPro', remaining: 0 })
  })

  describe('пробный тир', () => {
    beforeEach(() => {
      fal = true
      freeTrialSecret = 'trial-secret'
    })

    it('гость с остатком получает grant tier: trial', async () => {
      user = null
      rpc.mockResolvedValue({ data: { ok: true, remaining: 2 }, error: null })
      const verdict = await assertAiAllowed('promoShots')
      expect(verdict.ok).toBe(true)
      if (!verdict.ok || verdict.tier !== 'trial') throw new Error('ожидался пробный доступ')
      expect(verdict.remaining).toBe(2)
    })

    it('saleListing (карточка Amazon/Etsy) тоже доступна в пробном тире гостю', async () => {
      user = null
      rpc.mockResolvedValue({ data: { ok: true, remaining: 2 }, error: null })
      const verdict = await assertAiAllowed('saleListing')
      expect(verdict.ok).toBe(true)
      if (!verdict.ok || verdict.tier !== 'trial') throw new Error('ожидался пробный доступ')
      expect(verdict.remaining).toBe(2)
      expect(verdict.subjects.map((s) => s.kind)).toEqual(['guest', 'ip'])
    })

    it('исчерпанный guest при живом ip -> trialSpent', async () => {
      user = null
      rpc.mockResolvedValue({ data: { ok: false, blocked: 'guest' }, error: null })
      expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'trialSpent', remaining: 0 })
    })

    it('исчерпанный ip при живом guest -> trialSpent', async () => {
      user = null
      rpc.mockResolvedValue({ data: { ok: false, blocked: 'ip' }, error: null })
      expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'trialSpent', remaining: 0 })
    })

    it('Pro не трогает consume_free_trial', async () => {
      pro = true
      rpc.mockResolvedValue({ data: 1, error: null })
      await assertAiAllowed('promoShots')
      expect(rpc).toHaveBeenCalledWith('consume_ai_quota', expect.anything())
    })

    it('units больше FREE_TRIAL_MAX_UNITS отказывает без похода в базу', async () => {
      user = null
      const verdict = await assertAiAllowed('promoShots', 2)
      expect(verdict).toEqual({ ok: false, reason: 'trialSpent', remaining: 0 })
      expect(rpc).not.toHaveBeenCalled()
    })

    it('без FREE_TRIAL_SECRET гость получает anonymous', async () => {
      freeTrialSecret = ''
      user = null
      expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'anonymous', remaining: 0 })
      expect(rpc).not.toHaveBeenCalled()
    })

    it('фича вне AI_TRIAL_FEATURES остаётся Pro-only даже с настроенным тиром', async () => {
      pro = false
      expect(await assertAiAllowed('referenceAnalysis')).toEqual({ ok: false, reason: 'notPro', remaining: 0 })
      expect(rpc).not.toHaveBeenCalled()
    })

    it('ошибка RPC даёт unavailable, а не trialSpent', async () => {
      user = null
      rpc.mockResolvedValue({ data: null, error: { message: 'down' } })
      expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'unavailable', remaining: 0 })
    })

    it('первое обращение гостя ставит подписанную cookie egs_ft', async () => {
      user = null
      rpc.mockResolvedValue({ data: { ok: true, remaining: 2 }, error: null })
      await assertAiAllowed('promoShots')
      expect(cookieSet).toHaveBeenCalledTimes(1)
      expect(cookieSet.mock.calls[0]?.[0]).toBe('egs_ft')
    })

    it('гость с уже проверенной cookie не переставляет её заново', async () => {
      user = null
      const existing = createGuestId()
      cookieStore.set('egs_ft', signGuestCookie('trial-secret', existing))
      rpc.mockResolvedValue({ data: { ok: true, remaining: 2 }, error: null })
      await assertAiAllowed('promoShots')
      expect(cookieSet).not.toHaveBeenCalled()
      const [, args] = rpc.mock.calls[0] as [string, { p_subjects: { kind: string; id: string }[] }]
      expect(args.p_subjects.find((s) => s.kind === 'guest')?.id).toBe(existing)
    })

    it('вошедший без Pro получает субъекты user и ip, а не guest', async () => {
      pro = false
      rpc.mockResolvedValue({ data: { ok: true, remaining: 1 }, error: null })
      await assertAiAllowed('promoShots')
      const [, args] = rpc.mock.calls[0] as [string, { p_subjects: { kind: string; id: string }[] }]
      expect(args.p_subjects.map((s) => s.kind)).toEqual(['user', 'ip'])
      expect(args.p_subjects[0]?.id).toBe('user-1')
      expect(cookieSet).not.toHaveBeenCalled()
    })
  })
})

describe('releaseAiQuota', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: 0, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('возвращает ровно то, что зарезервировано', async () => {
    await releaseAiQuota({ ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 1, used: 3, remaining: 27 })
    expect(rpc).toHaveBeenCalledWith('release_ai_quota', { p_user_id: 'user-1', p_period: '2026-08', p_cost: 1 })
  })

  it('бесплатную фичу возвращать нечем: в базу не ходит', async () => {
    await releaseAiQuota({ ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('упавший возврат не бросает: это одна единица из тридцати, а не сбой ответа', async () => {
    rpc.mockRejectedValue(new Error('нет связи'))
    await expect(
      releaseAiQuota({ ok: true, tier: 'pro', userId: 'user-1', period: '2026-08', cost: 1, used: 3, remaining: 27 }),
    ).resolves.toBeUndefined()
  })

  it('пробный грант зовёт release_free_trial по своим субъектам', async () => {
    await releaseAiQuota({
      ok: true,
      tier: 'trial',
      subjects: [
        { kind: 'guest', id: 'g-1', limit: FREE_TRIAL_LIMIT },
        { kind: 'ip', id: 'hash', limit: 10 },
      ],
      cost: 1,
      remaining: 2,
    })
    expect(rpc).toHaveBeenCalledWith('release_free_trial', {
      p_subjects: [
        { kind: 'guest', id: 'g-1', limit: FREE_TRIAL_LIMIT },
        { kind: 'ip', id: 'hash', limit: 10 },
      ],
      p_cost: 1,
    })
  })
})

describe('getAiAccess', () => {
  beforeEach(() => {
    gemini = true
    fal = false
    freeTrialSecret = ''
    supabase = true
    service = true
    pro = true
    user = { id: 'user-1', email: 'a@example.com' }
    rpc.mockReset()
    maybeSingle.mockReset()
    maybeSingle.mockResolvedValue({ data: { used: 4 }, error: null })
    cookieStore = new Map()
    cookieSet.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('без ключа Gemini и без fal это демо-режим: замка нет, потому что платить не за что', async () => {
    gemini = false
    expect(await getAiAccess()).toEqual({ state: 'mock', limit: 30, used: 0, remaining: 30, tier: null })
    expect(isAiDemoMode()).toBe(true)
  })

  it('только fal без Gemini уже не демо-режим', async () => {
    gemini = false
    fal = true
    expect(isAiDemoMode()).toBe(false)
  })

  it('без Supabase или service-ключа состояние unavailable', async () => {
    supabase = false
    expect((await getAiAccess()).state).toBe('unavailable')
    supabase = true
    service = false
    expect((await getAiAccess()).state).toBe('unavailable')
  })

  it('гость без пробного тира видит приглашение войти', async () => {
    user = null
    expect((await getAiAccess()).state).toBe('anonymous')
  })

  it('вошедший без подписки и без пробного тира видит free', async () => {
    pro = false
    expect((await getAiAccess()).state).toBe('free')
  })

  it('подписчик видит остаток месяца с тиром pro', async () => {
    expect(await getAiAccess()).toEqual({ state: 'pro', limit: 30, used: 4, remaining: 26, tier: 'pro' })
  })

  it('пустая строка счётчика значит полную квоту', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await getAiAccess()).toEqual({ state: 'pro', limit: 30, used: 0, remaining: 30, tier: 'pro' })
  })

  it('ничего не резервирует: это только чтение для интерфейса', async () => {
    await getAiAccess()
    expect(rpc).not.toHaveBeenCalled()
  })

  describe('пробный тир настроен', () => {
    beforeEach(() => {
      fal = true
      freeTrialSecret = 'trial-secret'
    })

    it('гость без cookie видит полный остаток и в базу не ходит', async () => {
      user = null
      const access = await getAiAccess()
      expect(access).toEqual({ state: 'trial', limit: FREE_TRIAL_LIMIT, used: 0, remaining: FREE_TRIAL_LIMIT, tier: 'trial' })
      expect(maybeSingle).not.toHaveBeenCalled()
    })

    it('гость с cookie видит собственный остаток', async () => {
      user = null
      const guestId = createGuestId()
      cookieStore.set('egs_ft', signGuestCookie('trial-secret', guestId))
      maybeSingle.mockResolvedValue({ data: { used: 1 }, error: null })
      expect(await getAiAccess()).toEqual({ state: 'trial', limit: FREE_TRIAL_LIMIT, used: 1, remaining: FREE_TRIAL_LIMIT - 1, tier: 'trial' })
    })

    it('исчерпанный гость видит trialSpent', async () => {
      user = null
      const guestId = createGuestId()
      cookieStore.set('egs_ft', signGuestCookie('trial-secret', guestId))
      maybeSingle.mockResolvedValue({ data: { used: FREE_TRIAL_LIMIT }, error: null })
      expect((await getAiAccess()).state).toBe('trialSpent')
    })

    it('вошедший без Pro читает остаток по своему user.id', async () => {
      pro = false
      maybeSingle.mockResolvedValue({ data: { used: 2 }, error: null })
      expect((await getAiAccess()).state).toBe('trial')
    })
  })
})
