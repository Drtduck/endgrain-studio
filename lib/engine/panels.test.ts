import { describe, it, expect } from 'vitest'
import { SCHEMA_VERSION, type Design, type Panel } from './types'
import { elementExtentMm, getPanel, panelWidthMm, slicesOfPanel, panelLengthMm } from './panels'
import { EngineError } from './errors'

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
})
