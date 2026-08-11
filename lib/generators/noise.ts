import { hash2, pick } from '@/lib/designs/grid'
import type { CellFn } from './cells'
import type { Genome } from './genome'
import { makeRng, mixSeed, type Rng } from './random'

/** Сколько кандидатов перебирается на одну точку в схеме best-candidate Митчелла. */
export const BLUE_NOISE_CANDIDATES = 8

/**
 * Голубой шум методом лучшего кандидата: каждая новая точка выбирается из нескольких
 * случайных так, чтобы оказаться максимально далеко от уже расставленных.
 * Белый шум на доске выглядит как грязь, потому что акценты слипаются в кляксы,
 * а голубой читается как осмысленная россыпь.
 */
export function blueNoiseMask(cols: number, rows: number, count: number, rng: Rng): boolean[] {
  const mask: boolean[] = new Array(Math.max(0, cols * rows)).fill(false)
  const chosen: Array<readonly [number, number]> = []
  const target = Math.max(0, Math.min(count, cols * rows))

  for (let placed = 0; placed < target; placed += 1) {
    let best: readonly [number, number] | null = null
    let bestScore = -1
    for (let candidate = 0; candidate < BLUE_NOISE_CANDIDATES; candidate += 1) {
      const x = rng.int(cols)
      const y = rng.int(rows)
      if (mask[y * cols + x] === true) continue
      let nearest = Infinity
      for (const [px, py] of chosen) nearest = Math.min(nearest, Math.max(Math.abs(px - x), Math.abs(py - y)))
      if (nearest > bestScore) {
        bestScore = nearest
        best = [x, y]
      }
    }
    if (best === null) {
      // Все кандидаты заняты: добираем первой свободной клеткой, иначе цикл вхолостую.
      const free = mask.indexOf(false)
      if (free < 0) break
      mask[free] = true
      chosen.push([free % cols, Math.floor(free / cols)])
      continue
    }
    mask[best[1] * cols + best[0]] = true
    chosen.push(best)
  }
  return mask
}

/** Хаос: фон плюс россыпь акцентов по голубому шуму, порода акцента берётся хэшем. */
export function chaosCells(genome: Genome): CellFn {
  const { cols, rows, density } = genome.params
  // До трети доски под акцентами: дальше фон перестаёт читаться как фон.
  const count = Math.round(density * cols * rows * 0.35)
  const mask = blueNoiseMask(cols, rows, count, makeRng(mixSeed(genome.seed, 0x31)))
  const accents = genome.palette.slice(1)
  const background = genome.palette[0] ?? genome.palette[0]

  return (col, row) => {
    if (background === undefined) throw new Error('пустая палитра в chaosCells')
    if (mask[row * cols + col] !== true) return background
    if (accents.length === 0) return background
    return pick(accents, hash2(col, row, genome.seed))
  }
}
