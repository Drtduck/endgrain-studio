import { describe, it, expect, vi, beforeEach } from 'vitest'

let gemini = true
let printful = true

vi.mock('@/lib/promo/config', () => ({
  GEMINI_API_KEY: 'test-gemini',
  PRINTFUL_API_KEY: 'test-printful',
  isGeminiConfigured: () => gemini,
  isPrintfulConfigured: () => printful,
}))

const PNG = `data:image/png;base64,${Buffer.from('фейковый png').toString('base64')}`
const INPUT = { boardPng: PNG, description: 'end-grain board, walnut and maple' }

function geminiOk(): Response {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }] }),
  } as unknown as Response
}

describe('app/actions/promo: серия фото', () => {
  beforeEach(() => {
    gemini = true
    printful = true
    vi.unstubAllGlobals()
  })

  it('без ключа Gemini возвращает мок-режим и в сеть не ходит', async () => {
    gemini = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(res).toEqual({ ok: true, mock: true, kinds: ['hero', 'lifestyle', 'macro', 'package'] })
    expect(fetchMock).not.toHaveBeenCalled()
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

  it('с ключом делает четыре запроса и отдаёт четыре кадра', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiOk())
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(res.ok).toBe(true)
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

  it('упавший кадр не роняет серию', async () => {
    let call = 0
    const fetchMock = vi.fn().mockImplementation(() => {
      call += 1
      return Promise.resolve(call === 1 ? ({ ok: false, json: async () => ({}) } as unknown as Response) : geminiOk())
    })
    vi.stubGlobal('fetch', fetchMock)
    const { generatePromoShotsAction } = await import('./promo')
    const res = await generatePromoShotsAction(INPUT)
    if (!res.ok || res.mock) throw new Error('ожидались настоящие кадры')
    expect(res.images).toHaveLength(3)
  })

  it('все четыре кадра пустые дают failed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'failed' })
  })

  it('упавшая сеть даёт failed, а не исключение', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { generatePromoShotsAction } = await import('./promo')
    expect(await generatePromoShotsAction(INPUT)).toEqual({ ok: false, error: 'failed' })
  })
})

describe('app/actions/promo: мерч', () => {
  beforeEach(() => {
    gemini = true
    printful = true
    vi.unstubAllGlobals()
  })

  it('без ключа Printful отдаёт локальные мокапы и прячет кнопку', async () => {
    printful = false
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction({ description: 'board' })).toEqual({ ok: true, source: 'local', printful: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('с ключом, но без публичного адреса узора остаёмся на локальных мокапах и показываем кнопку', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction({ description: 'board' })).toEqual({ ok: true, source: 'local', printful: true })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('не-https адрес узора отбивается как invalid', async () => {
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction({ description: 'board', patternUrl: 'http://example.com/p.png' })).toEqual({
      ok: false,
      error: 'invalid',
    })
  })

  it('с ключом и адресом узора зовёт Printful на каждый товар', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ result: { status: 'completed', mockups: [{ mockup_url: 'https://cdn.printful.com/m.png' }] } }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const { createMerchMockupsAction } = await import('./promo')
    const res = await createMerchMockupsAction({ description: 'board', patternUrl: 'https://example.com/p.png' })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    if (!res.ok || res.source !== 'printful') throw new Error('ожидались мокапы Printful')
    expect(res.mockups.map((m) => m.id)).toEqual(['tshirt', 'mug', 'poster', 'apron'])
  })

  it('Printful ответил отказом на всё: падаем обратно на локальные мокапы', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }))
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction({ description: 'board', patternUrl: 'https://example.com/p.png' })).toEqual({
      ok: true,
      source: 'local',
      printful: true,
    })
  })

  it('упавшая сеть даёт failed, а не исключение', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { createMerchMockupsAction } = await import('./promo')
    expect(await createMerchMockupsAction({ description: 'board', patternUrl: 'https://example.com/p.png' })).toEqual({
      ok: false,
      error: 'failed',
    })
  })
})
