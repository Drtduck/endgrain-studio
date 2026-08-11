import type { Lab } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'
import { makeRng } from '@/lib/generators/random'

export interface KMeansOptions {
  readonly seed?: number
  readonly maxIter?: number
}

export interface KMeansResult {
  readonly centroids: readonly Lab[]
  readonly labels: readonly number[]
  readonly iterations: number
}

const DEFAULT_MAX_ITER = 30

function nearestIndex(point: Lab, centroids: readonly Lab[]): number {
  let best = 0
  let bestDistance = Infinity
  centroids.forEach((centroid, index) => {
    const d = labDistance(point, centroid)
    if (d < bestDistance) {
      bestDistance = d
      best = index
    }
  })
  return best
}

/** k-means++: первый центр случайный, дальше точки берутся с вероятностью, растущей с расстоянием. */
function seedCentroids(points: readonly Lab[], k: number, seed: number): Lab[] {
  const rng = makeRng(seed)
  const first = points[rng.int(points.length)]
  if (first === undefined) return []
  const centroids: Lab[] = [first]
  while (centroids.length < k) {
    const weights = points.map((point) => {
      const d = labDistance(point, centroids[nearestIndex(point, centroids)] ?? point)
      return d * d
    })
    const total = weights.reduce((acc, value) => acc + value, 0)
    if (total <= 0) break
    let target = rng.next() * total
    let chosen = points[0]
    for (let i = 0; i < points.length; i += 1) {
      target -= weights[i] ?? 0
      if (target <= 0) {
        chosen = points[i]
        break
      }
    }
    if (chosen === undefined) break
    centroids.push(chosen)
  }
  return centroids
}

/**
 * k-means в LAB с детерминированной инициализацией. Результат канонизируется сортировкой
 * центроидов по светлоте: нулевой кластер всегда самый светлый, и порядок не зависит
 * от того, как лёг k-means++.
 */
export function kmeansLab(points: readonly Lab[], k: number, opts: KMeansOptions = {}): KMeansResult {
  const seed = opts.seed ?? 1
  const maxIter = opts.maxIter ?? DEFAULT_MAX_ITER
  if (points.length === 0 || k <= 0) return { centroids: [], labels: [], iterations: 0 }

  const wanted = Math.min(k, points.length)
  let centroids = seedCentroids(points, wanted, seed)
  if (centroids.length === 0) return { centroids: [], labels: [], iterations: 0 }

  let labels: number[] = new Array(points.length).fill(0)
  let iterations = 0

  for (; iterations < maxIter; iterations += 1) {
    const nextLabels = points.map((point) => nearestIndex(point, centroids))
    const stable = nextLabels.every((label, index) => label === labels[index])
    labels = nextLabels
    if (stable && iterations > 0) break

    const sums = centroids.map(() => ({ L: 0, a: 0, b: 0, n: 0 }))
    points.forEach((point, index) => {
      const bucket = sums[labels[index] ?? 0]
      if (!bucket) return
      bucket.L += point.L
      bucket.a += point.a
      bucket.b += point.b
      bucket.n += 1
    })

    centroids = sums.map((bucket) => {
      if (bucket.n > 0) return { L: bucket.L / bucket.n, a: bucket.a / bucket.n, b: bucket.b / bucket.n }
      // Пустой кластер: переносим его на самую далёкую от своего центра точку,
      // иначе на однотонной картинке половина кластеров осталась бы призраками.
      let worst = points[0] ?? { L: 0, a: 0, b: 0 }
      let worstDistance = -1
      for (const point of points) {
        const d = labDistance(point, centroids[nearestIndex(point, centroids)] ?? point)
        if (d > worstDistance) {
          worstDistance = d
          worst = point
        }
      }
      return worst
    })
  }

  // Схлопываем дубликаты: на плоской картинке несколько центров могут сойтись в одну точку.
  const unique: Lab[] = []
  const remap = new Map<number, number>()
  centroids.forEach((centroid, index) => {
    const existing = unique.findIndex((c) => labDistance(c, centroid) < 1e-6)
    if (existing >= 0) {
      remap.set(index, existing)
      return
    }
    remap.set(index, unique.length)
    unique.push(centroid)
  })

  const order = unique
    .map((centroid, index) => ({ centroid, index }))
    .sort((a, b) => b.centroid.L - a.centroid.L || a.index - b.index)
  const position = new Map(order.map((entry, rank) => [entry.index, rank]))

  return {
    centroids: order.map((entry) => entry.centroid),
    labels: labels.map((label) => position.get(remap.get(label) ?? 0) ?? 0),
    iterations,
  }
}
