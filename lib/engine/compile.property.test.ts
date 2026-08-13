import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { compile } from './compile'
import { baseDesign, stripsPanel } from './fixtures'
import { panelLengthMm } from './panels'
import { validate, hasErrors } from './validate'
import { cellPolygon, polygonAreaMm2, polygonsOverlapMm2, type Pt } from './geometry'
import type { Cell, Design, SliceRef } from './types'

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

describe('depth limit invariant', () => {
  it('always rejects depth 3 and never rejects depth 2', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3 }), (depth) => {
        // Ширина L0 взята с запасом: тест проверяет глубину вложенности, а не материал, и не
        // должен случайно попадать в SLICE_TOO_SHORT (щит короче панели, в которую вклеивается).
        const panels = [stripsPanel('L0', ['walnut', 'maple'], 50)]
        for (let i = 1; i < depth; i += 1) {
          panels.push({
            id: `L${i}`,
            elements: [{ kind: 'sliceRef', panelId: `L${i - 1}`, thicknessMm: 12, angleDeg: 0, offsetMm: 0 }],
          })
        }
        const top = `L${depth - 1}`
        const d: Design = baseDesign({
          panels,
          rows: [{ id: 'r1', panelId: top, thicknessMm: 24, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
        })
        const found = validate(d).some((x) => x.code === 'DEPTH_LIMIT')
        expect(found).toBe(depth >= 3)
        expect(() => compile(d)).not.toThrow()
        if (depth < 3) expect(hasErrors(validate(d))).toBe(false)
      }),
      { numRuns: 30 },
    )
  })
})

/** Единственная колонка ряда r1: SliceRef на Q под произвольным углом, ширины полос разные. */
const angledDesignArb = (angleArb: fc.Arbitrary<number>): fc.Arbitrary<Design> =>
  fc
    .record({
      innerWidths: fc.array(fc.double({ min: 4, max: 30, noNaN: true, noDefaultInfinity: true }), { minLength: 1, maxLength: 5 }),
      speciesRow: fc.array(speciesArb, { minLength: 1, maxLength: 5 }),
      thicknessMm: fc.double({ min: 5, max: 40, noNaN: true, noDefaultInfinity: true }),
      angleDeg: angleArb,
      offsetMm: fc.double({ min: -80, max: 80, noNaN: true, noDefaultInfinity: true }),
      flip: fc.boolean(),
      rowFlip: fc.boolean(),
      rowMirror: fc.boolean(),
      rowThicknessMm: fc.double({ min: 10, max: 60, noNaN: true, noDefaultInfinity: true }),
    })
    .map(({ innerWidths, speciesRow, thicknessMm, angleDeg, offsetMm, flip, rowFlip, rowMirror, rowThicknessMm }) =>
      baseDesign({
        panels: [
          {
            id: 'Q',
            elements: innerWidths.map((widthMm, i) => ({
              kind: 'strip' as const,
              speciesId: speciesRow[i % speciesRow.length] ?? 'maple',
              widthMm,
            })),
          },
          { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm, angleDeg, offsetMm, flip }] },
        ],
        rows: [{ id: 'r1', panelId: 'P', thicknessMm: rowThicknessMm, angleDeg: 0, flip: rowFlip, mirror: rowMirror, trimMm: 5 }],
      }),
    )

function isConvex(poly: readonly Pt[]): boolean {
  if (poly.length < 3) return true
  let sign = 0
  for (let i = 0; i < poly.length; i += 1) {
    const p0 = poly[i]!
    const p1 = poly[(i + 1) % poly.length]!
    const p2 = poly[(i + 2) % poly.length]!
    const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0])
    if (Math.abs(cross) < 1e-7) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

describe('compile: инварианты угловых резов (фаза 1)', () => {
  const zeroAngleArb = angledDesignArb(fc.constant(0))
  const anyAngleArb = angledDesignArb(fc.double({ min: -55, max: 55, noNaN: true, noDefaultInfinity: true }))

  it('регрессия нуля: при angleDeg=0 ни одна ячейка не получает поле poly', () => {
    fc.assert(
      fc.property(zeroAngleArb, (design) => {
        const m = compile(design)
        for (const c of m.cells) expect(c.poly).toBeUndefined()
      }),
      { numRuns: 150 },
    )
  })

  it('без дыр: сумма площадей ячеек ряда равна площади ряда (ширина панели * толщина ряда)', () => {
    fc.assert(
      fc.property(anyAngleArb, (design) => {
        const m = compile(design)
        fc.pre(!m.truncated)
        const row = design.rows[0]!
        const cellsOfRow = m.cells.filter((c) => c.origin.rowId === row.id)
        const area = cellsOfRow.reduce((s, c) => s + polygonAreaMm2(cellPolygon(c)), 0)
        const expected = m.widthMm * row.thicknessMm
        expect(area).toBeCloseTo(expected, 3)
      }),
      { numRuns: 200 },
    )
  })

  it('без наложений: никакие две ячейки ряда не пересекаются по площади', () => {
    fc.assert(
      fc.property(anyAngleArb, (design) => {
        const m = compile(design)
        fc.pre(!m.truncated)
        fc.pre(m.cells.length <= 40) // O(n^2) проверка, держим короткой
        for (let i = 0; i < m.cells.length; i += 1) {
          for (let j = i + 1; j < m.cells.length; j += 1) {
            const overlap = polygonsOverlapMm2(cellPolygon(m.cells[i]!), cellPolygon(m.cells[j]!))
            expect(overlap).toBeLessThan(1e-3)
          }
        }
      }),
      { numRuns: 80 },
    )
  })

  it('выпуклость и вложенность в габарит доски', () => {
    fc.assert(
      fc.property(anyAngleArb, (design) => {
        const m = compile(design)
        fc.pre(!m.truncated)
        for (const c of m.cells) {
          const poly = cellPolygon(c)
          expect(isConvex(poly)).toBe(true)
          for (const [x, y] of poly) {
            expect(x).toBeGreaterThanOrEqual(-1e-6)
            expect(x).toBeLessThanOrEqual(m.widthMm + 1e-6)
            expect(y).toBeGreaterThanOrEqual(-1e-6)
            expect(y).toBeLessThanOrEqual(m.lengthMm + 1e-6)
          }
        }
      }),
      { numRuns: 150 },
    )
  })

  /**
   * Обратная формула к cursorStartMm внутри expandSliceRef (см. compile.angled.test.ts,
   * offsetForCursorStart): подбирает offsetMm под целевое значение курсора по модулю cycleMm.
   */
  function offsetForCursorStart(cycleMm: number, rowTopMm: number, targetCursorStart: number): number {
    const r = rowTopMm - targetCursorStart
    const rMod = ((r % cycleMm) + cycleMm) % cycleMm
    return -rMod
  }

  /**
   * Повторяет пересчёт эффективного offset из expandSliceRef (compile.ts): row.mirror и flip
   * переворачивают знак наклона относительно того, для чего выведен ref.offsetMm, поэтому сырой
   * offset больше не совпадает с фактическим courserStart без этой поправки (см. задачу про
   * row.mirror/row.flip на угловом узоре). Тест ниже строит "истинное" зеркало не через сырой
   * ref.offsetMm, а через эффективный - иначе он проверял бы устаревшую (добуговую) формулу.
   */
  function effectiveOffsetMm(
    rawOffsetMm: number,
    thicknessMm: number,
    angleDeg: number,
    rowMirror: boolean,
    flipXor: boolean,
    rowTopMm: number,
    rowBottomMm: number,
  ): number {
    let eff = rawOffsetMm
    if (rowMirror) eff += thicknessMm * Math.tan((angleDeg * Math.PI) / 180)
    if (flipXor) eff = rowTopMm + rowBottomMm - eff
    return eff
  }

  /** Обратная функция к effectiveOffsetMm: по нужному эффективному offset находит сырой. */
  function rawOffsetMmFor(
    targetEffectiveOffsetMm: number,
    thicknessMm: number,
    angleDeg: number,
    rowMirror: boolean,
    flipXor: boolean,
    rowTopMm: number,
    rowBottomMm: number,
  ): number {
    let eff = targetEffectiveOffsetMm
    if (flipXor) eff = rowTopMm + rowBottomMm - eff // отражение самообратно
    if (rowMirror) eff -= thicknessMm * Math.tan((angleDeg * Math.PI) / 180)
    return eff
  }

  /**
   * Настоящее зеркальное отражение колонки через её вертикальную ось x = xMm + t/2 переводит
   * наклон phi в -phi и одновременно сдвигает базовую линию тайлинга на +t*sSigned (раздел 0.5
   * плана: граница смещается на t*tan(phi) поперёк колонки). Отражение - изометрия, поэтому
   * площадь по каждой породе обязана совпасть точно, а не приблизительно. Голое "offsetMm тот
   * же, angleDeg с обратным знаком" отражением не является: это отдельная, не обязанная
   * сохранять площадь конструкция (см. compile.angled.test.ts про row.mirror).
   */
  it('зеркальность: настоящее отражение колонки (phi -> -phi, offset пересчитан) сохраняет площадь по породам', () => {
    fc.assert(
      fc.property(angledDesignArb(fc.double({ min: 1, max: 55, noNaN: true, noDefaultInfinity: true })), (design) => {
        const panelQ = design.panels[0]!
        const panelP = design.panels[1]!
        const row = design.rows[0]!
        const ref = panelP.elements[0] as SliceRef
        const c = Math.cos((ref.angleDeg * Math.PI) / 180)
        // Тот же знак, что вычисляет expandSliceRef: mirror и (row.flip XOR ref.flip) переворачивают наклон.
        const flipXor = row.flip !== (ref.flip ?? false)
        const signMultiplier = (row.mirror ? -1 : 1) * (flipXor ? -1 : 1)
        const sSigned = Math.tan((ref.angleDeg * Math.PI) / 180) * signMultiplier
        const cycleMm = panelQ.elements.reduce((s, el) => s + (el as { widthMm: number }).widthMm / c, 0)
        fc.pre(cycleMm > 1e-6)

        const rowTopMm = 0
        const rowBottomMm = rowTopMm + row.thicknessMm
        const effOrig = effectiveOffsetMm(ref.offsetMm, ref.thicknessMm, ref.angleDeg, row.mirror, flipXor, rowTopMm, rowBottomMm)
        const cursorStartOrig = rowTopMm - ((((-effOrig) % cycleMm) + cycleMm) % cycleMm)
        const targetCursorStart = cursorStartOrig + ref.thicknessMm * sSigned
        const targetEffectiveMirrored = offsetForCursorStart(cycleMm, rowTopMm, targetCursorStart)
        // Колонка-зеркало сохраняет row.mirror/flipXor (тот же ряд), но её собственный наклон
        // -ref.angleDeg - эффективная поправка mirror зависит от угла САМОЙ колонки, поэтому
        // сырой offsetMm, который даст нужный эффективный offset, обратно пересчитывается
        // с -ref.angleDeg, а не с ref.angleDeg.
        const offsetMirrored = rawOffsetMmFor(
          targetEffectiveMirrored,
          ref.thicknessMm,
          -ref.angleDeg,
          row.mirror,
          flipXor,
          rowTopMm,
          rowBottomMm,
        )

        const mirrored: Design = {
          ...design,
          panels: [panelQ, { ...panelP, elements: [{ ...ref, angleDeg: -ref.angleDeg, offsetMm: offsetMirrored }] }],
        }

        const areaBySpecies = (cells: readonly Cell[]) => {
          const out = new Map<string, number>()
          for (const cell of cells) out.set(cell.speciesId, (out.get(cell.speciesId) ?? 0) + polygonAreaMm2(cellPolygon(cell)))
          return out
        }
        const mOrig = compile(design)
        const mMirrored = compile(mirrored)
        fc.pre(!mOrig.truncated && !mMirrored.truncated)
        const a = areaBySpecies(mOrig.cells)
        const b = areaBySpecies(mMirrored.cells)
        for (const [species, area] of a) expect(b.get(species) ?? 0).toBeCloseTo(area, 3)
      }),
      { numRuns: 150 },
    )
  })
})
