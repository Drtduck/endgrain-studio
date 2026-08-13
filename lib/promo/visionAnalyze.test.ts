import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/promo/config', () => ({ GEMINI_API_KEY: 'test-gemini' }))

const STYLE = {
  lighting: 'Soft key from the left.',
  angle: 'Slightly above the subject.',
  background: 'Plain warm sweep.',
  palette: 'Warm neutrals.',
  composition: 'Off centre with negative space.',
  mood: 'Calm.',
  lens: '50mm at f/2.8.',
  postProcessing: 'Warm grade, film grain.',
}

function visionOk(payload: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
  } as unknown as Response
}

describe('lib/promo/visionAnalyze', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('разбирает ответ модели в структуру стиля', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(visionOk(STYLE)))
    const { analyzeReferenceImage } = await import('./visionAnalyze')
    const outcome = await analyzeReferenceImage({ mimeType: 'image/jpeg', data: 'AAAA' })
    expect(outcome.kind).toBe('style')
    if (outcome.kind !== 'style') throw new Error('ожидался разбор')
    expect(outcome.style.lighting).toContain('Soft key')
  })

  it('уходит на gemini-2.5-flash с responseSchema, картинка телом запроса', async () => {
    const fetchMock = vi.fn().mockResolvedValue(visionOk(STYLE))
    vi.stubGlobal('fetch', fetchMock)
    const { analyzeReferenceImage } = await import('./visionAnalyze')
    await analyzeReferenceImage({ mimeType: 'image/jpeg', data: 'AAAA' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('gemini-2.5-flash:generateContent')
    expect(url).not.toContain('test-gemini')
    const body = String(init.body)
    expect(body).toContain('image/jpeg')
    expect(body).toContain('responseSchema')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('test-gemini')
  })

  it('HTTP-ошибка даёт failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) } as unknown as Response),
    )
    const { analyzeReferenceImage } = await import('./visionAnalyze')
    expect(await analyzeReferenceImage({ mimeType: 'image/jpeg', data: 'AAAA' })).toEqual({ kind: 'failed' })
  })

  it('ответ без разбора и без кандидатов это blocked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ candidates: [] }) } as unknown as Response),
    )
    const { analyzeReferenceImage } = await import('./visionAnalyze')
    expect(await analyzeReferenceImage({ mimeType: 'image/jpeg', data: 'AAAA' })).toEqual({ kind: 'blocked' })
  })

  it('ответ без разбора, но с кандидатом это failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ candidates: [{ content: { parts: [{ text: 'простите, не могу' }] } }] }),
      } as unknown as Response),
    )
    const { analyzeReferenceImage } = await import('./visionAnalyze')
    expect(await analyzeReferenceImage({ mimeType: 'image/jpeg', data: 'AAAA' })).toEqual({ kind: 'failed' })
  })

  it('сетевой сбой это failed, а не исключение', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { analyzeReferenceImage } = await import('./visionAnalyze')
    expect(await analyzeReferenceImage({ mimeType: 'image/jpeg', data: 'AAAA' })).toEqual({ kind: 'failed' })
  })

  it('ключ и тело ответа не попадают в лог', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) } as unknown as Response))
    const { analyzeReferenceImage } = await import('./visionAnalyze')
    await analyzeReferenceImage({ mimeType: 'image/jpeg', data: 'AAAA' })
    for (const call of spy.mock.calls) expect(String(call[0])).not.toContain('test-gemini')
  })
})
