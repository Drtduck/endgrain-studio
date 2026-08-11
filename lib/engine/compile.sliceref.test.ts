import { describe, it, expect } from 'vitest'
import { compile } from './compile'
import { baseDesign, stripsPanel } from './fixtures'
import type { Design } from './types'

function withRef(offsetMm: number, flip = false): Design {
  return baseDesign({
    panels: [
      stripsPanel('Q', ['walnut', 'maple'], 10),
      { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 20, angleDeg: 0, offsetMm }] },
    ],
    rows: [{ id: 'r1', panelId: 'P', thicknessMm: 40, angleDeg: 0, flip, mirror: false, trimMm: 5 }],
  })
}

describe('compile: SliceRef at depth 2', () => {
  it('tiles the inner panel strips along Y and covers the row exactly', () => {
    const m = compile(withRef(0))
    expect(m.cells.map((c) => [c.yMm, c.heightMm, c.speciesId])).toEqual([
      [0, 10, 'walnut'],
      [10, 10, 'maple'],
      [20, 10, 'walnut'],
      [30, 10, 'maple'],
    ])
    expect(m.widthMm).toBe(20)
    expect(m.lengthMm).toBe(40)
  })

  it('shifts the tiling by offsetMm and clips the leading sub-cell', () => {
    const m = compile(withRef(5))
    expect(m.cells[0]).toMatchObject({ yMm: 0, heightMm: 5, speciesId: 'maple' })
    const area = m.cells.reduce((s, c) => s + c.widthMm * c.heightMm, 0)
    expect(area).toBeCloseTo(20 * 40, 6)
  })

  it('reverses the inner strip order when the row is flipped', () => {
    const m = compile(withRef(0, true))
    expect(m.cells[0]?.speciesId).toBe('maple')
    expect(m.cells[1]?.speciesId).toBe('walnut')
  })

  it('records depth-1 provenance', () => {
    const m = compile(withRef(0))
    expect(m.cells[0]?.origin).toMatchObject({
      rowId: 'r1',
      panelId: 'P',
      elementIndex: 0,
      depth: 1,
      innerPanelId: 'Q',
      innerElementIndex: 0,
    })
  })

  it('emits nothing for a depth-3 reference but keeps X advancing', () => {
    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut'], 10),
        { id: 'R', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 0, offsetMm: 0 }] },
        {
          id: 'P',
          elements: [
            { kind: 'strip', speciesId: 'maple', widthMm: 15 },
            { kind: 'sliceRef', panelId: 'R', thicknessMm: 10, angleDeg: 0, offsetMm: 0 },
          ],
        },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 20, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const m = compile(d)
    expect(m.cells).toHaveLength(1)
    expect(m.widthMm).toBe(25)
  })
})
