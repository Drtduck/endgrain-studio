import { describe, it, expect } from 'vitest'
import { validate, hasErrors } from './validate'
import { baseDesign, stripsPanel } from './fixtures'

const codes = (d: Parameters<typeof validate>[0], o?: Parameters<typeof validate>[1]) =>
  validate(d, o).map((x) => x.code)

describe('validate', () => {
  it('passes a clean design', () => {
    expect(validate(baseDesign())).toEqual([])
    expect(hasErrors([])).toBe(false)
  })

  it('flags strips narrower than 4 mm', () => {
    const d = baseDesign({ panels: [stripsPanel('A', ['walnut', 'maple'], 3)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    expect(codes(d)).toContain('MIN_STRIP_WIDTH')
    expect(hasErrors(validate(d))).toBe(true)
  })

  it('flags panels wider than the planer', () => {
    const d = baseDesign({ panels: [stripsPanel('A', Array(20).fill('maple'), 20)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    expect(codes(d)).toContain('PLANER_WIDTH')
  })

  it('warns about a planing allowance below 3 mm', () => {
    expect(codes(baseDesign({ planingAllowanceMm: 1 }))).toContain('PLANING_ALLOWANCE')
  })

  it('rejects depth 3', () => {
    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut'], 10),
        { id: 'R', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 0, offsetMm: 0 }] },
        { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'R', thicknessMm: 10, angleDeg: 0, offsetMm: 0 }] },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 20, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const diag = validate(d).find((x) => x.code === 'DEPTH_LIMIT')
    expect(diag?.level).toBe('error')
    expect(diag?.messageKey).toBe('diag.DEPTH_LIMIT')
    expect(diag?.target).toMatchObject({ panelId: 'P', elementIndex: 0 })
  })

  it('flags impossible board dimensions', () => {
    expect(codes(baseDesign({ board: { targetWidthMm: 5, targetLengthMm: 60, thicknessMm: 40 } }))).toContain('DIMENSION_SANITY')
    expect(codes(baseDesign({ board: { targetWidthMm: 300, targetLengthMm: 400, thicknessMm: 5 } }))).toContain('DIMENSION_SANITY')
  })

  it('flags ragged boards and non-zero angles', () => {
    const d = baseDesign({
      panels: [stripsPanel('A', ['walnut', 'maple'], 25), stripsPanel('B', ['maple'], 25)],
      rows: [
        { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'r2', panelId: 'B', thicknessMm: 30, angleDeg: 45, flip: false, mirror: false, trimMm: 5 },
      ],
    })
    expect(codes(d)).toEqual(expect.arrayContaining(['RAGGED_BOARD', 'ANGLE_UNSUPPORTED']))
  })

  it('warns about incompatible shrinkage between neighbours', () => {
    const d = baseDesign({ panels: [stripsPanel('A', ['mahogany', 'beech'], 25)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    expect(codes(d, { shrinkageByPct: { mahogany: 5.1, beech: 11.9 } })).toContain('SHRINKAGE_MISMATCH')
    expect(codes(d)).not.toContain('SHRINKAGE_MISMATCH')
  })

  it('flags a speciesId missing from the supplied catalogue', () => {
    const d = baseDesign({ panels: [stripsPanel('A', ['walnut', 'unobtainium'], 25)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    expect(codes(d)).not.toContain('UNKNOWN_SPECIES')
    const diags = validate(d, { knownSpeciesIds: ['walnut', 'maple'] })
    const diag = diags.find((x) => x.code === 'UNKNOWN_SPECIES')
    expect(diag?.level).toBe('error')
    expect(diag?.messageKey).toBe('diag.UNKNOWN_SPECIES')
    expect(diag?.target).toMatchObject({ panelId: 'A', elementIndex: 1 })
  })

  it('reports CELL_BUDGET as an error when a sub-mm sliceRef strip would exceed MAX_CELLS', () => {
    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut', 'maple'], 0.001),
        { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 20, angleDeg: 0, offsetMm: 0 }] },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 40, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const diag = validate(d).find((x) => x.code === 'CELL_BUDGET')
    expect(diag?.level).toBe('error')
  })

  it('sorts errors before warnings', () => {
    const d = baseDesign({ planingAllowanceMm: 1, panels: [stripsPanel('A', ['walnut'], 2)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    const levels = validate(d).map((x) => x.level)
    expect(levels.indexOf('error')).toBeLessThan(levels.indexOf('warning'))
  })
})
