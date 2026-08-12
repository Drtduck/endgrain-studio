import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RateLimitVerdict } from '@/lib/promo/rateLimit'

let gemini = true
let printful = true
let supabase = false
let user: { id: string } | null = null
let verdict: RateLimitVerdict = 'ok'
const take = vi.fn<(key: string, limit: number, now: number) => RateLimitVerdict>(() => verdict)

vi.mock('@/lib/promo/config', () => ({
  GEMINI_API_KEY: 'test-gemini',
  PRINTFUL_API_KEY: 'test-printful',
  isGeminiConfigured: () => gemini,
  isPrintfulConfigured: () => printful,
}))

vi.mock('@/lib/promo/rateLimit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/promo/rateLimit')>('@/lib/promo/rateLimit')
  return { ...actual, promoLimiter: { take: (k: string, l: number, n: number) => take(k, l, n) } }
})

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })),
}))

vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => supabase }))
vi.mock('@/lib/supabase/session', () => ({ getCurrentUser: () => Promise.resolve(user) }))

// Base64 настоящего PNG всегда начинается с магии iVBORw0KGgo.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'
const INPUT = { boardPng: PNG, description: 'end-grain board, walnut and maple' }

function geminiOk(): Response {
  return {
    ok: true,
    json: () => Promise.resolve({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] }),
  } as unknown as Response
}

/** 200 без кандидатов: модель отказалась рисовать по своим правилам. */
function geminiBlocked(): Response {
  return { ok: true, json: () => Promise.resolve({ candidates: [] }) } as unknown as Response
}

describe('app/actions/promo: серия фото', () => {
  beforeEach(() => {
    gemini = true
    printful = true
    supabase = false
    user = null
    verdict = 'ok'
    take.mockClear()
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('без ключа Gemini возвращает мок-режим, счётчик не трогает и в сеть не ходит', async () => {
    gemini = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(res).toEqual({ ok: true, mock: true, kinds: ['hero', 'lifestyle', 'macro', 'package'] })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(take).not.toHaveBeenCalled()
  })

  it('мусор на входе даёт invalid и в сеть не ходит', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction({ boardPng: 'https://example.com/a.png', description: 'x' })).toEqual({
      ok: false,
      error: 'invalid',
    })
    expect(await generatePromoShotsAction({ boardPng: PNG, description: '' })).toEqual({ ok: false, error: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('data-url без магии PNG отбивается как invalid', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction({ ...INPUT, boardPng: 'data:image/png;base64,AAAAAAAAAAAA' })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('превышение лимита даёт rateLimited и ни одного платного запроса', async () => {
    verdict = 'ip'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'rateLimited' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('дневной потолок тоже даёт rateLimited', async () => {
    verdict = 'daily'
    vi.stubGlobal('fetch', vi.fn())
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'rateLimited' })
  })

  it('счётчик получает адрес из x-forwarded-for и обычный лимит для гостя без Supabase', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk()))
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(take).toHaveBeenCalledTimes(1)
    expect(take.mock.calls[0]?.[0]).toBe('203.0.113.7')
    expect(take.mock.calls[0]?.[1]).toBe(5)
  })

  it('Supabase настроен, а человек не вошёл: лимит жёстче', async () => {
    supabase = true
    user = null
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk()))
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(take.mock.calls[0]?.[1]).toBe(2)
  })

  it('вошедший пользователь получает обычный лимит', async () => {
    supabase = true
    user = { id: 'user-1' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk()))
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    expect(take.mock.calls[0]?.[1]).toBe(5)
  })

  it('с ключом делает четыре запроса, каждый с таймаутом, и отдаёт четыре кадра', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk())
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(init.signal).toBeInstanceOf(AbortSignal)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images.map((i) => i.kind)).toEqual(['hero', 'lifestyle', 'macro', 'package'])
    expect(res.images[0]?.dataUrl).toBe('data:image/png;base64,AAAA')
  })

  it('ключ уезжает заголовком, а не в адресной строке', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk())
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('test-gemini')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini')
  })

  it('брошенный fetch на одном кадре не выбрасывает три остальных', async () => {
    let call = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      call += 1
      return call === 1 ? Promise.reject(new Error('network down')) : Promise.resolve(geminiOk())
    })
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(res.ok).toBe(true)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images).toHaveLength(3)
  })

  it('битый JSON на одном кадре тоже стоит только этого кадра', async () => {
    let call = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      call += 1
      return Promise.resolve(
        call === 1
          ? ({ ok: true, json: () => Promise.reject(new Error('bad json')) } as unknown as Response)
          : geminiOk(),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images).toHaveLength(3)
  })

  it('HTTP-ошибка кадра не роняет серию', async () => {
    let call = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      call += 1
      return Promise.resolve(
        call === 1
          ? ({ ok: false, status: 429, json: () => Promise.resolve({ error: { status: 'RESOURCE_EXHAUSTED' } }) } as unknown as Response)
          : geminiOk(),
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images).toHaveLength(3)
  })

  it('отказ модели на всех кадрах отличается от сетевого сбоя', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiBlocked()))
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'blocked' })
  })

  it('упавшая сеть на всех кадрах даёт failed, а не исключение', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'failed' })
  })

  it('в лог не утекает ключ', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) }))
    const { generatePromoShotsAction } = await import('./promo')
    await generatePromoShotsAction(INPUT)
    for (const call of spy.mock.calls) expect(String(call[0])).not.toContain('test-gemini')
  })
})

describe('app/actions/promo: мерч', () => {
  beforeEach(() => {
    printful = true
    vi.unstubAllGlobals()
  })

  it('без ключа Printful честно отвечает printful: false', async () => {
    printful = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction()).toEqual({ printful: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('с ключом отвечает printful: true и наружу всё равно не ходит', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction()).toEqual({ printful: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
