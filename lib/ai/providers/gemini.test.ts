import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/promo/config', () => ({ GEMINI_API_KEY: 'test-gemini' }))

function geminiOk(): Response {
  return {
    ok: true,
    json: () =>
      Promise.resolve({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] }),
  } as unknown as Response
}

/** 200 без кандидатов: модель отказалась рисовать по своим правилам. */
function geminiBlocked(): Response {
  return { ok: true, json: () => Promise.resolve({ candidates: [] }) } as unknown as Response
}

describe('lib/ai/providers/gemini', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('успешный ответ отдаёт data-url картинки с провайдером gemini', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiOk()))
    const { generate } = await import('./gemini')
    const outcome = await generate({ prompt: 'hero shot', referencePngBase64: 'AAAA' })
    expect(outcome).toEqual({ kind: 'image', dataUrl: 'data:image/png;base64,AAAA', provider: 'gemini' })
  })

  it('200 без кандидатов это blocked, а не failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiBlocked()))
    const { generate } = await import('./gemini')
    const outcome = await generate({ prompt: 'hero shot' })
    expect(outcome).toEqual({ kind: 'blocked', provider: 'gemini' })
  })

  it('HTTP 429 даёт failed с retryable: true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: { status: 'RESOURCE_EXHAUSTED' } }),
      } as unknown as Response),
    )
    const { generate } = await import('./gemini')
    const outcome = await generate({ prompt: 'hero shot' })
    expect(outcome).toEqual({ kind: 'failed', provider: 'gemini', retryable: true })
  })

  it('HTTP 401 даёт failed с retryable: false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { status: 'UNAUTHENTICATED' } }),
      } as unknown as Response),
    )
    const { generate } = await import('./gemini')
    const outcome = await generate({ prompt: 'hero shot' })
    expect(outcome).toEqual({ kind: 'failed', provider: 'gemini', retryable: false })
  })

  it('таймаут и сетевой сбой дают failed, retryable: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { generate } = await import('./gemini')
    const outcome = await generate({ prompt: 'hero shot' })
    expect(outcome).toEqual({ kind: 'failed', provider: 'gemini', retryable: true })
  })

  it('ключ и тело ответа не попадают в лог', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) } as unknown as Response))
    const { generate } = await import('./gemini')
    await generate({ prompt: 'hero shot' })
    for (const call of spy.mock.calls) expect(String(call[0])).not.toContain('test-gemini')
  })

  it('ключ уезжает заголовком, а не в адресной строке', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk())
    vi.stubGlobal('fetch', fetchMock)
    const { generate } = await import('./gemini')
    await generate({ prompt: 'hero shot' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).not.toContain('test-gemini')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini')
  })

  it('без референса отправляет только текстовую часть промпта', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk())
    vi.stubGlobal('fetch', fetchMock)
    const { generate } = await import('./gemini')
    await generate({ prompt: 'hero shot' })
    const body = String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)
    expect(body).not.toContain('inlineData')
  })

  it('geminiProvider объявляет id gemini и tier good', async () => {
    const { geminiProvider } = await import('./gemini')
    expect(geminiProvider.id).toBe('gemini')
    expect(geminiProvider.tier).toBe('good')
  })
})
