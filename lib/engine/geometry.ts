import { GEOM_EPS_MM } from './types'

/** Точка на плоскости, мм. Экранные координаты: x вправо, y вниз. */
export type Pt = readonly [number, number]

/** Прямоугольный габарит полигона, мм. */
export interface PolyBbox {
  readonly xMm: number
  readonly yMm: number
  readonly widthMm: number
  readonly heightMm: number
}

/** Убирает подряд идущие (включая обёртку через конец массива) точки ближе GEOM_EPS_MM. */
function dedupeClose(points: readonly Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of points) {
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev[0] - p[0]) < GEOM_EPS_MM && Math.abs(prev[1] - p[1]) < GEOM_EPS_MM) continue
    out.push(p)
  }
  const first = out[0]
  const last = out[out.length - 1]
  if (out.length > 1 && first && last && Math.abs(first[0] - last[0]) < GEOM_EPS_MM && Math.abs(first[1] - last[1]) < GEOM_EPS_MM) {
    out.pop()
  }
  return out
}

/**
 * Отсекает выпуклый (или произвольный простой) полигон полуплоскостью `a·x + b·y <= cc`,
 * оставляя только ту часть, что удовлетворяет неравенству. Алгоритм Сазерленда-Ходжмана
 * по одной плоскости. Точки ближе GEOM_EPS_MM друг к другу схлопываются.
 */
export function clipHalfPlane(poly: readonly Pt[], a: number, b: number, cc: number): Pt[] {
  if (poly.length === 0) return []
  const inside = (p: Pt): boolean => a * p[0] + b * p[1] <= cc + GEOM_EPS_MM
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i += 1) {
    const curr = poly[i]!
    const prev = poly[(i - 1 + poly.length) % poly.length]!
    const currIn = inside(curr)
    const prevIn = inside(prev)
    if (currIn !== prevIn) {
      const da = a * prev[0] + b * prev[1] - cc
      const db = a * curr[0] + b * curr[1] - cc
      const denom = da - db
      const t = Math.abs(denom) < GEOM_EPS_MM ? 0 : da / denom
      out.push([prev[0] + t * (curr[0] - prev[0]), prev[1] + t * (curr[1] - prev[1])])
    }
    if (currIn) out.push(curr)
  }
  const deduped = dedupeClose(out)
  return deduped.length >= 3 ? deduped : []
}

/** Площадь полигона по формуле шнурования, мм². Работает для выпуклых и простых невыпуклых. */
export function polygonAreaMm2(poly: readonly Pt[]): number {
  if (poly.length < 3) return 0
  let sum = 0
  for (let i = 0; i < poly.length; i += 1) {
    const p1 = poly[i]!
    const p2 = poly[(i + 1) % poly.length]!
    sum += p1[0] * p2[1] - p2[0] * p1[1]
  }
  return Math.abs(sum) / 2
}

/** Габаритный прямоугольник полигона, мм. */
export function polygonBbox(poly: readonly Pt[]): PolyBbox {
  if (poly.length === 0) return { xMm: 0, yMm: 0, widthMm: 0, heightMm: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return { xMm: minX, yMm: minY, widthMm: maxX - minX, heightMm: maxY - minY }
}

/** Прямоугольник как полигон, обход по часовой стрелке в экранных координатах (y вниз). */
export function rectPoly(xMm: number, yMm: number, widthMm: number, heightMm: number): Pt[] {
  return [
    [xMm, yMm],
    [xMm + widthMm, yMm],
    [xMm + widthMm, yMm + heightMm],
    [xMm, yMm + heightMm],
  ]
}

/**
 * Опорные внутренние полуплоскости выпуклого полигона: по одной на ребро, нормаль направлена
 * внутрь (проверяется через центроид). Не зависит от направления обхода полигона.
 */
function inwardHalfPlanes(poly: readonly Pt[]): Array<{ a: number; b: number; cc: number }> {
  if (poly.length < 3) return []
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length
  const planes: Array<{ a: number; b: number; cc: number }> = []
  for (let i = 0; i < poly.length; i += 1) {
    const p1 = poly[i]!
    const p2 = poly[(i + 1) % poly.length]!
    const dx = p2[0] - p1[0]
    const dy = p2[1] - p1[1]
    const len = Math.hypot(dx, dy)
    if (len < GEOM_EPS_MM) continue
    let nx = dy / len
    let ny = -dx / len
    if (nx * (cx - p1[0]) + ny * (cy - p1[1]) < 0) {
      nx = -nx
      ny = -ny
    }
    planes.push({ a: -nx, b: -ny, cc: -(nx * p1[0] + ny * p1[1]) })
  }
  return planes
}

/**
 * Сдвигает каждое ребро выпуклого полигона внутрь на dMm и отсекает результат. Для
 * прямоугольника даёт прямоугольник со сторонами меньше на 2*dMm. Слишком большое dMm даёт
 * пустой список, а не вывернутый полигон.
 */
export function insetConvex(poly: readonly Pt[], dMm: number): Pt[] {
  let result: Pt[] = poly.slice() as Pt[]
  for (const pl of inwardHalfPlanes(poly)) {
    if (result.length === 0) break
    result = clipHalfPlane(result, pl.a, pl.b, pl.cc - dMm)
  }
  return result
}

/** Площадь пересечения двух выпуклых полигонов, мм². Нужен тестам, живёт в проде намеренно. */
export function polygonsOverlapMm2(a: readonly Pt[], b: readonly Pt[]): number {
  let result: Pt[] = a.slice() as Pt[]
  for (const pl of inwardHalfPlanes(b)) {
    if (result.length === 0) break
    result = clipHalfPlane(result, pl.a, pl.b, pl.cc)
  }
  return polygonAreaMm2(result)
}
