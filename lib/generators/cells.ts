import type { SpeciesId } from '@/lib/engine'
import type { Rng } from './random'

/** Узор как чистая функция координат сетки: одна и та же клетка всегда даёт одну и ту же породу. */
export type CellFn = (col: number, row: number) => SpeciesId

/**
 * Индекс породы со смещением к фону. Палитра устроена как «нулевая порода - фон,
 * остальные - акценты», поэтому density прямо управляет тем, сколько на доске
 * не-фоновых клеток, а не просто крутит генератор.
 */
export function weightedIndex(rng: Rng, paletteSize: number, density: number): number {
  if (paletteSize <= 1) return 0
  if (!rng.bool(Math.max(0.05, Math.min(0.95, density)))) return 0
  return 1 + rng.int(paletteSize - 1)
}
