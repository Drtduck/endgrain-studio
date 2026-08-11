import { describe, it, expect } from 'vitest'
import { MM_PER_INCH, formatMm, inchToMm, mm3ToBoardFeet, mmToInch } from './units'

describe('units', () => {
  it('converts mm and inches', () => {
    expect(MM_PER_INCH).toBe(25.4)
    expect(mmToInch(25.4)).toBeCloseTo(1, 9)
    expect(inchToMm(2)).toBeCloseTo(50.8, 9)
    expect(mmToInch(inchToMm(3.75))).toBeCloseTo(3.75, 9)
  })

  it('converts volume to board feet', () => {
    // 1 board foot = 144 куб. дюйма
    expect(mm3ToBoardFeet(144 * 25.4 ** 3)).toBeCloseTo(1, 6)
  })

  it('formats for display in the chosen unit, using the caller-supplied localized label', () => {
    expect(formatMm(25.4, 'mm', 'мм')).toBe('25.4 мм')
    expect(formatMm(25.4, 'mm', 'mm')).toBe('25.4 mm')
    expect(formatMm(25.4, 'in', 'in')).toBe('1.00"')
    expect(formatMm(300, 'mm', 'мм', 0)).toBe('300 мм')
  })
})
