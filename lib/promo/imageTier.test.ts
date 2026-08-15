import { describe, expect, it } from 'vitest'
import { resolveShotTier } from './imageTier'

describe('resolveShotTier', () => {
  it('правка кадра на пробном тире получает good (edit-провайдер с референсом)', () => {
    expect(resolveShotTier('edit', 'trial')).toBe('good')
  })

  it('правка кадра всегда good, даже без гранта (демо)', () => {
    expect(resolveShotTier('edit', null)).toBe('good')
  })

  it('правка купленными кадрами тоже good', () => {
    expect(resolveShotTier('edit', 'credits')).toBe('good')
  })

  it('create на пробном тире остаётся cheap', () => {
    expect(resolveShotTier('presets', 'trial')).toBe('cheap')
    expect(resolveShotTier('reference', 'trial')).toBe('cheap')
  })

  it('create вне пробного тира - good', () => {
    expect(resolveShotTier('presets', 'pro')).toBe('good')
    expect(resolveShotTier('presets', 'credits')).toBe('good')
    expect(resolveShotTier('presets', null)).toBe('good')
  })
})
