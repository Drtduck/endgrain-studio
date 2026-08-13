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

  it('flags ragged boards and non-zero row angles', () => {
    const d = baseDesign({
      panels: [stripsPanel('A', ['walnut', 'maple'], 25), stripsPanel('B', ['maple'], 25)],
      rows: [
        { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'r2', panelId: 'B', thicknessMm: 30, angleDeg: 45, flip: false, mirror: false, trimMm: 5 },
      ],
    })
    expect(codes(d)).toEqual(expect.arrayContaining(['RAGGED_BOARD', 'ANGLE_ROW_UNSUPPORTED']))
  })

  it('flags SliceRef angle outside the allowed range', () => {
    const d = baseDesign({
      panels: [stripsPanel('Q', ['walnut'], 20), { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 75, offsetMm: 0 }] }],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    expect(codes(d)).toContain('ANGLE_RANGE')
  })

  it('passes a SliceRef at 30 degrees without any diagnostic', () => {
    const d = baseDesign({
      panels: [stripsPanel('Q', ['walnut', 'maple'], 25), { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 60, angleDeg: 30, offsetMm: 0 }] }],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    expect(hasErrors(validate(d))).toBe(false)
  })

  it('flags a slice shorter than the panel it is glued into', () => {
    const d = baseDesign({
      panels: [stripsPanel('Q', ['walnut'], 5), { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 5, angleDeg: 0, offsetMm: 0 }] }],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 200, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    expect(codes(d)).toContain('SLICE_TOO_SHORT')
  })

  it('warns about angled waste above the threshold, and stays quiet below it', () => {
    const big = baseDesign({
      panels: [stripsPanel('Q', ['walnut'], 100), { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 45, offsetMm: 0 }] }],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    expect(codes(big)).toContain('ANGLE_WASTE')

    const small = baseDesign({
      panels: [stripsPanel('Q', ['walnut', 'maple'], 25), { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 60, angleDeg: 5, offsetMm: 0 }] }],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    expect(codes(small)).not.toContain('ANGLE_WASTE')
  })

  it('warns about incompatible shrinkage between neighbours', () => {
    const d = baseDesign({ panels: [stripsPanel('A', ['mahogany', 'beech'], 25)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    expect(codes(d, { shrinkageByPct: { mahogany: 5.1, beech: 11.9 } })).toContain('SHRINKAGE_MISMATCH')
    expect(codes(d)).not.toContain('SHRINKAGE_MISMATCH')
  })

  it('dedupes SHRINKAGE_MISMATCH at design level regardless of species order', () => {
    const species: import('./types').SpeciesId[] = ['maple', 'walnut', 'maple', 'walnut', 'maple', 'walnut', 'maple', 'walnut']
    const d = baseDesign({
      panels: [stripsPanel('A', species, 25)],
      rows: [{ id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const diags = validate(d, { shrinkageByPct: { walnut: 7.8, maple: 9.9 } })
    const mismatches = diags.filter((x) => x.code === 'SHRINKAGE_MISMATCH')
    expect(mismatches).toHaveLength(1)
    expect(mismatches[0]?.params.count).toBe(7)
    expect(mismatches[0]?.params.deltaPp).toBeCloseTo(2.1, 5)
    expect(mismatches[0]?.target).toBeUndefined()

    // порядок пары не должен создавать вторую запись
    const dReversed = baseDesign({
      panels: [stripsPanel('A', ['walnut', 'maple'], 25), stripsPanel('B', ['maple', 'walnut'], 25)],
      rows: [
        { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'r2', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
      ],
    })
    const diagsReversed = validate(dReversed, { shrinkageByPct: { walnut: 7.8, maple: 9.9 } })
    expect(diagsReversed.filter((x) => x.code === 'SHRINKAGE_MISMATCH')).toHaveLength(1)
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
