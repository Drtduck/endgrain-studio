import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AI_MONTHLY_LIMIT } from './quota'

let gemini = true
let supabase = true
let service = true
let pro = true
let user: { id: string; email: string } | null = { id: 'user-1', email: 'a@example.com' }

const rpc = vi.fn()
const maybeSingle = vi.fn()

vi.mock('@/lib/promo/config', () => ({ isGeminiConfigured: () => gemini }))
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

const { assertAiAllowed, getAiAccess, isAiDemoMode, releaseAiQuota } = await import('./entitlements')

describe('assertAiAllowed', () => {
  beforeEach(() => {
    gemini = true
    supabase = true
    service = true
    pro = true
    user = { id: 'user-1', email: 'a@example.com' }
    rpc.mockReset()
    maybeSingle.mockReset()
    rpc.mockResolvedValue({ data: 1, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('без настроенного Supabase не пускает: гейт не построить, а модель платная', async () => {
    // Ровно тот дефект, из-за которого правка и затевалась: незаведённый ключ
    // не должен открывать платные фичи всем подряд.
    supabase = false
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'unavailable', remaining: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('аноним получает отказ и в базу за квотой не идёт', async () => {
    user = null
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'anonymous', remaining: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('вошедший без Pro получает notPro и квоту не тратит', async () => {
    pro = false
    expect(await assertAiAllowed('promoShots')).toEqual({ ok: false, reason: 'notPro', remaining: 0 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('Pro получает резерв и остаток из ответа базы', async () => {
    rpc.mockResolvedValue({ data: 5, error: null })
    const verdict = await assertAiAllowed('promoShots')
    expect(verdict).toEqual({ ok: true, userId: 'user-1', period: expect.any(String), cost: 1, used: 5, remaining: 25 })
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
    expect(verdict.cost).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('мокапы мерча без Pro всё равно закрыты', async () => {
    pro = false
    expect(await assertAiAllowed('merchMockups')).toEqual({ ok: false, reason: 'notPro', remaining: 0 })
  })
})

describe('releaseAiQuota', () => {
  beforeEach(() => {
    rpc.mockReset()
    rpc.mockResolvedValue({ data: 0, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('возвращает ровно то, что зарезервировано', async () => {
    await releaseAiQuota({ ok: true, userId: 'user-1', period: '2026-08', cost: 1, used: 3, remaining: 27 })
    expect(rpc).toHaveBeenCalledWith('release_ai_quota', { p_user_id: 'user-1', p_period: '2026-08', p_cost: 1 })
  })

  it('бесплатную фичу возвращать нечем: в базу не ходит', async () => {
    await releaseAiQuota({ ok: true, userId: 'user-1', period: '2026-08', cost: 0, used: 0, remaining: 30 })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('упавший возврат не бросает: это одна единица из тридцати, а не сбой ответа', async () => {
    rpc.mockRejectedValue(new Error('нет связи'))
    await expect(
      releaseAiQuota({ ok: true, userId: 'user-1', period: '2026-08', cost: 1, used: 3, remaining: 27 }),
    ).resolves.toBeUndefined()
  })
})

describe('getAiAccess', () => {
  beforeEach(() => {
    gemini = true
    supabase = true
    service = true
    pro = true
    user = { id: 'user-1', email: 'a@example.com' }
    rpc.mockReset()
    maybeSingle.mockReset()
    maybeSingle.mockResolvedValue({ data: { used: 4 }, error: null })
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('без ключа Gemini это демо-режим: замка нет, потому что платить не за что', async () => {
    gemini = false
    expect(await getAiAccess()).toEqual({ state: 'mock', limit: 30, used: 0, remaining: 30 })
    expect(isAiDemoMode()).toBe(true)
  })

  it('без Supabase или service-ключа состояние unavailable', async () => {
    supabase = false
    expect((await getAiAccess()).state).toBe('unavailable')
    supabase = true
    service = false
    expect((await getAiAccess()).state).toBe('unavailable')
  })

  it('гость видит приглашение войти', async () => {
    user = null
    expect((await getAiAccess()).state).toBe('anonymous')
  })

  it('вошедший без подписки видит free', async () => {
    pro = false
    expect((await getAiAccess()).state).toBe('free')
  })

  it('подписчик видит остаток месяца', async () => {
    expect(await getAiAccess()).toEqual({ state: 'pro', limit: 30, used: 4, remaining: 26 })
  })

  it('пустая строка счётчика значит полную квоту', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await getAiAccess()).toEqual({ state: 'pro', limit: 30, used: 0, remaining: 30 })
  })

  it('ничего не резервирует: это только чтение для интерфейса', async () => {
    await getAiAccess()
    expect(rpc).not.toHaveBeenCalled()
  })
})
