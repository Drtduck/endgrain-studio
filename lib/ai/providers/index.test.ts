import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ImageOutcome, ImageProvider } from './types'

let gemini = false
let falOn = false
vi.mock('@/lib/promo/config', () => ({
  isGeminiConfigured: () => gemini,
  isFalConfigured: () => falOn,
}))

vi.mock('./gemini', () => ({ geminiProvider: { id: 'gemini', tier: 'good', generate: vi.fn() } }))
vi.mock('./fal', () => ({ falProvider: { id: 'fal', tier: 'cheap', generate: vi.fn() } }))
vi.mock('./mock', () => ({ mockProvider: { id: 'mock', tier: 'cheap', generate: vi.fn() } }))

describe('lib/ai/providers/index: таблица выбора провайдера', () => {
  beforeEach(() => {
    gemini = false
    falOn = false
  })

  it('нет ни одного ключа: mock на обоих тирах', async () => {
    const { resolveImageProvider } = await import('./index')
    expect(resolveImageProvider('good')?.id).toBe('mock')
    expect(resolveImageProvider('cheap')?.id).toBe('mock')
  })

  it('только GEMINI_API_KEY: good это gemini, cheap выключен целиком', async () => {
    gemini = true
    const { resolveImageProvider } = await import('./index')
    expect(resolveImageProvider('good')?.id).toBe('gemini')
    expect(resolveImageProvider('cheap')).toBeNull()
  })

  it('только FAL_KEY: fal на обоих тирах', async () => {
    falOn = true
    const { resolveImageProvider } = await import('./index')
    expect(resolveImageProvider('good')?.id).toBe('fal')
    expect(resolveImageProvider('cheap')?.id).toBe('fal')
  })

  it('оба ключа: good это gemini с fallback на fal, cheap это fal', async () => {
    gemini = true
    falOn = true
    const { resolveImageProvider } = await import('./index')
    const good = resolveImageProvider('good')
    expect(good?.id).toBe('gemini')
    expect(resolveImageProvider('cheap')?.id).toBe('fal')
  })
})

describe('lib/ai/providers/index: withFallback', () => {
  function providerWith(outcome: ImageOutcome, id: 'gemini' | 'fal' = 'gemini'): ImageProvider {
    return { id, tier: 'good', generate: vi.fn().mockResolvedValue(outcome) }
  }

  it('уходит во второй провайдер на failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const { withFallback } = await import('./index')
    const primary = providerWith({ kind: 'failed', provider: 'gemini', retryable: true })
    const secondary = providerWith({ kind: 'image', dataUrl: 'data:image/png;base64,AA', provider: 'fal' }, 'fal')
    const combined = withFallback(primary, secondary)
    const outcome = await combined.generate({ prompt: 'x' })
    expect(outcome).toEqual({ kind: 'image', dataUrl: 'data:image/png;base64,AA', provider: 'fal' })
    expect(primary.generate).toHaveBeenCalledTimes(1)
    expect(secondary.generate).toHaveBeenCalledTimes(1)
  })

  it('не уходит во второй провайдер на blocked', async () => {
    const { withFallback } = await import('./index')
    const primary = providerWith({ kind: 'blocked', provider: 'gemini' })
    const secondary = providerWith({ kind: 'image', dataUrl: 'data:image/png;base64,AA', provider: 'fal' }, 'fal')
    const combined = withFallback(primary, secondary)
    const outcome = await combined.generate({ prompt: 'x' })
    expect(outcome).toEqual({ kind: 'blocked', provider: 'gemini' })
    expect(secondary.generate).not.toHaveBeenCalled()
  })

  it('успешный первый провайдер не зовёт второй', async () => {
    const { withFallback } = await import('./index')
    const primary = providerWith({ kind: 'image', dataUrl: 'data:image/png;base64,AA', provider: 'gemini' })
    const secondary = providerWith({ kind: 'image', dataUrl: 'data:image/png;base64,BB', provider: 'fal' }, 'fal')
    const combined = withFallback(primary, secondary)
    await combined.generate({ prompt: 'x' })
    expect(secondary.generate).not.toHaveBeenCalled()
  })

  it('логирует переход отдельной строкой', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { withFallback } = await import('./index')
    const primary = providerWith({ kind: 'failed', provider: 'gemini', retryable: true })
    const secondary = providerWith({ kind: 'image', dataUrl: 'data:image/png;base64,AA', provider: 'fal' }, 'fal')
    await withFallback(primary, secondary).generate({ prompt: 'x' })
    expect(spy.mock.calls.some((call) => String(call[0]).includes('ai fallback: gemini -> fal'))).toBe(true)
  })
})
