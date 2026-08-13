import { describe, it, expect } from 'vitest'
import { baseDesign, stripsPanel, validate, type Design, type Diagnostic, type DiagnosticCode, type Row } from '@/lib/engine'
import { shrinkageMap } from '@/lib/species'
import { diagnosticText, localizeDiagnosticParams } from './diagnostics'

const row = (id: string, panelId: string, angleDeg = 0): Row => ({ id, panelId, thicknessMm: 30, angleDeg, flip: false, mirror: false, trimMm: 5 })
const one = (panels: Design['panels'], rows: Design['rows']): Design => baseDesign({ panels, rows })

const shrinkageDesign = baseDesign({
  species: ['cherry', 'maple'],
  panels: [stripsPanel('A', ['cherry', 'maple']), stripsPanel('B', ['maple', 'cherry'])],
})

function find(code: string): Diagnostic {
  const d = validate(shrinkageDesign, { shrinkageByPct: shrinkageMap() }).find((x) => x.code === code)
  if (!d) throw new Error(`диагностика ${code} не найдена`)
  return d
}

describe('localizeDiagnosticParams', () => {
  it('подменяет id пород на локализованные названия со строчной буквы', () => {
    const params = localizeDiagnosticParams({ a: 'cherry', b: 'maple', deltaPp: 2.8 }, 'ru')
    expect(params.a).toBe('вишня')
    expect(params.b).toBe('клён')
    expect(params.deltaPp).toBe(2.8)
  })

  it('оставляет неизвестный id как есть', () => {
    expect(localizeDiagnosticParams({ speciesId: 'unobtainium' }, 'ru').speciesId).toBe('unobtainium')
  })

  it('не трогает параметры, которые породами не являются', () => {
    expect(localizeDiagnosticParams({ panelId: 'A', widthMm: 3 }, 'ru')).toEqual({ panelId: 'A', widthMm: 3 })
  })
})

describe('diagnosticText', () => {
  it('печатает породы по-русски, а не ключами справочника', () => {
    const text = diagnosticText(find('SHRINKAGE_MISMATCH'), 'ru')
    expect(text).toContain('вишня')
    expect(text).toContain('клён')
    expect(text).not.toContain('cherry')
    expect(text).not.toContain('maple')
  })

  it('печатает породы по-английски', () => {
    const text = diagnosticText(find('SHRINKAGE_MISMATCH'), 'en')
    expect(text).toContain('cherry')
    expect(text).toContain('hard maple')
  })

  it('локализует породу в UNKNOWN_SPECIES', () => {
    const design = baseDesign({
      species: ['walnut'],
      panels: [stripsPanel('A', ['walnut', 'unobtainium']), stripsPanel('B', ['walnut'])],
    })
    const unknown = validate(design, { knownSpeciesIds: ['walnut'] }).find((d) => d.code === 'UNKNOWN_SPECIES')
    expect(unknown).toBeDefined()
    expect(diagnosticText(unknown!, 'ru')).toContain('unobtainium')

    const known = validate(design, { knownSpeciesIds: [] }).find((d) => d.code === 'UNKNOWN_SPECIES')
    expect(diagnosticText(known!, 'ru')).toContain('орех')
  })

  it('не оставляет неподставленных плейсхолдеров', () => {
    for (const locale of ['ru', 'en'] as const) {
      expect(diagnosticText(find('SHRINKAGE_MISMATCH'), locale)).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })
})

/**
 * Страховка на будущее. Список SPECIES_PARAMS в diagnostics.ts набран руками, и новая
 * диагностика с породой в новом параметре молча начнёт печатать сырой id. Прогоняем все
 * коды диагностик разом и требуем, чтобы в русском тексте не осталось латинских слов:
 * все породы здесь есть в справочнике, а id пород как раз латиница (cherry, red-oak).
 * Идентификаторы панелей (A, B, Q) - одиночные заглавные буквы и под правило не попадают.
 */
describe('ни одна диагностика не печатает сырой id породы', () => {
  const cases: ReadonlyArray<readonly [DiagnosticCode, Diagnostic[]]> = (() => {
    const collected: Array<readonly [DiagnosticCode, Diagnostic[]]> = []
    const add = (design: Design, opts?: Parameters<typeof validate>[1]) => {
      for (const d of validate(design, opts)) collected.push([d.code, [d]])
    }

    add(one([stripsPanel('A', ['cherry', 'maple']), stripsPanel('B', ['maple', 'cherry'])], [row('r1', 'A'), row('r2', 'B')]), { shrinkageByPct: shrinkageMap() })
    add(one([stripsPanel('A', ['walnut', 'maple'], 3)], [row('r1', 'A')]))
    add(one([stripsPanel('A', Array(20).fill('maple'), 20)], [row('r1', 'A')]))
    add(one([{ id: 'A', elements: [] }], [row('r1', 'A')]))
    add(baseDesign({ planingAllowanceMm: 1 }))
    add(baseDesign({ board: { targetWidthMm: 5, targetLengthMm: 60, thicknessMm: 40 } }))
    add(one([stripsPanel('A', ['walnut', 'maple'], 25), stripsPanel('B', ['maple'], 25)], [row('r1', 'A'), row('r2', 'B', 45)]))
    add(one([stripsPanel('A', ['walnut'])], [row('r1', 'нет-такой')]))
    add(one([stripsPanel('A', ['walnut', 'maple'])], [row('r1', 'A')]), { knownSpeciesIds: [] })
    add(
      one(
        [
          stripsPanel('Q', ['walnut'], 10),
          { id: 'R', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 0, offsetMm: 0 }] },
          { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'R', thicknessMm: 10, angleDeg: 0, offsetMm: 0 }] },
        ],
        [row('r1', 'P')],
      ),
    )
    add(
      one(
        [
          stripsPanel('Q', ['walnut', 'maple'], 0.001),
          { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 20, angleDeg: 0, offsetMm: 0 }] },
        ],
        [row('r1', 'P')],
      ),
    )
    // ANGLE_RANGE: угол среза за пределами MAX_SLICE_ANGLE_DEG.
    add(
      one(
        [stripsPanel('Q', ['walnut'], 20), { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 75, offsetMm: 0 }] }],
        [row('r1', 'P')],
      ),
    )
    // SLICE_TOO_SHORT: щит Q узкий, а панель P требует длинную заготовку.
    add(
      one(
        [stripsPanel('Q', ['walnut'], 5), { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 5, angleDeg: 0, offsetMm: 0 }] }],
        [{ id: 'r1', panelId: 'P', thicknessMm: 200, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
      ),
    )
    // ANGLE_WASTE: угол 45° на широком щите Q съедает больше ANGLE_WASTE_WARN_PCT площади.
    add(
      one(
        [stripsPanel('Q', ['walnut'], 100), { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 45, offsetMm: 0 }] }],
        [row('r1', 'P')],
      ),
    )
    return collected
  })()

  const ALL_CODES: readonly DiagnosticCode[] = [
    'MIN_STRIP_WIDTH', 'PLANER_WIDTH', 'PLANING_ALLOWANCE', 'DEPTH_LIMIT', 'PANEL_NOT_FOUND',
    'EMPTY_PANEL', 'DIMENSION_SANITY', 'RAGGED_BOARD', 'ANGLE_ROW_UNSUPPORTED', 'ANGLE_RANGE',
    'ANGLE_WASTE', 'SLICE_TOO_SHORT', 'SHRINKAGE_MISMATCH', 'CELL_BUDGET', 'UNKNOWN_SPECIES',
  ]

  it('фикстуры покрывают все коды диагностик', () => {
    const covered = new Set(cases.map(([code]) => code))
    expect([...ALL_CODES].filter((c) => !covered.has(c))).toEqual([])
  })

  it('в русском тексте нет латинских слов, то есть и сырых id пород', () => {
    for (const [code, [diagnostic]] of cases) {
      const text = diagnosticText(diagnostic!, 'ru')
      expect(text, `${code}: ${text}`).not.toMatch(/[a-z]{3,}/)
      expect(text, `${code}: ${text}`).not.toMatch(/\{[a-zA-Z]+\}/)
    }
  })

  it('английский текст тоже собирается целиком', () => {
    for (const [code, [diagnostic]] of cases) {
      const text = diagnosticText(diagnostic!, 'en')
      expect(text, `${code}: ${text}`).not.toMatch(/\{[a-zA-Z]+\}/)
      expect(text.length, `${code}`).toBeGreaterThan(0)
    }
  })
})
