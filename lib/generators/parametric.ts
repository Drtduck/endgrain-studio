import { pick } from '@/lib/designs/grid'
import { getSpeciesById } from '@/lib/species'
import type { CellFn } from './cells'
import type { Genome } from './genome'
import { makeRng, mixSeed } from './random'

/** Палитра, отсортированная от светлого к тёмному: градиент обязан быть монотонным. */
function byLightness(palette: readonly string[]): readonly string[] {
  return [...palette].sort((a, b) => getSpeciesById(b).lab.L - getSpeciesById(a).lab.L)
}

/**
 * Полосы вдоль длины доски: порядок пород в колонках случайный, но фиксированный сидом,
 * а ширины уже неровные из генома, поэтому две случайные полосатые доски не похожи.
 */
export function stripesCells(genome: Genome): CellFn {
  const rng = makeRng(mixSeed(genome.seed, 0x21))
  const size = genome.palette.length
  const order: number[] = []
  for (let col = 0; col < genome.params.cols; col += 1) {
    // Первые size колонок гарантированно разные: палитра должна прозвучать целиком.
    order.push(col < size ? col : rng.int(size))
  }
  const shuffled = makeRng(mixSeed(genome.seed, 0x22)).shuffled(order)
  return (col) => pick(genome.palette, shuffled[col] ?? 0)
}

/** Кирпич: блок в несколько колонок, каждый ряд сдвинут на часть блока. */
export function brickCells(genome: Genome): CellFn {
  const block = 1 + Math.round(genome.params.density * 3)
  const shift = Math.max(1, Math.round(block / 2))
  return (col, row) => pick(genome.palette, Math.floor((col + row * shift) / block) + row)
}

/** Зеркальный градиент по светлоте с медленным дрейфом по рядам. */
export function gradientCells(genome: Genome): CellFn {
  const ramp = byLightness(genome.palette)
  const cols = genome.params.cols
  const drift = genome.params.density > 0.6 ? 1 : 0
  return (col, row) => {
    const mirrored = Math.min(col, cols - 1 - col)
    const step = Math.floor((mirrored * ramp.length) / Math.max(1, Math.ceil(cols / 2)))
    return pick(ramp, step + drift * Math.floor(row / 3))
  }
}
