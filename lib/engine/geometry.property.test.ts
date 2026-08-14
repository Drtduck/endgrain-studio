import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { clipHalfPlane, insetConvex, polygonAreaMm2, polygonBbox, rectPoly, type Pt } from './geometry'

const rectArb = fc.record({
  xMm: fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
  yMm: fc.double({ min: -100, max: 100, noNaN: true, noDefaultInfinity: true }),
  widthMm: fc.double({ min: 1, max: 200, noNaN: true, noDefaultInfinity: true }),
  heightMm: fc.double({ min: 1, max: 200, noNaN: true, noDefaultInfinity: true }),
})

/** Прямая a·x + b·y = cc, направление задано ненулевым (a,b) и произвольным сдвигом. */
const halfPlaneArb = fc
  .record({
    angle: fc.double({ min: 0, max: Math.PI * 2, noNaN: true, noDefaultInfinity: true }),
    offset: fc.double({ min: -300, max: 300, noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ angle, offset }) => ({ a: Math.cos(angle), b: Math.sin(angle), cc: offset }))

function isConvex(poly: readonly Pt[]): boolean {
  if (poly.length < 3) return true
  let sign = 0
  for (let i = 0; i < poly.length; i += 1) {
    const p0 = poly[i]!
    const p1 = poly[(i + 1) % poly.length]!
    const p2 = poly[(i + 2) % poly.length]!
    const cross = (p1[0] - p0[0]) * (p2[1] - p1[1]) - (p1[1] - p0[1]) * (p2[0] - p1[0])
    if (Math.abs(cross) < 1e-9) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

describe('geometry property invariants', () => {
  it('отсечение прямоугольника наклонной прямой: сумма площадей двух частей равна исходной', () => {
    fc.assert(
      fc.property(rectArb, halfPlaneArb, ({ xMm, yMm, widthMm, heightMm }, { a, b, cc }) => {
        const rect = rectPoly(xMm, yMm, widthMm, heightMm)
        const left = clipHalfPlane(rect, a, b, cc)
        const right = clipHalfPlane(rect, -a, -b, -cc)
        expect(polygonAreaMm2(left) + polygonAreaMm2(right)).toBeCloseTo(widthMm * heightMm, 3)
      }),
      { numRuns: 300 },
    )
  })

  it('отсечение полуплоскостью, не задевающей полигон, даёт пустой список либо исходный полигон', () => {
    fc.assert(
      fc.property(rectArb, (rect) => {
        const poly = rectPoly(rect.xMm, rect.yMm, rect.widthMm, rect.heightMm)
        const farAway = clipHalfPlane(poly, 1, 0, rect.xMm - 1000)
        expect(farAway).toEqual([])
        const wholePoly = clipHalfPlane(poly, 1, 0, rect.xMm + rect.widthMm + 1000)
        expect(polygonAreaMm2(wholePoly)).toBeCloseTo(rect.widthMm * rect.heightMm, 6)
      }),
      { numRuns: 200 },
    )
  })

  it('выпуклость сохраняется после отсечения прямоугольника полуплоскостью', () => {
    fc.assert(
      fc.property(rectArb, halfPlaneArb, (rect, { a, b, cc }) => {
        const poly = rectPoly(rect.xMm, rect.yMm, rect.widthMm, rect.heightMm)
        const clipped = clipHalfPlane(poly, a, b, cc)
        expect(isConvex(clipped)).toBe(true)
      }),
      { numRuns: 300 },
    )
  })

  it('insetConvex прямоугольника на d даёт прямоугольник со сторонами меньше на 2d, пока d не слишком велико', () => {
    fc.assert(
      fc.property(
        rectArb,
        fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true }),
        (rect, dMm) => {
          fc.pre(dMm * 2 < Math.min(rect.widthMm, rect.heightMm))
          const poly = rectPoly(rect.xMm, rect.yMm, rect.widthMm, rect.heightMm)
          const inset = insetConvex(poly, dMm)
          const bbox = polygonBbox(inset)
          expect(bbox.widthMm).toBeCloseTo(rect.widthMm - 2 * dMm, 3)
          expect(bbox.heightMm).toBeCloseTo(rect.heightMm - 2 * dMm, 3)
        },
      ),
      { numRuns: 300 },
    )
  })

  it('insetConvex на слишком большое d даёт пустой полигон, а не вывернутый', () => {
    fc.assert(
      fc.property(rectArb, (rect) => {
        const poly = rectPoly(rect.xMm, rect.yMm, rect.widthMm, rect.heightMm)
        const dMm = Math.max(rect.widthMm, rect.heightMm) * 2 + 10
        const inset = insetConvex(poly, dMm)
        expect(inset).toEqual([])
      }),
      { numRuns: 200 },
    )
  })
})
