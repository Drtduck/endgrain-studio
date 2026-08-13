import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { makeGridDesign, uniform } from '@/lib/designs/grid'
import { panelLengthMm, slicesOfPanel } from '@/lib/engine'
import { SPECIES } from '@/lib/species'
import { buildCutPlan } from './cutlist'

const speciesIds = SPECIES.map((s) => s.id)

const designArb = fc
  .record({
    cols: fc.integer({ min: 2, max: 10 }),
    rows: fc.integer({ min: 2, max: 10 }),
    colMm: fc.integer({ min: 8, max: 40 }),
    rowMm: fc.integer({ min: 10, max: 40 }),
    seed: fc.integer({ min: 0, max: 1_000_000 }),
  })
  .map(({ cols, rows, colMm, rowMm, seed }) =>
    makeGridDesign({
      id: `p-${seed}`,
      nameKey: 'design.default',
      colWidthsMm: uniform(cols, colMm),
      rowHeightsMm: uniform(rows, rowMm),
      at: (col, row) => speciesIds[(col * 7 + row * 13 + seed) % speciesIds.length] ?? 'maple',
    }),
  )

describe('инварианты карты раскроя', () => {
  it('длина щита всегда равна движковой', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        for (const p of buildCutPlan(design, 'ru').panels) {
          expect(p.lengthMm).toBeCloseTo(panelLengthMm(design, p.panelId), 9)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('число резов равно числу срезов, снимаемых с панели', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        for (const p of buildCutPlan(design, 'ru').panels) {
          expect(p.crosscuts).toHaveLength(slicesOfPanel(design, p.panelId).length)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('каждый ряд доски получает ровно один рез с этим номером', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        const plan = buildCutPlan(design, 'ru')
        const numbers = plan.panels.flatMap((p) => p.crosscuts).map((c) => c.rowNumber).filter((n): n is number => n !== null)
        expect([...numbers].sort((a, b) => a - b)).toEqual(plan.rows.map((r) => r.number))
      }),
      { numRuns: 100 },
    )
  })

  it('карта раскроя не теряет и не выдумывает полосы', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        const plan = buildCutPlan(design, 'ru')
        const declared = design.panels.reduce((s, p) => s + p.elements.filter((e) => e.kind === 'strip').length, 0)
        expect(plan.stripCount).toBe(declared)
        expect(plan.panels).toHaveLength(design.panels.length)
      }),
      { numRuns: 100 },
    )
  })
})
