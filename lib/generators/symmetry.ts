import { pick } from '@/lib/designs/grid'
import { weightedIndex, type CellFn } from './cells'
import type { Genome } from './genome'
import { makeRng, mixSeed } from './random'

export type SymmetryGroup = 'pmm' | 'p4m' | 'p2'

/**
 * Размер плитки, из которой отражениями строится вся доска.
 * pmm и p4m строятся из четверти, p2 из половины по рядам: поворот на 180 градусов
 * переносит верхнюю половину в нижнюю целиком, включая её асимметрию.
 */
export function tileDims(group: SymmetryGroup, cols: number, rows: number): { readonly w: number; readonly h: number } {
  const halfCols = Math.ceil(cols / 2)
  const halfRows = Math.ceil(rows / 2)
  if (group === 'p2') return { w: cols, h: halfRows }
  return { w: halfCols, h: halfRows }
}

/** Случайная плитка индексов палитры. Сид отдельный, чтобы смена палитры не ломала рисунок. */
export function makeTile(genome: Genome, group: SymmetryGroup): readonly (readonly number[])[] {
  const { cols, rows, density } = genome.params
  const dims = tileDims(group, cols, rows)
  const rng = makeRng(mixSeed(genome.seed, 0x51))
  return Array.from({ length: dims.w }, () =>
    Array.from({ length: dims.h }, () => weightedIndex(rng, genome.palette.length, density)),
  )
}

function fold(index: number, size: number, half: number): number {
  const folded = index < half ? index : size - 1 - index
  return Math.max(0, Math.min(half - 1, folded))
}

export function symmetryCells(group: SymmetryGroup): (genome: Genome) => CellFn {
  return (genome) => {
    const { cols, rows } = genome.params
    const tile = makeTile(genome, group)
    const dims = tileDims(group, cols, rows)
    const at = (x: number, y: number): number => tile[x]?.[y] ?? 0

    return (col, row) => {
      const fc = fold(col, cols, dims.w)
      const fr = fold(row, rows, dims.h)
      let index: number
      if (group === 'p4m') {
        // Диагональное зеркало поверх двух осевых: классическая обойная группа p4m.
        index = at(Math.min(fc, fr), Math.max(fc, fr))
      } else if (group === 'pmm') {
        index = at(fc, fr)
      } else {
        // p2: верхняя половина как есть, нижняя - поворот на 180 градусов.
        index = row < dims.h ? at(col, row) : at(cols - 1 - col, rows - 1 - row)
      }
      return pick(genome.palette, index)
    }
  }
}
