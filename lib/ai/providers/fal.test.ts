import { beforeEach, describe, expect, it, vi } from 'vitest'

let falKeySet = true
vi.mock('@/lib/promo/config', () => ({
  get FAL_KEY() {
    return falKeySet ? 'test-fal' : ''
  },
  isFalConfigured: () => falKeySet,
}))

const subscribe = vi.fn<(endpoint: string, opts: unknown) => Promise<{ data: unknown }>>()
const config = vi.fn()
vi.mock('@fal-ai/client', () => ({ fal: { config: (c: unknown) => config(c), subscribe: (e: string, o: unknown) => subscribe(e, o) } }))

describe('lib/ai/providers/fal', () => {
  beforeEach(() => {
    falKeySet = true
    subscribe.mockReset()
    config.mockClear()
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('успешный ответ со ссылкой превращается в data-url', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'https://fal.example/img.png' }] } })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      }),
    )
    const { generate } = await import('./fal')
    const outcome = await generate({ prompt: 'walnut board' })
    expect(outcome.kind).toBe('image')
    if (outcome.kind !== 'image') throw new Error('ожидалась картинка')
    expect(outcome.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(outcome.provider).toBe('fal')
  })

  it('запрос уходит на fal-ai/flux/schnell с ожидаемым входом', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'https://fal.example/img.png' }] } })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) }),
    )
    const { generate } = await import('./fal')
    await generate({ prompt: 'walnut board' })
    expect(subscribe).toHaveBeenCalledWith(
      'fal-ai/flux/schnell',
      expect.objectContaining({
        input: expect.objectContaining({
          prompt: 'walnut board',
          image_size: 'square_hd',
          num_images: 1,
          enable_safety_checker: true,
        }),
      }),
    )
  })

  it('недоступная картинка по ссылке даёт failed', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'https://fal.example/img.png' }] } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
    const { generate } = await import('./fal')
    const outcome = await generate({ prompt: 'walnut board' })
    expect(outcome).toEqual({ kind: 'failed', provider: 'fal', retryable: true })
  })

  it('401 от fal даёт failed нерепитабельный', async () => {
    subscribe.mockRejectedValue(Object.assign(new Error('Unauthorized'), { status: 401 }))
    const { generate } = await import('./fal')
    const outcome = await generate({ prompt: 'walnut board' })
    expect(outcome).toEqual({ kind: 'failed', provider: 'fal', retryable: false })
  })

  it('429 от fal даёт failed репитабельный', async () => {
    subscribe.mockRejectedValue(Object.assign(new Error('Too Many Requests'), { status: 429 }))
    const { generate } = await import('./fal')
    const outcome = await generate({ prompt: 'walnut board' })
    expect(outcome).toEqual({ kind: 'failed', provider: 'fal', retryable: true })
  })

  it('safety checker без картинки даёт blocked', async () => {
    subscribe.mockResolvedValue({ data: { images: [], has_nsfw_concepts: [true] } })
    const { generate } = await import('./fal')
    const outcome = await generate({ prompt: 'walnut board' })
    expect(outcome).toEqual({ kind: 'blocked', provider: 'fal' })
  })

  it('флаг has_nsfw_concepts блокирует кадр, даже если ссылка пришла', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'https://fal.example/img.png' }], has_nsfw_concepts: [true] } })
    const { generate } = await import('./fal')
    const outcome = await generate({ prompt: 'walnut board' })
    expect(outcome).toEqual({ kind: 'blocked', provider: 'fal' })
  })

  it('пустой FAL_KEY: провайдер не ходит в сеть и отдаёт failed', async () => {
    falKeySet = false
    const { generate } = await import('./fal')
    const outcome = await generate({ prompt: 'walnut board' })
    expect(outcome).toEqual({ kind: 'failed', provider: 'fal', retryable: false })
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('falProvider объявляет id fal и tier cheap', async () => {
    const { falProvider } = await import('./fal')
    expect(falProvider.id).toBe('fal')
    expect(falProvider.tier).toBe('cheap')
  })
})

/**
 * Pro-тир на nano banana 2. Главное, что тут проверяется: на fal это две
 * разные модели, и выбор между ними идёт по наличию рендера доски. Ошибка в
 * эту сторону тихая: create просто потеряет референс, и человек получит
 * красивую чужую доску вместо своей.
 */
describe('lib/ai/providers/fal: Pro-тир nano banana 2', () => {
  beforeEach(() => {
    falKeySet = true
    subscribe.mockReset()
    config.mockClear()
    vi.unstubAllGlobals()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  function stubImageFetch(): void {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) }),
    )
  }

  it('без референса выбирает create-модель', async () => {
    const { proEndpoint, FAL_PRO_CREATE_ENDPOINT } = await import('./fal')
    expect(proEndpoint({ prompt: 'walnut board' })).toBe(FAL_PRO_CREATE_ENDPOINT)
    expect(FAL_PRO_CREATE_ENDPOINT).toBe('fal-ai/nano-banana-2')
  })

  it('с референсом выбирает edit-модель', async () => {
    const { proEndpoint, FAL_PRO_EDIT_ENDPOINT } = await import('./fal')
    expect(proEndpoint({ prompt: 'walnut board', referencePngBase64: 'AAAA' })).toBe(FAL_PRO_EDIT_ENDPOINT)
    expect(FAL_PRO_EDIT_ENDPOINT).toBe('fal-ai/nano-banana-2/edit')
  })

  it('пустая строка референса это отсутствие референса, а не пустая картинка', async () => {
    const { proEndpoint, FAL_PRO_CREATE_ENDPOINT } = await import('./fal')
    expect(proEndpoint({ prompt: 'walnut board', referencePngBase64: '' })).toBe(FAL_PRO_CREATE_ENDPOINT)
  })

  it('вход create-модели не содержит image_urls', async () => {
    const { proInput } = await import('./fal')
    const input = proInput({ prompt: 'walnut board' })
    expect(input).toEqual({
      prompt: 'walnut board',
      num_images: 1,
      aspect_ratio: '1:1',
      output_format: 'png',
      resolution: '1K',
    })
    expect('image_urls' in input).toBe(false)
  })

  it('вход edit-модели кладёт референс в image_urls как png-Blob', async () => {
    const { proInput } = await import('./fal')
    const png = Buffer.from([137, 80, 78, 71]).toString('base64')
    const input = proInput({ prompt: 'walnut board', referencePngBase64: png })
    const urls = input['image_urls'] as unknown[]
    expect(Array.isArray(urls)).toBe(true)
    expect(urls).toHaveLength(1)
    const blob = urls[0] as Blob
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(Buffer.from(await blob.arrayBuffer())).toEqual(Buffer.from([137, 80, 78, 71]))
  })

  it('генерация без референса уходит в fal-ai/nano-banana-2', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'https://fal.example/img.png' }] } })
    stubImageFetch()
    const { generatePro } = await import('./fal')
    const outcome = await generatePro({ prompt: 'walnut board' })
    expect(outcome.kind).toBe('image')
    expect(subscribe.mock.calls[0]?.[0]).toBe('fal-ai/nano-banana-2')
  })

  it('генерация с референсом уходит в fal-ai/nano-banana-2/edit', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'https://fal.example/img.png' }] } })
    stubImageFetch()
    const { generatePro } = await import('./fal')
    const outcome = await generatePro({ prompt: 'walnut board', referencePngBase64: 'AAAA' })
    expect(outcome.kind).toBe('image')
    expect(subscribe.mock.calls[0]?.[0]).toBe('fal-ai/nano-banana-2/edit')
    const opts = subscribe.mock.calls[0]?.[1] as { input: Record<string, unknown> }
    expect((opts.input['image_urls'] as unknown[])[0]).toBeInstanceOf(Blob)
  })

  it('пустой список images даёт blocked', async () => {
    subscribe.mockResolvedValue({ data: { images: [], description: 'refused' } })
    const { generatePro } = await import('./fal')
    expect(await generatePro({ prompt: 'walnut board' })).toEqual({ kind: 'blocked', provider: 'fal' })
  })

  it('data-url в ответе отдаётся как есть, без второго похода в сеть', async () => {
    subscribe.mockResolvedValue({ data: { images: [{ url: 'data:image/png;base64,AAAA' }] } })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { generatePro } = await import('./fal')
    const outcome = await generatePro({ prompt: 'walnut board' })
    expect(outcome).toEqual({ kind: 'image', dataUrl: 'data:image/png;base64,AAAA', provider: 'fal' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('пустой FAL_KEY: Pro не ходит в сеть и отдаёт failed', async () => {
    falKeySet = false
    const { generatePro } = await import('./fal')
    expect(await generatePro({ prompt: 'walnut board' })).toEqual({ kind: 'failed', provider: 'fal', retryable: false })
    expect(subscribe).not.toHaveBeenCalled()
  })

  it('falProProvider объявляет id fal и tier good', async () => {
    const { falProProvider } = await import('./fal')
    expect(falProProvider.id).toBe('fal')
    expect(falProProvider.tier).toBe('good')
  })
})
