import { describe, expect, it } from 'vitest'
import { bothUnits, oneUnit, speciesName } from './format'

describe('bothUnits', () => {
  it('печатает миллиметры и дюймы разом', () => {
    expect(bothUnits(25.4, 'ru')).toBe('25.4 мм (1.00")')
    expect(bothUnits(25.4, 'en')).toBe('25.4 mm (1.00")')
  })
  it('уважает число знаков', () => {
    expect(bothUnits(300, 'ru', 0)).toBe('300 мм (11.81")')
  })
  it('не содержит длинного тире', () => {
    expect(bothUnits(123.456, 'ru').includes(String.fromCharCode(0x2014))).toBe(false)
  })
})

describe('oneUnit', () => {
  it('в дюймовом режиме даёт только дюймы', () => {
    expect(oneUnit(25.4, 'in', 'ru')).toBe('1.00"')
  })
})

describe('speciesName', () => {
  it('берёт имя из справочника по локали', () => {
    expect(speciesName('walnut', 'ru')).toBe('Орех')
    expect(speciesName('walnut', 'en')).toBe('Black walnut')
  })
  it('неизвестная порода возвращает свой id, а не падает', () => {
    expect(speciesName('unobtainium', 'ru')).toBe('unobtainium')
  })
})
