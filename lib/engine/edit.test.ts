import { describe, it, expect } from 'vitest'
import { compile } from './compile'
import { applyPaint, splitPanel } from './edit'
import { baseDesign, stripsPanel } from './fixtures'
import { EngineError } from './errors'
import type { Design } from './types'

/** Одна панель, два ряда: панель разделяемая, значит покраска обязана форкать. */
const shared: Design = baseDesign({
  panels: [stripsPanel('A', ['walnut', 'maple'])],
  rows: [
    { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    { id: 'r2', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: true, trimMm: 5 },
  ],
})

describe('applyPaint', () => {
  it('paints in place when the panel is used once', () => {
    const d = baseDesign()
    const cell = compile(d).cells[0]!
    const res = applyPaint(d, cell, 'padauk')
    expect(res.kind).toBe('inPlace')
    expect(compile(res.design).cells[0]?.speciesId).toBe('padauk')
    expect(res.design.panels).toHaveLength(2)
  })

  it('is a noop when the species is already there', () => {
    const d = baseDesign()
    const cell = compile(d).cells[0]!
    const res = applyPaint(d, cell, 'walnut')
    expect(res.kind).toBe('noop')
    expect(res.design).toBe(d)
  })

  it('forks the panel when it is shared, and prices the fork', () => {
    const cell = compile(shared).cells[0]!
    const res = applyPaint(shared, cell, 'padauk')
    if (res.kind !== 'fork') throw new Error('ожидался fork')
    expect(res.forkedPanelIds).toEqual(['P2'])
    expect(res.design.panels).toHaveLength(2)
    expect(res.cost.extraGlueUps).toBe(1)
    expect(res.cost.extraCuts).toBe(1)
    // новая панель: срез 30 + припуск 3 + trim 5 = 38 мм на каждую из двух полос
    expect(res.cost.extraLumberMBySpecies['padauk']).toBeCloseTo(0.038, 6)
    expect(res.cost.extraLumberMBySpecies['maple']).toBeCloseTo(0.038, 6)
    // второй ряд не тронут
    const after = compile(res.design)
    expect(after.cells.map((c) => c.speciesId)).toEqual(['padauk', 'maple', 'maple', 'walnut'])
  })

  it('rejects painting a slice ref itself', () => {
    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut', 'maple'], 10),
        { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 20, angleDeg: 0, offsetMm: 0 }] },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 40, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const cell = compile(d).cells[0]!
    // depth 1 указывает на полосу внутри Q, значит красится именно она
    const res = applyPaint(d, cell, 'padauk')
    expect(res.kind).toBe('inPlace')
    expect(compile(res.design).cells[0]?.speciesId).toBe('padauk')
  })
})

describe('splitPanel', () => {
  it('splits a strip into two strips of the same species', () => {
    const d = splitPanel(baseDesign(), 'A', 0, 10)
    expect(d.panels[0]?.elements).toEqual([
      { kind: 'strip', speciesId: 'walnut', widthMm: 10 },
      { kind: 'strip', speciesId: 'walnut', widthMm: 15 },
      { kind: 'strip', speciesId: 'maple', widthMm: 25 },
    ])
  })

  it('keeps total panel width unchanged', () => {
    const before = compile(baseDesign()).widthMm
    expect(compile(splitPanel(baseDesign(), 'A', 1, 7)).widthMm).toBeCloseTo(before, 6)
  })

  it('rejects a split outside the element', () => {
    expect(() => splitPanel(baseDesign(), 'A', 0, 0)).toThrowError(EngineError)
    expect(() => splitPanel(baseDesign(), 'A', 0, 25)).toThrowError(EngineError)
    expect(() => splitPanel(baseDesign(), 'A', 9, 5)).toThrowError(EngineError)
  })
})
