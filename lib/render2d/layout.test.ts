import { describe, expect, it } from 'vitest'
import { ROW_LABEL_MARGIN_MM, boardLayout } from './layout'

const model = { widthMm: 300, lengthMm: 450 }

describe('boardLayout', () => {
  it('без колонки номеров не добавляет отступ', () => {
    const l = boardLayout(model, { maxPx: 900 })
    expect(l.marginMm).toBe(0)
    expect(l.totalWidthMm).toBe(300)
    expect(l.viewBox).toBe('0 0 300 450')
  })

  it('с колонкой номеров расширяет viewBox ровно на маржу', () => {
    const l = boardLayout(model, { maxPx: 900, withRowLabels: true })
    expect(l.marginMm).toBe(ROW_LABEL_MARGIN_MM)
    expect(l.totalWidthMm).toBe(300 + ROW_LABEL_MARGIN_MM)
    expect(l.viewBox).toBe(`0 0 ${300 + ROW_LABEL_MARGIN_MM} 450`)
  })

  it('масштабирует по наибольшей стороне, включая подпись', () => {
    const l = boardLayout(model, { maxPx: 900, captionMm: 50 })
    expect(l.totalHeightMm).toBe(500)
    expect(l.scale).toBeCloseTo(900 / 500, 10)
    expect(l.heightPx).toBeCloseTo(900, 6)
    expect(l.widthPx).toBeCloseTo(300 * (900 / 500), 6)
  })

  it('нулевая доска не даёт NaN и не делит на ноль', () => {
    const l = boardLayout({ widthMm: 0, lengthMm: 0 }, { maxPx: 640 })
    expect(Number.isFinite(l.scale)).toBe(true)
    expect(l.widthPx).toBe(0)
    expect(l.heightPx).toBe(0)
  })
})
