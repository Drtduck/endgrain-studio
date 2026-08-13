import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { SCHEMA_VERSION, type Design, type Panel } from './types'
import { elementExtentMm, getPanel, panelWidthMm, slicesOfPanel, panelLengthMm, sliceLengthMm, angledWasteMm2 } from './panels'
import { EngineError } from './errors'
import { baseDesign, stripsPanel } from './fixtures'

const panelA: Panel = {
  id: 'A',
  elements: [
    { kind: 'strip', speciesId: 'walnut', widthMm: 25 },
    { kind: 'strip', speciesId: 'maple', widthMm: 25 },
  ],
}

const design: Design = {
  schemaVersion: SCHEMA_VERSION,
  id: 'd1',
  name: 'тест',
  species: ['walnut', 'maple'],
  panels: [panelA],
  rows: [
    { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    { id: 'r2', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: true, trimMm: 5 },
  ],
  board: { targetWidthMm: 50, targetLengthMm: 60, thicknessMm: 40 },
  kerfMm: 3,
  planingAllowanceMm: 3,
  planerWidthMm: 330,
}

describe('panels helpers', () => {
  it('measures element extent along the panel width', () => {
    expect(elementExtentMm({ kind: 'strip', speciesId: 'oak', widthMm: 18 })).toBe(18)
    expect(elementExtentMm({ kind: 'sliceRef', panelId: 'A', thicknessMm: 12, angleDeg: 0, offsetMm: 0 })).toBe(12)
  })

  it('sums panel width', () => {
    expect(panelWidthMm(panelA)).toBe(50)
  })

  it('throws a typed error for a missing panel', () => {
    expect(() => getPanel(design, 'ZZZ')).toThrowError(EngineError)
  })

  it('enumerates every slice taken from a panel', () => {
    expect(slicesOfPanel(design, 'A')).toHaveLength(2)
  })

  it('applies the panel length formula', () => {
    // 2 среза: (30+3) * 2 + kerf 3 * (2-1) + trim 5 * 2 = 66 + 3 + 10 = 79
    expect(panelLengthMm(design, 'A')).toBeCloseTo(79, 6)
  })

  it('fills sourceWidthMm with the width of the sliced panel for every slice', () => {
    const slices = slicesOfPanel(design, 'A')
    expect(slices.every((s) => s.sourceWidthMm === 50)).toBe(true)
  })
})

describe('угловая арифметика', () => {
  function withAngle(angleDeg: number): Design {
    return baseDesign({
      panels: [stripsPanel('A', ['walnut', 'maple'], 25)],
      rows: [{ id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg, flip: false, mirror: false, trimMm: 5 }],
    })
  }

  it('at phi=0 numbers match today exactly (regression)', () => {
    // одна панель, один срез: (30+3+5) + kerf*0 = 38, как и до угловой поддержки
    expect(panelLengthMm(withAngle(0), 'A')).toBeCloseTo(38, 9)
    expect(angledWasteMm2(withAngle(0), 'A')).toBe(0)
  })

  it('panelLengthMm(phi) >= panelLengthMm(0) и монотонно растёт по |phi|', () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 55, noNaN: true, noDefaultInfinity: true }), (angleDeg) => {
        const base = panelLengthMm(withAngle(0), 'A')
        const at = panelLengthMm(withAngle(angleDeg), 'A')
        expect(at).toBeGreaterThanOrEqual(base - 1e-9)
      }),
      { numRuns: 200 },
    )
    // монотонность по модулю: чем больше угол, тем длиннее щит
    const lens = [0, 10, 20, 30, 40, 50].map((a) => panelLengthMm(withAngle(a), 'A'))
    for (let i = 1; i < lens.length; i += 1) {
      expect(lens[i]!).toBeGreaterThan(lens[i - 1]!)
    }
  })

  it('phi=45: длина щита с одним срезом равна (t + allow + trim) * sqrt(2) + W', () => {
    const d = withAngle(45)
    const t = 30
    const allow = d.planingAllowanceMm
    const trim = 5
    const W = 50
    const expected = (t + allow + trim) * Math.SQRT2 + W * Math.abs(Math.tan((45 * Math.PI) / 180))
    expect(panelLengthMm(d, 'A')).toBeCloseTo(expected, 9)
  })

  it('sliceLengthMm at phi=60 equals 2W', () => {
    const slice = slicesOfPanel(withAngle(60), 'A')[0]!
    expect(sliceLengthMm(slice)).toBeCloseTo(2 * 50, 9)
  })

  it('angledWasteMm2 groups by distinct nonzero angle, not by cut count', () => {
    const d = baseDesign({
      panels: [stripsPanel('A', ['walnut', 'maple'], 25)],
      rows: [
        { id: 'r1', panelId: 'A', thicknessMm: 20, angleDeg: 30, flip: false, mirror: false, trimMm: 5 },
        { id: 'r2', panelId: 'A', thicknessMm: 20, angleDeg: 30, flip: false, mirror: false, trimMm: 5 },
        { id: 'r3', panelId: 'A', thicknessMm: 20, angleDeg: -30, flip: false, mirror: false, trimMm: 5 },
      ],
    })
    const W = 50
    // два различных угла (30 и -30), клин на каждый: W^2 * |tan| / 2
    const expected = 2 * ((W * W * Math.abs(Math.tan((30 * Math.PI) / 180))) / 2)
    expect(angledWasteMm2(d, 'A')).toBeCloseTo(expected, 9)
  })
})
