import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { compile } from './compile'
import { baseDesign } from './fixtures'
import { panelLengthMm } from './panels'
import type { Design } from './types'

const speciesArb = fc.constantFrom('walnut', 'maple', 'cherry', 'padauk', 'wenge')
const widthArb = fc.double({ min: 4, max: 40, noNaN: true, noDefaultInfinity: true })

/** Ровная доска: все ряды ссылаются на панели одинаковой суммарной ширины. */
const flatDesignArb: fc.Arbitrary<Design> = fc
  .record({
    widths: fc.array(widthArb, { minLength: 2, maxLength: 8 }),
    speciesRows: fc.array(fc.array(speciesArb, { minLength: 2, maxLength: 8 }), { minLength: 1, maxLength: 6 }),
    kerfMm: fc.double({ min: 0.5, max: 5, noNaN: true, noDefaultInfinity: true }),
    planingAllowanceMm: fc.double({ min: 3, max: 6, noNaN: true, noDefaultInfinity: true }),
    thicknessMm: fc.double({ min: 15, max: 50, noNaN: true, noDefaultInfinity: true }),
    trimMm: fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ widths, speciesRows, kerfMm, planingAllowanceMm, thicknessMm, trimMm }) => {
    const panels = speciesRows.map((row, i) => ({
      id: `P${i}`,
      elements: widths.map((w, j) => ({ kind: 'strip' as const, speciesId: row[j % row.length] ?? 'maple', widthMm: w })),
    }))
    return baseDesign({
      panels,
      rows: panels.map((p, i) => ({
        id: `r${i}`,
        panelId: p.id,
        thicknessMm,
        angleDeg: 0,
        flip: false,
        mirror: i % 2 === 1,
        trimMm,
      })),
      kerfMm,
      planingAllowanceMm,
      board: { targetWidthMm: 300, targetLengthMm: 400, thicknessMm },
    })
  })

describe('compile invariants', () => {
  it('total cell area equals board area', () => {
    fc.assert(
      fc.property(flatDesignArb, (design) => {
        const m = compile(design)
        const area = m.cells.reduce((s, c) => s + c.widthMm * c.heightMm, 0)
        expect(area).toBeCloseTo(m.widthMm * m.lengthMm, 4)
      }),
      { numRuns: 200 },
    )
  })

  it('panel length equals sum of slice thicknesses plus allowances, kerf and trim', () => {
    fc.assert(
      fc.property(flatDesignArb, (design) => {
        for (const panel of design.panels) {
          const slices = design.rows.filter((r) => r.panelId === panel.id)
          const expected =
            slices.reduce((s, r) => s + r.thicknessMm + design.planingAllowanceMm + r.trimMm, 0) +
            design.kerfMm * Math.max(0, slices.length - 1)
          expect(panelLengthMm(design, panel.id)).toBeCloseTo(expected, 6)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('is total: never throws and never emits negative geometry', () => {
    fc.assert(
      fc.property(flatDesignArb, (design) => {
        const m = compile(design)
        for (const c of m.cells) {
          expect(c.widthMm).toBeGreaterThan(0)
          expect(c.heightMm).toBeGreaterThan(0)
          expect(c.xMm).toBeGreaterThanOrEqual(0)
          expect(c.yMm).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 200 },
    )
  })
})
