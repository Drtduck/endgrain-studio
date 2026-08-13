import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { makeGridDesign, uniform } from '@/lib/designs/grid'
import { baseDesign, panelLengthMm, slicesOfPanel, type Design } from '@/lib/engine'
import { SPECIES } from '@/lib/species'
import { buildCutPlan, buildGlueUpSteps } from './cutlist'

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

/**
 * Панель Q из одной полосы, панель P{seed} состоит из нескольких SliceRef на Q, каждый со
 * своим angleDeg (может быть 0, может повторяться). Ряд снимается с P{seed} прямым резом.
 */
const angledDesignArb = fc
  .record({
    angles: fc.array(fc.integer({ min: -60, max: 60 }), { minLength: 1, maxLength: 6 }),
    seed: fc.integer({ min: 0, max: 1_000_000 }),
  })
  .map(({ angles, seed }): Design => {
    const panelId = `P${seed}`
    return baseDesign({
      panels: [
        { id: 'Q', elements: [{ kind: 'strip', speciesId: 'walnut', widthMm: 20 }] },
        {
          id: panelId,
          elements: angles.map((angleDeg) => ({ kind: 'sliceRef' as const, panelId: 'Q', thicknessMm: 8, angleDeg, offsetMm: 0 })),
        },
      ],
      rows: [{ id: `r${seed}`, panelId, thicknessMm: 8 * angles.length, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
  })

describe('инварианты шагов на угловых резах', () => {
  it('число шагов angled-setup у панели равно числу различных ненулевых углов среди её резов', () => {
    fc.assert(
      fc.property(angledDesignArb, (design) => {
        const plan = buildCutPlan(design, 'ru')
        const steps = buildGlueUpSteps(plan, 'ru')
        for (const p of plan.panels) {
          const distinctAngles = new Set(p.crosscuts.map((c) => c.angleDeg).filter((a) => a !== 0))
          const setupCount = steps.filter((s) => s.kind === 'angled-setup' && s.panelId === p.panelId).length
          expect(setupCount).toBe(distinctAngles.size)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('регрессия нуля: документ без углов не порождает ни одного шага angled-setup', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        const plan = buildCutPlan(design, 'ru')
        const steps = buildGlueUpSteps(plan, 'ru')
        expect(steps.some((s) => s.kind === 'angled-setup')).toBe(false)
      }),
      { numRuns: 50 },
    )
  })
})
