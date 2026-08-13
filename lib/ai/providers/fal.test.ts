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
