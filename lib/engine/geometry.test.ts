import { describe, it, expect } from 'vitest'
import { clipHalfPlane, insetConvex, polygonAreaMm2, polygonBbox, polygonsOverlapMm2, rectPoly, type Pt } from './geometry'

describe('rectPoly / polygonAreaMm2 / polygonBbox', () => {
  it('площадь прямоугольника равна произведению сторон', () => {
    const poly = rectPoly(10, 20, 30, 40)
    expect(polygonAreaMm2(poly)).toBeCloseTo(30 * 40, 9)
  })

  it('bbox прямоугольника совпадает с его же параметрами', () => {
    const poly = rectPoly(10, 20, 30, 40)
    expect(polygonBbox(poly)).toEqual({ xMm: 10, yMm: 20, widthMm: 30, heightMm: 40 })
  })

  it('bbox пустого полигона нулевой', () => {
    expect(polygonBbox([])).toEqual({ xMm: 0, yMm: 0, widthMm: 0, heightMm: 0 })
  })
})

describe('clipHalfPlane', () => {
  it('диагональ делит прямоугольник на две части, сумма площадей равна исходной', () => {
    const rect = rectPoly(0, 0, 10, 10)
    // отсекаем по прямой x + y <= 10 (диагональ квадрата)
    const left = clipHalfPlane(rect, 1, 1, 10)
    const right = clipHalfPlane(rect, -1, -1, -10)
    expect(polygonAreaMm2(left) + polygonAreaMm2(right)).toBeCloseTo(100, 6)
  })

  it('полуплоскость не пересекает полигон: даёт пустой список или весь полигон', () => {
    const rect = rectPoly(0, 0, 10, 10)
    expect(clipHalfPlane(rect, 1, 0, 100)).toEqual(rect) // x <= 100, всё внутри
    expect(clipHalfPlane(rect, 1, 0, -100)).toEqual([]) // x <= -100, ничего не влезает
  })

  it('сохраняет выпуклость результата (без самопересечений при простом отсечении квадрата)', () => {
    const rect = rectPoly(0, 0, 10, 10)
    const clipped = clipHalfPlane(rect, 1, 1, 10)
    expect(clipped.length).toBeGreaterThanOrEqual(3)
    expect(polygonAreaMm2(clipped)).toBeCloseTo(50, 6)
  })
})

describe('insetConvex', () => {
  it('прямоугольник со сдвигом d даёт прямоугольник со сторонами меньше на 2d', () => {
    const rect = rectPoly(0, 0, 20, 10)
    const inset = insetConvex(rect, 2)
    const bbox = polygonBbox(inset)
    expect(bbox.widthMm).toBeCloseTo(16, 6)
    expect(bbox.heightMm).toBeCloseTo(6, 6)
  })

  it('слишком большое d даёт пустой полигон, а не вывернутый', () => {
    const rect = rectPoly(0, 0, 10, 10)
    expect(insetConvex(rect, 100)).toEqual([])
  })

  it('d = 0 не меняет полигон по площади', () => {
    const rect = rectPoly(0, 0, 10, 10)
    expect(polygonAreaMm2(insetConvex(rect, 0))).toBeCloseTo(100, 6)
  })
})

describe('polygonsOverlapMm2', () => {
  it('пересечение двух одинаковых прямоугольников равно их площади', () => {
    const a = rectPoly(0, 0, 10, 10)
    expect(polygonsOverlapMm2(a, a)).toBeCloseTo(100, 6)
  })

  it('непересекающиеся прямоугольники дают нулевую площадь пересечения', () => {
    const a = rectPoly(0, 0, 10, 10)
    const b = rectPoly(100, 100, 10, 10)
    expect(polygonsOverlapMm2(a, b)).toBe(0)
  })

  it('частично перекрывающиеся прямоугольники дают площадь пересечения', () => {
    const a = rectPoly(0, 0, 10, 10)
    const b = rectPoly(5, 5, 10, 10)
    expect(polygonsOverlapMm2(a, b)).toBeCloseTo(25, 6)
  })

  it('соседние без зазора прямоугольники не перекрываются', () => {
    const a = rectPoly(0, 0, 10, 10)
    const b = rectPoly(10, 0, 10, 10)
    expect(polygonsOverlapMm2(a, b)).toBeCloseTo(0, 6)
  })
})

describe('вырожденные входы', () => {
  it('полигон меньше 3 точек имеет нулевую площадь', () => {
    const degenerate: Pt[] = [[0, 0], [1, 1]]
    expect(polygonAreaMm2(degenerate)).toBe(0)
  })

  it('clipHalfPlane пустого полигона даёт пустой список', () => {
    expect(clipHalfPlane([], 1, 0, 10)).toEqual([])
  })
})
