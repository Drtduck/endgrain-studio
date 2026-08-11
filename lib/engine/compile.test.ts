import { describe, it, expect } from 'vitest'
import { compile, rowBandsMm } from './compile'
import { baseDesign, stripsPanel } from './fixtures'
import { MAX_CELLS } from './types'

describe('compile: flat geometry', () => {
  it('lays strips along X and rows along Y', () => {
    const m = compile(baseDesign())
    expect(m.widthMm).toBe(50)
    expect(m.lengthMm).toBe(60)
    expect(m.thicknessMm).toBe(40)
    expect(m.cells).toHaveLength(4)
    expect(m.cells[0]).toMatchObject({ xMm: 0, yMm: 0, widthMm: 25, heightMm: 30, speciesId: 'walnut' })
    expect(m.cells[1]).toMatchObject({ xMm: 25, yMm: 0, speciesId: 'maple' })
    expect(m.cells[2]).toMatchObject({ xMm: 0, yMm: 30, speciesId: 'maple' })
    expect(m.cells[3]).toMatchObject({ xMm: 25, yMm: 30, speciesId: 'walnut' })
  })

  it('reverses element order along X when the row is mirrored, keeping origin indices', () => {
    const d = baseDesign({
      panels: [stripsPanel('A', ['walnut', 'maple', 'cherry'])],
      rows: [{ id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: true, trimMm: 5 }],
    })
    const m = compile(d)
    expect(m.cells.map((c) => c.speciesId)).toEqual(['cherry', 'maple', 'walnut'])
    expect(m.cells.map((c) => c.origin.elementIndex)).toEqual([2, 1, 0])
  })

  it('skips rows whose panel is missing without throwing', () => {
    const d = baseDesign({
      rows: [{ id: 'rX', panelId: 'GHOST', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const m = compile(d)
    expect(m.cells).toHaveLength(0)
    expect(m.lengthMm).toBe(0)
  })

  it('derives panel lengths, glue-ups and cuts', () => {
    const m = compile(baseDesign())
    // по одному срезу с каждой панели: (30+3) + kerf*0 + trim 5 = 38
    expect(m.panelLengthsMm['A']).toBeCloseTo(38, 6)
    expect(m.panelLengthsMm['B']).toBeCloseTo(38, 6)
    // 2 первых склейки + 1 финальная
    expect(m.glueUpCount).toBe(3)
    expect(m.cutCount).toBe(2)
  })

  it('reports truncated: false for a normal design', () => {
    expect(compile(baseDesign()).truncated).toBe(false)
  })

  it('rowBandsMm: топ/высота рядов сверху вниз, пропуская ряды с несуществующей панелью', () => {
    const d = baseDesign({
      rows: [
        { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'ghost', panelId: 'GHOST', thicknessMm: 99, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'r2', panelId: 'B', thicknessMm: 20, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
      ],
    })
    expect(rowBandsMm(d)).toEqual([
      { id: 'r1', topMm: 0, heightMm: 30 },
      { id: 'r2', topMm: 30, heightMm: 20 },
    ])
  })

  it('caps cell generation at MAX_CELLS and marks the model truncated for a sub-mm sliceRef strip', () => {
    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut', 'maple'], 0.001),
        { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 20, angleDeg: 0, offsetMm: 0 }] },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 40, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })

    const start = performance.now()
    const m = compile(d)
    const elapsedMs = performance.now() - start

    expect(elapsedMs).toBeLessThan(500)
    expect(m.truncated).toBe(true)
    expect(m.cells.length).toBeLessThanOrEqual(MAX_CELLS)
  })
})
