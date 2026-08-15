import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ETSY_TAG_COUNT } from './listing'

let geminiKeySet = true
let openRouterKeySet = true
vi.mock('@/lib/promo/config', () => ({
  get GEMINI_API_KEY() {
    return geminiKeySet ? 'test-gemini' : ''
  },
  get OPENROUTER_API_KEY() {
    return openRouterKeySet ? 'test-openrouter' : ''
  },
  OPENROUTER_TEXT_MODEL: 'nvidia/nemotron-3-super-120b-a12b:free',
  isGeminiConfigured: () => geminiKeySet,
  isOpenRouterConfigured: () => openRouterKeySet,
}))

function validPayload(): unknown {
  return {
    title: 'Walnut End-Grain Cutting Board',
    bullets: ['one', 'two', 'three', 'four', 'five'],
    keywords: Array.from({ length: ETSY_TAG_COUNT }, (_, i) => `tag${i}`),
    description: 'A handmade end-grain cutting board made of real walnut hardwood.',
    materials: ['Black walnut'],
    care: 'Hand wash only.',
  }
}

/** Огрызок с плейсхолдерами вместо title/description: имитирует nemotron, у которой reasoning съел max_tokens. */
function placeholderPayload(): unknown {
  return {
    title: '...',
    bullets: ['one', 'two', 'three', 'four', 'five'],
    keywords: Array.from({ length: ETSY_TAG_COUNT }, (_, i) => `tag${i}`),
    description: '...',
    materials: ['Black walnut'],
    care: 'Hand wash only.',
  }
}

function geminiOk(): { ok: true; json: () => Promise<unknown> } {
  return { ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(validPayload()) }] } }] }) }
}

function geminiFail(): { ok: false; status: number; json: () => Promise<unknown> } {
  return { ok: false, status: 429, json: () => Promise.resolve({ error: { status: 'RESOURCE_EXHAUSTED' } }) }
}

function openRouterOk(content: string): { ok: true; json: () => Promise<unknown> } {
  return { ok: true, json: () => Promise.resolve({ choices: [{ message: { content } }] }) }
}

function openRouterFail(): { ok: false; status: number; json: () => Promise<unknown> } {
  return { ok: false, status: 500, json: () => Promise.resolve({ error: { message: 'server error' } }) }
}

/** URL уходит первым позиционным аргументом fetch: различаем Gemini/OpenRouter по хосту. */
function isOpenRouterCall(args: unknown[]): boolean {
  return typeof args[0] === 'string' && args[0].includes('openrouter.ai')
}

describe('lib/promo/listingRequest', () => {
  beforeEach(() => {
    geminiKeySet = true
    openRouterKeySet = true
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('Gemini отвечает валидно: OpenRouter не трогается вовсе', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk())
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Gemini падает, OpenRouter отвечает валидным JSON в ```json-заборе: ok:true', async () => {
    const fetchMock = vi.fn().mockImplementation((...args: unknown[]) =>
      isOpenRouterCall(args) ? Promise.resolve(openRouterOk('```json\n' + JSON.stringify(validPayload()) + '\n```')) : Promise.resolve(geminiFail()),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res.ok).toBe(true)
    const openRouterCall = fetchMock.mock.calls.find((c) => isOpenRouterCall(c))
    expect(openRouterCall).toBeDefined()
    const body = JSON.parse((openRouterCall?.[1] as { body: string }).body) as { model: string }
    expect(body.model).toBe('nvidia/nemotron-3-super-120b-a12b:free')
  })

  it('тело запроса к OpenRouter отключает reasoning и содержит system-сообщение', async () => {
    geminiKeySet = false
    const fetchMock = vi.fn().mockResolvedValue(openRouterOk(JSON.stringify(validPayload())))
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res.ok).toBe(true)
    const openRouterCall = fetchMock.mock.calls.find((c) => isOpenRouterCall(c))
    const body = JSON.parse((openRouterCall?.[1] as { body: string }).body) as {
      reasoning?: { enabled: boolean }
      messages: { role: string; content: string }[]
    }
    expect(body.reasoning).toEqual({ enabled: false })
    expect(body.messages[0]?.role).toBe('system')
    expect(body.messages[1]?.role).toBe('user')
  })

  it('OpenRouter отвечает огрызком с плейсхолдерами (title/description = "..."): карточка отбрасывается, ok:false', async () => {
    geminiKeySet = false
    const fetchMock = vi.fn().mockResolvedValue(openRouterOk(JSON.stringify(placeholderPayload())))
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res).toEqual({ ok: false })
    // основная модель + запасной автороутер: обе попытки отбракованы валидацией содержательности
    expect(fetchMock.mock.calls.filter((c) => isOpenRouterCall(c))).toHaveLength(2)
  })

  it('Gemini отвечает огрызком с плейсхолдерами: отбрасывается, OpenRouter пробуется дальше', async () => {
    const fetchMock = vi.fn().mockImplementation((...args: unknown[]) =>
      isOpenRouterCall(args)
        ? Promise.resolve(openRouterOk(JSON.stringify(validPayload())))
        : Promise.resolve({ ok: true, json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(placeholderPayload()) }] } }] }) }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res.ok).toBe(true)
    expect(fetchMock.mock.calls.filter((c) => isOpenRouterCall(c))).toHaveLength(1)
  })

  it('основная бесплатная модель падает, запасной автороутер отвечает: ok:true', async () => {
    let openRouterCalls = 0
    const fetchMock = vi.fn().mockImplementation((...args: unknown[]) => {
      if (!isOpenRouterCall(args)) return Promise.resolve(geminiFail())
      openRouterCalls += 1
      if (openRouterCalls === 1) return Promise.resolve(openRouterFail())
      return Promise.resolve(openRouterOk(JSON.stringify(validPayload())))
    })
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res.ok).toBe(true)
    expect(openRouterCalls).toBe(2)
    const secondCall = fetchMock.mock.calls.filter((c) => isOpenRouterCall(c))[1]
    const body = JSON.parse((secondCall?.[1] as { body: string }).body) as { model: string }
    expect(body.model).toBe('openrouter/free')
  })

  it('Gemini не настроен, OpenRouter отвечает с прозой вокруг JSON: ok:true', async () => {
    geminiKeySet = false
    const fetchMock = vi.fn().mockImplementation((...args: unknown[]) =>
      isOpenRouterCall(args) ? Promise.resolve(openRouterOk(`Here you go:\n${JSON.stringify(validPayload())}\nHope this helps.`)) : Promise.reject(new Error('не должен звать Gemini')),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res.ok).toBe(true)
    expect(fetchMock.mock.calls.filter((c) => isOpenRouterCall(c))).toHaveLength(1)
  })

  it('оба недоступны/оба упали: ok:false', async () => {
    const fetchMock = vi.fn().mockImplementation((...args: unknown[]) => Promise.resolve(isOpenRouterCall(args) ? openRouterFail() : geminiFail()))
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res).toEqual({ ok: false })
  })

  it('ни Gemini, ни OpenRouter не настроены: ok:false, никуда не ходит', async () => {
    geminiKeySet = false
    openRouterKeySet = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res).toEqual({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('основная модель отказала долго (>=10с): запасной автороутер не пробуется', async () => {
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const fetchMock = vi.fn().mockImplementation((...args: unknown[]) => {
      if (!isOpenRouterCall(args)) return Promise.resolve(geminiFail())
      now += 11_000
      return Promise.resolve(openRouterFail())
    })
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res).toEqual({ ok: false })
    expect(fetchMock.mock.calls.filter((c) => isOpenRouterCall(c))).toHaveLength(1)
  })

  it('OpenRouter отвечает пустым content: ok:false после обеих попыток', async () => {
    geminiKeySet = false
    const fetchMock = vi.fn().mockResolvedValue(openRouterOk(''))
    vi.stubGlobal('fetch', fetchMock)
    const { requestListing } = await import('./listingRequest')
    const res = await requestListing('prompt')
    expect(res).toEqual({ ok: false })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
