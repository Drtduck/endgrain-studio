import { describe, it, expect } from 'vitest'
import { compile, panelWidthMm, validate, MIN_STRIP_WIDTH_MM, WARN_CELLS } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import ru from '@/lib/i18n/ru'
import en from '@/lib/i18n/en'
import { designDisplayName } from './name'
import { TEMPLATES, groupNameKey, templateById } from './templates'

const OPTS = { shrinkageByPct: shrinkageMap(), knownSpeciesIds: SPECIES.map((s) => s.id) }

describe('библиотека шаблонов', () => {
  it('содержит не меньше 16 шаблонов с уникальными id', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(16)
    expect(new Set(TEMPLATES.map((tpl) => tpl.id)).size).toBe(TEMPLATES.length)
  })

  it('build не кладёт в документ готовую строку имени, только ключ', () => {
    for (const tpl of TEMPLATES) {
      const design = tpl.build()
      expect(design.name).toBe('')
      expect(design.nameKey).toBe(tpl.nameKey)
      // Русское значение, скопированное в en.ts, поймается на этом сравнении.
      expect(designDisplayName(design, 'en')).not.toBe(designDisplayName(design, 'ru'))
      expect(designDisplayName(design, 'en')).not.toMatch(/[\u0400-\u04ff]/)
    }
  })

  it('у каждого шаблона есть имя в обеих локалях', () => {
    for (const tpl of TEMPLATES) {
      expect(tpl.nameKey).toBe(`tpl.${tpl.id}`)
      expect(ru).toHaveProperty(tpl.nameKey)
      expect(en).toHaveProperty(tpl.nameKey)
      expect(ru).toHaveProperty(groupNameKey(tpl.group))
      expect(en).toHaveProperty(groupNameKey(tpl.group))
    }
  })

  it('поиск по id работает и не врёт на неизвестном', () => {
    expect(templateById('checkerboard-classic')?.id).toBe('checkerboard-classic')
    expect(templateById('нет-такого')).toBe(undefined)
  })
})

describe.each(TEMPLATES.map((tpl) => [tpl.id, tpl] as const))('шаблон %s', (id, tpl) => {
  const design = tpl.build()

  it('проходит validate без единой ошибки', () => {
    const errors = validate(design, OPTS).filter((d) => d.level === 'error')
    expect(errors.map((d) => `${d.code} ${JSON.stringify(d.params)}`)).toEqual([])
  })

  it('строит непустую доску в пределах бюджета ячеек', () => {
    const model = compile(design)
    expect(model.cells.length).toBeGreaterThan(0)
    expect(model.cells.length).toBeLessThanOrEqual(WARN_CELLS)
    expect(model.truncated).toBe(false)
    expect(model.widthMm).toBeGreaterThan(0)
    expect(model.lengthMm).toBeGreaterThan(0)
  })

  it('панели помещаются в рейсмус, а полосы не тоньше минимума', () => {
    for (const panel of design.panels) {
      expect(panelWidthMm(panel)).toBeLessThanOrEqual(design.planerWidthMm)
      for (const el of panel.elements) {
        const extent = el.kind === 'strip' ? el.widthMm : el.thicknessMm
        expect(extent).toBeGreaterThanOrEqual(MIN_STRIP_WIDTH_MM)
        if (el.kind === 'sliceRef') expect(el.angleDeg).toBe(0)
      }
    }
    for (const row of design.rows) expect(row.angleDeg).toBe(0)
  })

  it('детерминирован: два вызова build дают один и тот же документ', () => {
    expect(tpl.build()).toEqual(design)
    expect(id).toBe(design.id)
  })

  it('объявляет ровно те породы, которые использует', () => {
    const used = new Set(compile(design).cells.map((c) => c.speciesId))
    expect([...design.species].sort()).toEqual([...used].sort())
  })
})
