import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ImageOutcome, ImageProvider, ImageRequest } from './types'

/**
 * types.ts обязан оставаться чистым: ни одного импорта сети или секретов,
 * его читает и клиентский код (панель показывает, какой моделью нарисован
 * кадр). Тест ловит момент, когда кто-то по инерции затянет сюда fetch
 * или ключ.
 */
describe('lib/ai/providers/types', () => {
  it('файл не содержит импортов и не помечен server-only', () => {
    const source = readFileSync(join(process.cwd(), 'lib/ai/providers/types.ts'), 'utf8')
    expect(source).not.toContain('import ')
    expect(source).not.toContain('server-only')
    expect(source).not.toContain('fetch(')
  })

  it('исходы различают image, blocked и failed', () => {
    const image: ImageOutcome = { kind: 'image', dataUrl: 'data:image/png;base64,AA', provider: 'mock' }
    const blocked: ImageOutcome = { kind: 'blocked', provider: 'gemini' }
    const failed: ImageOutcome = { kind: 'failed', provider: 'fal', retryable: true }
    expect(image.kind).toBe('image')
    expect(blocked.kind).toBe('blocked')
    expect(failed.kind).toBe('failed')
  })

  it('провайдер реализует единый интерфейс generate', async () => {
    const req: ImageRequest = { prompt: 'a walnut board' }
    const provider: ImageProvider = {
      id: 'mock',
      tier: 'cheap',
      generate: (r) => Promise.resolve({ kind: 'image', dataUrl: `data:image/png;base64,${r.prompt.length}`, provider: 'mock' }),
    }
    const outcome = await provider.generate(req)
    expect(outcome.kind).toBe('image')
  })
})
