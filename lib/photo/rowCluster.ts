import { makeRng } from '@/lib/generators/random'

export interface RowClusterOptions {
  readonly seed?: number
  readonly maxIter?: number
}

export interface RowClustering {
  readonly medoids: readonly number[]
  readonly labels: readonly number[]
}

const DEFAULT_MAX_ITER = 20

/** Расстояние Хэмминга: сколько клеток ряда пришлось бы переклеить, чтобы получить другой ряд. */
export function rowDistance(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length)
  let distance = 0
  for (let i = 0; i < length; i += 1) if ((a[i] ?? -1) !== (b[i] ?? -1)) distance += 1
  return distance
}

function nearestMedoid(rows: readonly (readonly number[])[], medoids: readonly number[], index: number): number {
  const row = rows[index]
  if (!row) return 0
  let best = 0
  let bestDistance = Infinity
  medoids.forEach((medoid, position) => {
    const candidate = rows[medoid]
    if (!candidate) return
    const d = rowDistance(row, candidate)
    // Ничьи разрешаются в пользу более раннего медоида: результат не зависит от порядка обхода.
    if (d < bestDistance) {
      bestDistance = d
      best = position
    }
  })
  return best
}

/**
 * k-medoids над рядами картинки. Центр кластера обязан быть настоящим рядом: доска
 * склеивается из панелей, а среднее арифметическое двух панелей склеить нельзя.
 * Число медоидов и есть число щитов первой склейки, то есть цена узора в работе.
 */
export function clusterRows(
  rows: readonly (readonly number[])[],
  k: number,
  opts: RowClusterOptions = {},
): RowClustering {
  if (rows.length === 0 || k <= 0) return { medoids: [], labels: [] }
  const wanted = Math.min(Math.max(1, Math.round(k)), rows.length)
  const rng = makeRng(opts.seed ?? 1)
  const maxIter = opts.maxIter ?? DEFAULT_MAX_ITER

  // Инициализация в духе k-means++: следующий медоид тем вероятнее, чем он дальше от уже взятых.
  const medoids: number[] = [rng.int(rows.length)]
  while (medoids.length < wanted) {
    const weights = rows.map((row, index) => {
      if (medoids.includes(index)) return 0
      const nearest = medoids.reduce((acc, medoid) => Math.min(acc, rowDistance(row, rows[medoid] ?? row)), Infinity)
      return nearest === Infinity ? 0 : nearest * nearest
    })
    const total = weights.reduce((acc, value) => acc + value, 0)
    if (total <= 0) {
      // Все оставшиеся ряды совпадают с уже взятыми: добираем первым свободным индексом.
      const free = rows.findIndex((_, index) => !medoids.includes(index))
      if (free < 0) break
      medoids.push(free)
      continue
    }
    let target = rng.next() * total
    let chosen = -1
    for (let i = 0; i < rows.length; i += 1) {
      target -= weights[i] ?? 0
      if (target <= 0 && (weights[i] ?? 0) > 0) {
        chosen = i
        break
      }
    }
    if (chosen < 0) break
    medoids.push(chosen)
  }

  let labels = rows.map((_, index) => nearestMedoid(rows, medoids, index))

  for (let iteration = 0; iteration < maxIter; iteration += 1) {
    let moved = false
    medoids.forEach((current, position) => {
      const members = rows.map((_, index) => index).filter((index) => labels[index] === position)
      if (members.length === 0) return
      let best = current
      let bestCost = Infinity
      for (const candidate of members) {
        const candidateRow = rows[candidate]
        if (!candidateRow) continue
        let cost = 0
        for (const member of members) cost += rowDistance(rows[member] ?? candidateRow, candidateRow)
        if (cost < bestCost || (cost === bestCost && candidate < best)) {
          bestCost = cost
          best = candidate
        }
      }
      if (best !== current) {
        medoids[position] = best
        moved = true
      }
    })
    const nextLabels = rows.map((_, index) => nearestMedoid(rows, medoids, index))
    const stable = !moved && nextLabels.every((label, index) => label === labels[index])
    labels = nextLabels
    if (stable) break
  }

  // Пустые кластеры убираем: иначе число щитов на экране разошлось бы с числом панелей в документе.
  const usedPositions = [...new Set(labels)].sort((a, b) => a - b)
  const compactMedoids = usedPositions.map((position) => medoids[position] ?? 0)
  const remap = new Map(usedPositions.map((position, index) => [position, index]))

  return {
    medoids: compactMedoids,
    labels: labels.map((label) => remap.get(label) ?? 0),
  }
}
