import type { Design, SpeciesId } from '@/lib/engine'
import { makeGridDesign } from '@/lib/designs/grid'
import { MAX_PANEL_WIDTH_MM, MAX_CELL_MM, MIN_BOARD_SPAN_MM, fitWidths, roundHalf } from '@/lib/designs/fit'
import type { Lab } from '@/lib/species'
import { kmeansLab } from './kmeans'
import { rgbToLab } from './lab'
import { mapClustersToSpecies } from './map'
import { clusterRows } from './rowCluster'

export interface PixelGrid {
  readonly cols: number
  readonly rows: number
  readonly rgba: Uint8ClampedArray
}

/** Потолок сетки: 24 на 16 клеток - это 384 ячейки, вчетверо ниже предупреждения движка. */
export const PHOTO_MAX_COLS = 24
export const PHOTO_MAX_ROWS = 16
export const PHOTO_MIN_COLORS = 2
export const PHOTO_MAX_COLORS = 5
/** Сид пайплайна прибит: одна и та же картинка обязана давать одну и ту же доску. */
export const PHOTO_SEED = 20260812

export interface PhotoParams {
  readonly colors: number
  readonly panels: number
  readonly name?: string
  readonly seed?: number
}

export interface PhotoResult {
  readonly design: Design
  readonly species: readonly SpeciesId[]
  readonly panelCount: number
  readonly cols: number
  readonly rows: number
}

export function gridToLab(grid: PixelGrid): Lab[] {
  const out: Lab[] = []
  for (let i = 0; i < grid.cols * grid.rows; i += 1) {
    out.push(rgbToLab(grid.rgba[i * 4] ?? 0, grid.rgba[i * 4 + 1] ?? 0, grid.rgba[i * 4 + 2] ?? 0))
  }
  return out
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

/**
 * Фотография в изготовимую доску за четыре шага: цвет в LAB, k-means по цвету,
 * центроиды на реальные породы, ряды на щиты через k-medoids. Нейросети здесь нет,
 * поэтому результат детерминирован и всегда проходит проверки изготовимости.
 */
export function photoToDesign(grid: PixelGrid, params: PhotoParams): PhotoResult {
  const cols = clampInt(grid.cols, 1, PHOTO_MAX_COLS)
  const rows = clampInt(grid.rows, 1, PHOTO_MAX_ROWS)
  const seed = params.seed ?? PHOTO_SEED
  const colors = clampInt(params.colors, PHOTO_MIN_COLORS, PHOTO_MAX_COLORS)
  const panels = clampInt(params.panels, 1, rows)

  const labs = gridToLab({ cols, rows, rgba: grid.rgba })
  const clusters = kmeansLab(labs, colors, { seed })
  const species = mapClustersToSpecies(clusters.centroids)

  const indexRows: number[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => clusters.labels[row * cols + col] ?? 0),
  )
  const clustering = clusterRows(indexRows, panels, { seed })
  const rowOf = (row: number): readonly number[] => {
    const medoid = clustering.medoids[clustering.labels[row] ?? 0] ?? row
    return indexRows[medoid] ?? indexRows[row] ?? []
  }

  // Ширина клетки выводится из числа колонок: доска обязана влезть в рейсмус целиком.
  const cellMm = roundHalf(MAX_PANEL_WIDTH_MM / Math.max(1, cols))
  // На вырожденно узкой сетке (1-2 клетки) обычный потолок клетки в 45 мм не даёт набрать
  // минимальный габарит доски: раздвигаем потолок ровно настолько, чтобы габарит стал достижим.
  const colMax = Math.max(MAX_CELL_MM, Math.ceil(MIN_BOARD_SPAN_MM / Math.max(1, cols)))
  const rowMax = Math.max(MAX_CELL_MM, Math.ceil(MIN_BOARD_SPAN_MM / Math.max(1, rows)))
  const colWidthsMm = fitWidths(new Array(cols).fill(cellMm), { max: colMax })
  const rowHeightsMm = fitWidths(new Array(rows).fill(cellMm), { maxTotal: 600, max: rowMax })

  const fallback: SpeciesId = species[0] ?? 'maple'
  const design = makeGridDesign({
    id: `photo-${cols}x${rows}-${colors}-${panels}`,
    name: params.name ?? 'Фото',
    colWidthsMm,
    rowHeightsMm,
    at: (col, row) => species[rowOf(row)[col] ?? 0] ?? fallback,
  })

  return { design, species, panelCount: design.panels.length, cols: colWidthsMm.length, rows: rowHeightsMm.length }
}
