import { describe, it, expect } from 'vitest'
import { MAX_CELL_MM, MAX_PANEL_WIDTH_MM, MIN_BOARD_SPAN_MM, MIN_CELL_MM, fitWidths, roundHalf, sumMm } from './fit'

describe('roundHalf', () => {
  it('округляет до половины миллиметра', () => {
    expect(roundHalf(12.24)).toBe(12)
    expect(roundHalf(12.26)).toBe(12.5)
    expect(roundHalf(12.76)).toBe(13)
  })
})

describe('fitWidths', () => {
  it('пустой список остаётся пустым', () => {
    expect(fitWidths([])).toEqual([])
  })

  it('поднимает слишком узкие полосы до минимума', () => {
    const out = fitWidths([1, 2, 3, 4])
    for (const w of out) expect(w).toBeGreaterThanOrEqual(MIN_CELL_MM)
  })

  it('срезает слишком широкие полосы до максимума', () => {
    for (const w of fitWidths([900, 900, 900, 900])) expect(w).toBeLessThanOrEqual(MAX_CELL_MM)
  })

  it('укладывает сумму в рейсмус', () => {
    const out = fitWidths(new Array(14).fill(45))
    expect(sumMm(out)).toBeLessThanOrEqual(MAX_PANEL_WIDTH_MM)
  })

  it('вытягивает слишком узкую доску до минимального габарита', () => {
    const out = fitWidths([8, 8, 8, 8])
    expect(sumMm(out)).toBeGreaterThanOrEqual(MIN_BOARD_SPAN_MM)
  })

  it('выбрасывает лишние полосы, если по минимуму они не влезают', () => {
    const out = fitWidths(new Array(60).fill(10))
    expect(out.length).toBeLessThanOrEqual(Math.floor(MAX_PANEL_WIDTH_MM / MIN_CELL_MM))
    expect(sumMm(out)).toBeLessThanOrEqual(MAX_PANEL_WIDTH_MM)
  })

  it('все значения кратны половине миллиметра', () => {
    for (const w of fitWidths([11.13, 27.77, 33.31, 9.09])) expect(w * 2).toBe(Math.round(w * 2))
  })

  it('сохраняет пропорции, когда всё и так в допуске', () => {
    expect(fitWidths([20, 40, 20])).toEqual([20, 40, 20])
  })

  it('уважает переданные границы', () => {
    const out = fitWidths([100, 100], { min: 10, max: 60, maxTotal: 100, minTotal: 60 })
    expect(sumMm(out)).toBeLessThanOrEqual(100)
    for (const w of out) expect(w).toBeGreaterThanOrEqual(10)
  })

  it('детерминирован', () => {
    const input = [13.7, 41.2, 6.4, 55.9, 22.2]
    expect(fitWidths(input)).toEqual(fitWidths(input))
  })

  it('на случайных входах всегда выдаёт изготовимую панель', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const count = 4 + (seed % 11)
      const widths = Array.from({ length: count }, (_, i) => ((seed * 37 + i * 13) % 90) + 0.5)
      const out = fitWidths(widths)
      const total = sumMm(out)
      expect(total).toBeGreaterThanOrEqual(MIN_BOARD_SPAN_MM)
      expect(total).toBeLessThanOrEqual(MAX_PANEL_WIDTH_MM)
      for (const w of out) expect(w).toBeGreaterThanOrEqual(MIN_CELL_MM)
    }
  })
})
