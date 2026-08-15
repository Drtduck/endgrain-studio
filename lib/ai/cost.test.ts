import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('providerCostCents', () => {
  const original = process.env['AI_FRAME_COST_CENTS']

  beforeEach(() => {
    delete process.env['AI_FRAME_COST_CENTS']
  })

  afterEach(() => {
    if (original === undefined) delete process.env['AI_FRAME_COST_CENTS']
    else process.env['AI_FRAME_COST_CENTS'] = original
  })

  it('по умолчанию 8 центов за кадр', async () => {
    const { AI_FRAME_COST_CENTS, providerCostCents } = await import('./cost')
    expect(AI_FRAME_COST_CENTS).toBe(8)
    expect(providerCostCents(1)).toBe(8)
    expect(providerCostCents(4)).toBe(32)
  })

  it('читает переопределение из env', async () => {
    process.env['AI_FRAME_COST_CENTS'] = '5'
    vi.resetModules()
    const { AI_FRAME_COST_CENTS, providerCostCents } = await import('./cost')
    expect(AI_FRAME_COST_CENTS).toBe(5)
    expect(providerCostCents(3)).toBe(15)
  })

  it('никогда не уходит в минус и не дробит центы', async () => {
    const { providerCostCents } = await import('./cost')
    expect(providerCostCents(0)).toBe(0)
    expect(providerCostCents(-3)).toBe(0)
  })
})
