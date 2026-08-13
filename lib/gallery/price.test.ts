import { describe, it, expect } from 'vitest'
import { PRICE_MAX_CENTS, formatPrice, parsePriceInput } from './price'

describe('parsePriceInput', () => {
  it('ноль и пустая строка это бесплатно', () => {
    expect(parsePriceInput('0')).toBe(0)
    expect(parsePriceInput('')).toBe(0)
    expect(parsePriceInput('   ')).toBe(0)
  })

  it('потолок цены соблюдается', () => {
    expect(parsePriceInput('500')).toBe(50_000)
    expect(parsePriceInput('500.01')).toBeNull()
  })

  it('отрицательное отбивается', () => {
    expect(parsePriceInput('-5')).toBeNull()
  })

  it('дробное округляется до центов', () => {
    expect(parsePriceInput('9.999')).toBe(1000)
    expect(parsePriceInput('9.5')).toBe(950)
  })

  it('строка с запятой как разделителем разбирается', () => {
    expect(parsePriceInput('9,99')).toBe(999)
  })

  it('мусор отбивается', () => {
    expect(parsePriceInput('abc')).toBeNull()
    expect(parsePriceInput('NaN')).toBeNull()
  })
})

describe('formatPrice', () => {
  it('ноль форматируется как «бесплатно» на обеих локалях', () => {
    expect(formatPrice(0, 'ru')).toBe('Бесплатно')
    expect(formatPrice(0, 'en')).toBe('Free')
  })

  it('целые доллары без копеек', () => {
    expect(formatPrice(500, 'en')).toContain('5')
    expect(formatPrice(500, 'en')).not.toContain('.00')
  })

  it('потолок цены форматируется без исключений', () => {
    expect(() => formatPrice(PRICE_MAX_CENTS, 'ru')).not.toThrow()
  })
})
