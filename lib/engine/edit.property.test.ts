import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { compile } from './compile'
import { applyPaint, splitPanel } from './edit'
import { baseDesign, stripsPanel } from './fixtures'
import { validate, hasErrors } from './validate'
import type { Design } from './types'

const speciesArb = fc.constantFrom('walnut', 'maple', 'cherry', 'padauk', 'wenge')

const sharedDesign = (rowCount: number): Design =>
  baseDesign({
    panels: [stripsPanel('A', ['walnut', 'maple', 'cherry'])],
    rows: Array.from({ length: rowCount }, (_, i) => ({
      id: `r${i}`,
      panelId: 'A',
      thicknessMm: 25,
      angleDeg: 0,
      flip: false,
      mirror: i % 2 === 1,
      trimMm: 4,
    })),
  })

describe('applyPaint invariants', () => {
  it('is idempotent: painting the same cell with the same species twice changes nothing', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(), speciesArb, (rows, rawIdx, species) => {
        const d0 = sharedDesign(rows)
        const m0 = compile(d0)
        const cell0 = m0.cells[rawIdx % m0.cells.length]!
        const first = applyPaint(d0, cell0, species)

        const m1 = compile(first.design)
        const cell1 = m1.cells.find((c) => c.xMm === cell0.xMm && c.yMm === cell0.yMm)!
        expect(cell1.speciesId).toBe(species)

        const second = applyPaint(first.design, cell1, species)
        expect(second.kind).toBe('noop')
        expect(second.design).toBe(first.design)
      }),
      { numRuns: 200 },
    )
  })

  it('never adds glue-ups when painting in place, and adds exactly the reported count when forking', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(), speciesArb, (rows, rawIdx, species) => {
        const d0 = sharedDesign(rows)
        const m0 = compile(d0)
        const cell0 = m0.cells[rawIdx % m0.cells.length]!
        const res = applyPaint(d0, cell0, species)
        const before = compile(d0).glueUpCount
        const after = compile(res.design).glueUpCount
        if (res.kind === 'fork') expect(after - before).toBe(res.cost.extraGlueUps)
        else expect(after).toBe(before)
      }),
      { numRuns: 200 },
    )
  })

  it('keeps a valid design valid and preserves board area', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(), speciesArb, (rows, rawIdx, species) => {
        const d0 = sharedDesign(rows)
        expect(hasErrors(validate(d0))).toBe(false)
        const m0 = compile(d0)
        const cell0 = m0.cells[rawIdx % m0.cells.length]!
        const m1 = compile(applyPaint(d0, cell0, species).design)
        expect(m1.widthMm * m1.lengthMm).toBeCloseTo(m0.widthMm * m0.lengthMm, 6)
      }),
      { numRuns: 200 },
    )
  })
})

describe('splitPanel invariants', () => {
  it('preserves board geometry area and adds exactly one element', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), fc.double({ min: 5, max: 20, noNaN: true, noDefaultInfinity: true }), (idx, at) => {
        const d0 = sharedDesign(2)
        const m0 = compile(d0)
        const d1 = splitPanel(d0, 'A', idx, at)
        const m1 = compile(d1)
        expect(d1.panels[0]!.elements.length).toBe(d0.panels[0]!.elements.length + 1)
        expect(m1.widthMm).toBeCloseTo(m0.widthMm, 6)
        expect(m1.cells.reduce((s, c) => s + c.widthMm * c.heightMm, 0)).toBeCloseTo(
          m0.cells.reduce((s, c) => s + c.widthMm * c.heightMm, 0),
          4,
        )
      }),
      { numRuns: 200 },
    )
  })
})
