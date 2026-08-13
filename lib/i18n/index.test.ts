import { describe, it, expect } from 'vitest'
import { dictionaries, plural, t } from './index'
import ru from './ru'
import en from './en'
import { TEMPLATES } from '@/lib/designs/templates'
import { FAMILIES, familyDesignNameKey } from '@/lib/generators/families'
import { SHOTS } from '@/lib/landing/shots'

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

  it('в английском словаре нет ни одного символа кириллицы', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(/[\u0400-\u04ff]/.test(value), `ключ ${key}`).toBe(false)
    }
  })

  it('в русском словаре нет заглушек: значение не равно ключу', () => {
    for (const [key, value] of Object.entries(ru)) {
      // app.title это имя продукта, оно совпадает с собой в обеих локалях по делу.
      if (key === 'app.title') continue
      expect(value, `ключ ${key}`).not.toBe(key)
    }
  })

  it('ключи шаблонов и семейств генератора есть в обеих локалях', () => {
    // В коде эти ключи собираются строкой и кастуются в MessageKey, компилятор их не ловит.
    for (const tpl of TEMPLATES) {
      expect(ru, tpl.id).toHaveProperty(tpl.nameKey)
      expect(en, tpl.id).toHaveProperty(tpl.nameKey)
    }
    for (const family of FAMILIES) {
      expect(ru, family.id).toHaveProperty(family.nameKey)
      expect(en, family.id).toHaveProperty(family.nameKey)
      expect(ru, family.id).toHaveProperty(familyDesignNameKey(family.id))
      expect(en, family.id).toHaveProperty(familyDesignNameKey(family.id))
    }
  })

  it('ключи подписей к снимкам лендинга есть в обеих локалях', () => {
    // `landing.shots.alt.${slug}` тоже собирается строкой и кастуется: шестой снимок
    // без перевода отрендерил бы сырой ключ в alt и в aria-label.
    for (const shot of SHOTS) {
      expect(ru, shot.slug).toHaveProperty(`landing.shots.alt.${shot.slug}`)
      expect(en, shot.slug).toHaveProperty(`landing.shots.alt.${shot.slug}`)
    }
  })

  it('число узоров в тексте лендинга совпадает с числом шаблонов', () => {
    // Число в копирайте написано словом, поэтому одной проверкой длины не обойтись:
    // семнадцатый шаблон обязан уронить тест, а не молча превратить лендинг в неправду.
    const words: Record<number, { ru: string; en: string }> = {
      14: { ru: 'Четырнадцать', en: 'Fourteen' },
      15: { ru: 'Пятнадцать', en: 'Fifteen' },
      16: { ru: 'Шестнадцать', en: 'Sixteen' },
      17: { ru: 'Семнадцать', en: 'Seventeen' },
      18: { ru: 'Восемнадцать', en: 'Eighteen' },
      19: { ru: 'Девятнадцать', en: 'Nineteen' },
      20: { ru: 'Двадцать', en: 'Twenty' },
    }
    const expected = words[TEMPLATES.length]
    expect(expected, `нет числительного для ${TEMPLATES.length} шаблонов`).toBeDefined()
    expect(ru['landing.patterns.body']).toContain(expected?.ru)
    expect(en['landing.patterns.body']).toContain(expected?.en)
  })

  it('has a message for every diagnostic code', () => {
    const codes = ['MIN_STRIP_WIDTH', 'PLANER_WIDTH', 'PLANING_ALLOWANCE', 'DEPTH_LIMIT', 'PANEL_NOT_FOUND',
      'EMPTY_PANEL', 'DIMENSION_SANITY', 'RAGGED_BOARD', 'ANGLE_ROW_UNSUPPORTED', 'ANGLE_RANGE', 'ANGLE_WASTE',
      'SLICE_TOO_SHORT', 'SHRINKAGE_MISMATCH', 'CELL_BUDGET']
    for (const code of codes) expect(ru).toHaveProperty(`diag.${code}`)
  })

  it('печатает единицы пиломатериала по-русски', () => {
    // Столяр читает инструкцию на своём языке: латинские bf и m в русской строке неуместны.
    const line = t('ru', 'meter.speciesRow', { name: 'орех', meters: '1.82', boardFeet: '2.21', costUsd: '$24.57' })
    expect(line).toContain('1.82 м')
    expect(line).toContain(`2.21 ${ru['units.bf']}`)
    expect(line).not.toMatch(/\bbf\b/)
    expect(ru['units.bf']).not.toMatch(/[a-z]/i)
    expect(t('en', 'meter.speciesRow', { name: 'walnut', meters: '1.82', boardFeet: '2.21', costUsd: '$24.57' })).toContain('2.21 bf')
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

  describe('plural', () => {
    const forms = { ru: ['срез', 'среза', 'срезов'], en: ['slice', 'slices'] } as const

    it('russian one/few/many by count', () => {
      expect(plural('ru', 1, forms)).toBe('срез')
      expect(plural('ru', 21, forms)).toBe('срез')
      expect(plural('ru', 2, forms)).toBe('среза')
      expect(plural('ru', 4, forms)).toBe('среза')
      expect(plural('ru', 5, forms)).toBe('срезов')
      expect(plural('ru', 0, forms)).toBe('срезов')
      expect(plural('ru', 11, forms)).toBe('срезов')
      expect(plural('ru', 14, forms)).toBe('срезов')
    })

    it('english singular/plural by count', () => {
      expect(plural('en', 1, forms)).toBe('slice')
      expect(plural('en', 2, forms)).toBe('slices')
      expect(plural('en', 5, forms)).toBe('slices')
    })
  })
})
