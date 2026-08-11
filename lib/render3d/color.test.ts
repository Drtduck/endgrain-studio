import { describe, it, expect } from 'vitest'
import { jitteredHex, parseHex, shadeHex, toHex } from './color'

describe('parseHex', () => {
  it('читает шестизначный hex в доли единицы', () => {
    expect(parseHex('#ffffff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    const walnut = parseHex('#5b3a24')
    expect(walnut?.r).toBeCloseTo(0x5b / 255, 6)
    expect(walnut?.g).toBeCloseTo(0x3a / 255, 6)
    expect(walnut?.b).toBeCloseTo(0x24 / 255, 6)
  })

  it('возвращает null на мусоре', () => {
    expect(parseHex('')).toBe(null)
    expect(parseHex('#fff')).toBe(null)
    expect(parseHex('walnut')).toBe(null)
    expect(parseHex('#gggggg')).toBe(null)
  })

  it('round-trip не теряет цвет', () => {
    for (const hex of ['#5b3a24', '#e3caa1', '#a8422a', '#000000', '#ffffff']) {
      const rgb = parseHex(hex)
      expect(rgb).not.toBe(null)
      if (rgb) expect(toHex(rgb)).toBe(hex)
    }
  })
})

describe('shadeHex', () => {
  it('нулевой сдвиг оставляет цвет как есть', () => {
    expect(shadeHex('#5b3a24', 0)).toBe('#5b3a24')
  })

  it('положительный сдвиг светлеет, отрицательный темнеет', () => {
    const base = parseHex('#5b3a24')
    const lighter = parseHex(shadeHex('#5b3a24', 0.3))
    const darker = parseHex(shadeHex('#5b3a24', -0.3))
    expect(base).not.toBe(null)
    if (!base || !lighter || !darker) throw new Error('цвет не разобран')
    expect(lighter.r).toBeGreaterThan(base.r)
    expect(darker.r).toBeLessThan(base.r)
  })

  it('упирается в чёрный и белый без переполнения', () => {
    expect(shadeHex('#5b3a24', 5)).toBe('#ffffff')
    expect(shadeHex('#5b3a24', -5)).toBe('#000000')
  })

  it('неизвестный цвет возвращается без изменений', () => {
    expect(shadeHex('нет-такого-цвета', 0.5)).toBe('нет-такого-цвета')
  })
})

describe('jitteredHex', () => {
  it('детерминирован по значению отклонения', () => {
    expect(jitteredHex('#5b3a24', 0.42)).toBe(jitteredHex('#5b3a24', 0.42))
  })

  it('остаётся в пределах амплитуды: соседние ячейки одной породы всё ещё одна порода', () => {
    const base = parseHex('#5b3a24')
    const shifted = parseHex(jitteredHex('#5b3a24', 1))
    if (!base || !shifted) throw new Error('цвет не разобран')
    expect(Math.abs(shifted.r - base.r)).toBeLessThan(0.1)
  })
})
