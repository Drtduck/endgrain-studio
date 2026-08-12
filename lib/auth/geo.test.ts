import { describe, it, expect } from 'vitest'
import { GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT, hiddenCountries, isGoogleAuthAvailable } from './geo'

describe('hiddenCountries', () => {
  it('возвращает дефолт RU, когда env не задан', () => {
    expect(hiddenCountries(undefined)).toEqual(GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT)
  })

  it('возвращает дефолт, когда env пустой', () => {
    expect(hiddenCountries('')).toEqual(GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT)
  })

  it('парсит список через запятую и приводит к верхнему регистру', () => {
    expect(hiddenCountries('ru, by ,kz')).toEqual(['RU', 'BY', 'KZ'])
  })

  it('игнорирует пустые элементы списка', () => {
    expect(hiddenCountries('ru,,by,')).toEqual(['RU', 'BY'])
  })

  it('возвращает дефолт, если после парсинга список пуст', () => {
    expect(hiddenCountries(' , , ')).toEqual(GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT)
  })
})

describe('isGoogleAuthAvailable', () => {
  it('true, когда страна не определена (нет заголовка, локалка)', () => {
    expect(isGoogleAuthAvailable(null)).toBe(true)
    expect(isGoogleAuthAvailable(undefined)).toBe(true)
  })

  it('false для страны из списка скрытых', () => {
    expect(isGoogleAuthAvailable('RU', ['RU'])).toBe(false)
  })

  it('true для страны вне списка скрытых', () => {
    expect(isGoogleAuthAvailable('US', ['RU'])).toBe(true)
  })

  it('регистронезависимо и с учётом пробелов', () => {
    expect(isGoogleAuthAvailable(' ru ', ['RU'])).toBe(false)
  })
})
