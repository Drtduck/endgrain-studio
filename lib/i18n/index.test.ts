import { describe, it, expect } from 'vitest'
import { dictionaries, t } from './index'
import ru from './ru'
import en from './en'

describe('i18n', () => {
  it('has the same keys in both locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort())
  })

  it('never uses an em dash', () => {
    const EM_DASH = String.fromCharCode(0x2014)
    for (const dict of Object.values(dictionaries)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.includes(EM_DASH), `ключ ${key}`).toBe(false)
      }
    }
  })

  it('has a message for every diagnostic code', () => {
    const codes = ['MIN_STRIP_WIDTH', 'PLANER_WIDTH', 'PLANING_ALLOWANCE', 'DEPTH_LIMIT', 'PANEL_NOT_FOUND',
      'EMPTY_PANEL', 'DIMENSION_SANITY', 'RAGGED_BOARD', 'ANGLE_UNSUPPORTED', 'SHRINKAGE_MISMATCH', 'CELL_BUDGET']
    for (const code of codes) expect(ru).toHaveProperty(`diag.${code}`)
  })

  it('interpolates parameters', () => {
    expect(t('ru', 'diag.MIN_STRIP_WIDTH', { widthMm: 3, minMm: 4 })).toContain('3')
    expect(t('ru', 'diag.MIN_STRIP_WIDTH', { widthMm: 3, minMm: 4 })).toContain('4')
  })

  it('returns the key when it is missing', () => {
    // @ts-expect-error намеренно несуществующий ключ
    expect(t('ru', 'нет.такого.ключа')).toBe('нет.такого.ключа')
  })

  it('formats numeric params without float tails', () => {
    const out = t('ru', 'diag.RAGGED_BOARD', { minMm: 100.10000000000001, maxMm: 120 })
    expect(out).not.toContain('000000')
    expect(out).toContain('100.1')
  })
})
