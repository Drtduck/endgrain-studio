import { describe, expect, it } from 'vitest'
import { OPT_IN_COUNTRIES, consentRegime } from './regions'

describe('consentRegime', () => {
  it('даёт opt-in для стран ЕС', () => {
    for (const country of ['DE', 'FR', 'PL', 'ES', 'SE', 'NL', 'IT']) {
      expect(consentRegime(country), country).toBe('opt-in')
    }
  })

  it('даёт opt-in для ЕЭЗ, UK, Швейцарии и РФ', () => {
    for (const country of ['IS', 'LI', 'NO', 'GB', 'CH', 'RU']) {
      expect(consentRegime(country), country).toBe('opt-in')
    }
  })

  it('даёт opt-out для остального мира', () => {
    for (const country of ['US', 'CA', 'BR', 'AU', 'JP']) {
      expect(consentRegime(country), country).toBe('opt-out')
    }
  })

  it('без заголовка страны даёт строгий opt-in', () => {
    expect(consentRegime(null)).toBe('opt-in')
    expect(consentRegime(undefined)).toBe('opt-in')
    expect(consentRegime('')).toBe('opt-in')
    expect(consentRegime('   ')).toBe('opt-in')
  })

  it('нормализует регистр и пробелы', () => {
    expect(consentRegime(' de ')).toBe('opt-in')
    expect(consentRegime('us')).toBe('opt-out')
  })

  it('список стран не потерял ни одной записи по недосмотру', () => {
    // 27 ЕС + 3 ЕЭЗ + 2 (UK, CH) + 1 (RU)
    expect(OPT_IN_COUNTRIES.length).toBe(33)
    expect(new Set(OPT_IN_COUNTRIES).size).toBe(OPT_IN_COUNTRIES.length)
  })
})
