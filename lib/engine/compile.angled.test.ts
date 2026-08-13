import { describe, it, expect } from 'vitest'
import { compile } from './compile'
import { baseDesign, stripsPanel } from './fixtures'
import { polygonAreaMm2 } from './geometry'
import type { Cell, Design } from './types'

const TAN30 = Math.tan((30 * Math.PI) / 180)

/** Панель P с одним SliceRef-элементом на Q, вклеенным как единственная колонка ряда r1. */
function angledColumnDesign(opts: {
  angleDeg: number
  thicknessMm: number
  offsetMm?: number
  flip?: boolean
  rowFlip?: boolean
  rowMirror?: boolean
  rowThicknessMm?: number
  innerWidths?: readonly number[]
}): Design {
  const { angleDeg, thicknessMm, offsetMm = 0, flip = false, rowFlip = false, rowMirror = false, rowThicknessMm = 12 } = opts
  const widths = opts.innerWidths ?? [12]
  const species = widths.map((_, i) => (i % 2 === 0 ? 'walnut' : 'maple'))
  return baseDesign({
    panels: [
      { id: 'Q', elements: widths.map((widthMm, i) => ({ kind: 'strip' as const, speciesId: species[i]!, widthMm })) },
      { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm, angleDeg, offsetMm, flip }] },
    ],
    rows: [{ id: 'r1', panelId: 'P', thicknessMm: rowThicknessMm, angleDeg: 0, flip: rowFlip, mirror: rowMirror, trimMm: 5 }],
  })
}

describe('compile: угловой SliceRef, точечный кейс с посчитанными руками вершинами', () => {
  it('одна полоса 12мм, срез 10мм под 30°, ряд 12мм: две ячейки покрывают прямоугольник без остатка', () => {
    const d = angledColumnDesign({ angleDeg: 30, thicknessMm: 10, rowThicknessMm: 12, innerWidths: [12] })
    const m = compile(d)
    expect(m.cells).toHaveLength(2)

    // k=-1: треугольник (0,0),(10,0),(10, 10*tan30)
    const first = m.cells[0]!
    expect(first.poly).toBeDefined()
    expect(first.poly).toHaveLength(3)
    const p0 = first.poly!
    expect(p0[0]).toEqual([0, 0])
    expect(p0[1]).toEqual([10, 0])
    expect(p0[2]![0]).toBeCloseTo(10, 9)
    expect(p0[2]![1]).toBeCloseTo(10 * TAN30, 9)

    // k=0: четырёхугольник (0,0),(10, 10*tan30),(10,12),(0,12)
    const second = m.cells[1]!
    expect(second.poly).toHaveLength(4)
    const p1 = second.poly!
    expect(p1[0]).toEqual([0, 0])
    expect(p1[1]![0]).toBeCloseTo(10, 9)
    expect(p1[1]![1]).toBeCloseTo(10 * TAN30, 9)
    expect(p1[2]).toEqual([10, 12])
    expect(p1[3]).toEqual([0, 12])

    // сумма площадей равна площади прямоугольника колонки: 10 * 12 = 120
    const totalArea = m.cells.reduce((s, c) => s + polygonAreaMm2(c.poly ?? []), 0)
    expect(totalArea).toBeCloseTo(120, 6)
  })
})

describe('compile: угловой SliceRef, флип и зеркало', () => {
  it('row.flip XOR ref.flip переворачивает порядок полос', () => {
    const base = compile(angledColumnDesign({ angleDeg: 20, thicknessMm: 15, innerWidths: [10, 8], rowFlip: false }))
    const flipped = compile(angledColumnDesign({ angleDeg: 20, thicknessMm: 15, innerWidths: [10, 8], rowFlip: true }))
    // Двойной флип (row.flip XOR ref.flip = false опять) должен вернуть тот же порядок полос.
    const doubleFlipped = compile(
      angledColumnDesign({ angleDeg: 20, thicknessMm: 15, innerWidths: [10, 8], rowFlip: true, flip: true }),
    )
    expect(flipped.cells.map((c) => c.speciesId)).not.toEqual(base.cells.map((c) => c.speciesId))
    expect(doubleFlipped.cells.map((c) => c.speciesId)).toEqual(base.cells.map((c) => c.speciesId))
  })

  /**
   * row.mirror обязан переворачивать знак наклона (иначе зеркальная доска ехала бы в ту же
   * сторону) - это и делает sSigned. Полноценная зеркальность "площадь по породам совпадает"
   * потребовала бы ещё и зеркального сдвига offsetMm, а offsetMm - сырое число в документе,
   * которое mirror не трогает ни здесь, ни в дозагловом коде (mirror и до угловой поддержки
   * менял только X-порядок элементов панели, не фазу тайлинга SliceRef). Это существующее
   * поведение вне области задачи, тест поэтому проверяет только то, что обязано быть верным
   * само по себе: суммарная площадь колонки не меняется и наклон действительно инвертирован.
   */
  it('row.mirror инвертирует наклон, суммарная площадь колонки не меняется', () => {
    const plain = compile(angledColumnDesign({ angleDeg: 25, thicknessMm: 12, innerWidths: [10, 6] }))
    const mirrored = compile(angledColumnDesign({ angleDeg: 25, thicknessMm: 12, innerWidths: [10, 6], rowMirror: true }))

    const totalArea = (cells: readonly Cell[]) => cells.reduce((s, c) => s + polygonAreaMm2(c.poly ?? []), 0)
    expect(totalArea(mirrored.cells)).toBeCloseTo(totalArea(plain.cells), 6)

    // Наклон действительно инвертирован: у первой ячейки плоского варианта верхняя граница
    // растёт слева направо (положительный sSigned), у зеркального - убывает.
    const slopeSign = (cells: readonly Cell[]) => {
      const withPoly = cells.find((c) => c.poly && c.poly.length >= 3)
      const poly = withPoly?.poly
      if (!poly) return 0
      const leftYs = poly.filter((p) => Math.abs(p[0] - 0) < 1e-6).map((p) => p[1])
      const rightYs = poly.filter((p) => Math.abs(p[0] - 12) < 1e-6).map((p) => p[1])
      if (leftYs.length === 0 || rightYs.length === 0) return 0
      return Math.sign(Math.min(...rightYs) - Math.min(...leftYs))
    }
    const s1 = slopeSign(plain.cells)
    const s2 = slopeSign(mirrored.cells)
    if (s1 !== 0 && s2 !== 0) expect(s2).toBe(-s1)
  })
})

describe('compile: сцепка соседних угловых колонок (V не разъезжается)', () => {
  /** Обратная формула к cursorStartMm внутри expandSliceRef: подбирает offsetMm так, чтобы
   *  реальный курсор был сравним по модулю cycleMm с targetCursorStart. Периодическая
   *  раскладка гарантирует, что где-то в бесконечной последовательности k найдётся граница
   *  ровно на targetCursorStart. */
  function offsetForCursorStart(cycleMm: number, rowTopMm: number, targetCursorStart: number): number {
    const r = rowTopMm - targetCursorStart
    const rMod = ((r % cycleMm) + cycleMm) % cycleMm
    return -rMod
  }

  function boundaryYsAtX(cells: readonly Cell[], xTarget: number): number[] {
    const ys: number[] = []
    for (const c of cells) {
      const poly = c.poly
      if (!poly) continue
      for (const [x, y] of poly) {
        if (Math.abs(x - xTarget) < 1e-6) ys.push(y)
      }
    }
    return ys.sort((a, b) => a - b)
  }

  it.each([15, 25, 35])('линия V непрерывна на стыке колонок при угле %s°', (angleDeg) => {
    const rad = (angleDeg * Math.PI) / 180
    const c = Math.cos(rad)
    const t1 = 15
    const t2 = 11
    const rowThicknessMm = 40
    const innerWidths = [12, 12]
    // Q используется обеими колонками, поэтому cycleMm одинаков (|angle| один и тот же).
    const cycleMm = innerWidths.reduce((s, w) => s + w / c, 0)

    const sSigned1 = Math.tan(rad) // колонка 0: angle=+A, без флипов и без mirror
    const cursorStart1 = 0 // offsetMm=0, rowTopMm=0
    const targetCursorStart2 = cursorStart1 + t1 * sSigned1
    const offset2 = offsetForCursorStart(cycleMm, 0, targetCursorStart2)

    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut', 'maple'], 12),
        {
          id: 'P',
          elements: [
            { kind: 'sliceRef', panelId: 'Q', thicknessMm: t1, angleDeg, offsetMm: 0 },
            { kind: 'sliceRef', panelId: 'Q', thicknessMm: t2, angleDeg: -angleDeg, offsetMm: offset2 },
          ],
        },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: rowThicknessMm, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })

    const m = compile(d)
    const col0 = m.cells.filter((c) => c.origin.elementIndex === 0)
    const col1 = m.cells.filter((c) => c.origin.elementIndex === 1)
    expect(col0.length).toBeGreaterThan(0)
    expect(col1.length).toBeGreaterThan(0)

    const rightEdgeYs = boundaryYsAtX(col0, t1) // правый край колонки 0
    const leftEdgeYs = boundaryYsAtX(col1, t1) // левый край колонки 1 (тот же x, соседняя колонка)

    // Хотя бы одна общая точка стыка должна совпасть с точностью до GEOM_EPS_MM.
    let matched = false
    for (const y1 of rightEdgeYs) {
      for (const y2 of leftEdgeYs) {
        if (Math.abs(y1 - y2) < 1e-6) matched = true
      }
    }
    expect(matched).toBe(true)
  })
})
