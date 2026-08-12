import { describe, it, expect } from 'vitest'
import { MM_PER_INCH, formatMm, inchToMm, mm3ToBoardFeet, mmToInch } from './units'
import { displayToMm, mmToDisplay, unitStepMm } from './units'

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

describe('представление размеров в полях ввода', () => {
  it('печатает миллиметры без хвостовых нулей', () => {
    expect(mmToDisplay(30, 'mm')).toBe('30')
    expect(mmToDisplay(30.5, 'mm')).toBe('30.5')
    expect(mmToDisplay(30.456, 'mm')).toBe('30.46')
  })

  it('печатает дюймы с тремя знаками', () => {
    expect(mmToDisplay(25.4, 'in')).toBe('1')
    expect(mmToDisplay(12.7, 'in')).toBe('0.5')
    // Столярный шаг 1/16" = 0.0625": три знака держат его без потерь, два - нет.
    expect(mmToDisplay(inchToMm(1 / 16), 'in')).toBe('0.063')
    expect(mmToDisplay(240, 'in')).toBe('9.449')
  })

  it('читает число в текущих единицах обратно в миллиметры', () => {
    expect(displayToMm('30', 'mm')).toBe(30)
    expect(displayToMm('1', 'in')).toBeCloseTo(25.4, 9)
    expect(displayToMm('1,5', 'in')).toBeCloseTo(38.1, 9)
  })

  it('возвращает null на нечисловом вводе', () => {
    expect(displayToMm('', 'mm')).toBe(null)
    expect(displayToMm('  ', 'mm')).toBe(null)
    expect(displayToMm('тридцать', 'mm')).toBe(null)
    expect(displayToMm('Infinity', 'mm')).toBe(null)
  })

  it('round-trip не теряет значение в пределах отображаемой точности', () => {
    for (const mm of [4, 25, 30.5, 330, 1200]) {
      expect(displayToMm(mmToDisplay(mm, 'mm'), 'mm')).toBeCloseTo(mm, 2)
      // Тысячная дюйма - это 0.0254 мм, так что обратный разбор обязан держаться
      // заметно точнее половины миллиметра.
      expect(Math.abs(displayToMm(mmToDisplay(mm, 'in'), 'in')! - mm)).toBeLessThan(0.13)
    }
  })

  it('шаг поля соответствует единицам', () => {
    expect(unitStepMm('mm')).toBe(1)
    expect(unitStepMm('in')).toBeCloseTo(25.4 / 16, 9)
  })
})
