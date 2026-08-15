import { describe, expect, it } from 'vitest'
import { AI_PACKS, aiPack, isAiPackId, perFrameCents } from './packs'

describe('AI_PACKS', () => {
  it('три пакета с наценкой x2.5 к себестоимости 8 центов за кадр', () => {
    expect(AI_PACKS).toEqual([
      { id: 'frames10', frames: 10, priceCents: 200 },
      { id: 'frames30', frames: 30, priceCents: 500 },
      { id: 'frames100', frames: 100, priceCents: 1500 },
    ])
  })

  it('цена за кадр падает с размером пакета', () => {
    const [pack10, pack30, pack100] = AI_PACKS
    if (pack10 === undefined || pack30 === undefined || pack100 === undefined) throw new Error('ожидалось три пакета')
    const frame10 = perFrameCents(pack10)
    const frame30 = perFrameCents(pack30)
    const frame100 = perFrameCents(pack100)
    expect(frame10).toBe(20)
    expect(frame30).toBeCloseTo(16.67, 2)
    expect(frame100).toBe(15)
    expect(frame10).toBeGreaterThan(frame30)
    expect(frame30).toBeGreaterThan(frame100)
  })
})

describe('isAiPackId', () => {
  it('true для известных id', () => {
    expect(isAiPackId('frames10')).toBe(true)
    expect(isAiPackId('frames30')).toBe(true)
    expect(isAiPackId('frames100')).toBe(true)
  })

  it('false для чего угодно ещё, включая подделку с клиента', () => {
    expect(isAiPackId('frames999')).toBe(false)
    expect(isAiPackId('')).toBe(false)
    expect(isAiPackId(null)).toBe(false)
    expect(isAiPackId(undefined)).toBe(false)
    expect(isAiPackId(10)).toBe(false)
    expect(isAiPackId({ id: 'frames10' })).toBe(false)
  })
})

describe('aiPack', () => {
  it('возвращает пакет по id', () => {
    expect(aiPack('frames100')).toEqual({ id: 'frames100', frames: 100, priceCents: 1500 })
  })

  it('бросает на неизвестном id: вызывающий обязан проверить isAiPackId раньше', () => {
    // @ts-expect-error - намеренно передаём id, которого нет
    expect(() => aiPack('bogus')).toThrow()
  })
})
