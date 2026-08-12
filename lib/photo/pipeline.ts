import type { Design, SpeciesId } from '@/lib/engine'
import { makeGridDesign } from '@/lib/designs/grid'
import { MAX_PANEL_WIDTH_MM, MAX_CELL_MM, MIN_BOARD_SPAN_MM, fitWidths, roundHalf } from '@/lib/designs/fit'
import type { Lab } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'
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

/**
 * Альфа ниже этого порога (условно «прозрачнее чем на 94%») считаем дыркой, а не цветом:
 * такой пиксель не должен участвовать в поиске центроидов, иначе прозрачный фон логотипа
 * перетягивает на себя целый кластер и красится в чёрный или в случайный оттенок.
 */
const ALPHA_EMPTY_THRESHOLD = 16

/**
 * Порог доли дисперсии, которую объясняют кластеры (1 - внутрикластерная/полная).
 * На контрастных крупных пятнах кластеры объясняют почти всю дисперсию (около 1),
 * на мелкой текстуре и плавных градиентах - почти ничего. Ниже порога считаем,
 * что мотив рискует не прочитаться, и мягко предупреждаем пользователя.
 */
const LOW_QUALITY_FIT_THRESHOLD = 0.8

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
  /** Мягкая эвристика: true, если узор рискует превратиться в кашу (мелкая текстура, плавные переходы). */
  readonly lowQuality: boolean
}

/**
 * RGBA-пиксель компонуется на белый фон (обычный alpha-composite) и переводится в Lab.
 * Доска физически не может иметь дырок, поэтому любая прозрачность обязана свестись
 * к конкретному цвету ещё до кластеризации: полностью непрозрачные пиксели проходят
 * без изменений, частично прозрачные тускнеют к белому пропорционально альфе.
 */
function pixelToLab(r: number, g: number, b: number, a: number): Lab {
  const alpha = Math.max(0, Math.min(255, a)) / 255
  const composite = (channel: number): number => channel * alpha + 255 * (1 - alpha)
  return rgbToLab(composite(r), composite(g), composite(b))
}

export function gridToLab(grid: PixelGrid): Lab[] {
  const out: Lab[] = []
  for (let i = 0; i < grid.cols * grid.rows; i += 1) {
    out.push(
      pixelToLab(
        grid.rgba[i * 4] ?? 0,
        grid.rgba[i * 4 + 1] ?? 0,
        grid.rgba[i * 4 + 2] ?? 0,
        grid.rgba[i * 4 + 3] ?? 255,
      ),
    )
  }
  return out
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

/** Доля дисперсии, которую реально объясняют найденные кластеры: 1 - внутрикластерная / полная. */
function clusterFitRatio(
  points: readonly Lab[],
  clusters: { readonly centroids: readonly Lab[]; readonly labels: readonly number[] },
): number {
  if (points.length === 0 || clusters.centroids.length === 0) return 1
  const mean = points.reduce(
    (acc, p) => ({ L: acc.L + p.L / points.length, a: acc.a + p.a / points.length, b: acc.b + p.b / points.length }),
    { L: 0, a: 0, b: 0 },
  )
  let totalSS = 0
  let withinSS = 0
  points.forEach((point, index) => {
    totalSS += labDistance(point, mean) ** 2
    const centroid = clusters.centroids[clusters.labels[index] ?? 0]
    if (centroid) withinSS += labDistance(point, centroid) ** 2
  })
  if (totalSS <= 0) return 1
  return 1 - withinSS / totalSS
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
  const emptyMask = Array.from({ length: cols * rows }, (_, i) => (grid.rgba[i * 4 + 3] ?? 255) < ALPHA_EMPTY_THRESHOLD)
  const contentLabs = labs.filter((_, i) => !emptyMask[i])
  const hasContent = contentLabs.length > 0
  // Прозрачные пиксели не участвуют в поиске центроидов, чтобы не перетягивать кластер
  // на себя; если прозрачно всё изображение целиком, кластеризуем по белому фону.
  const clusterInput = hasContent ? contentLabs : labs
  const clusters = kmeansLab(clusterInput, colors, { seed })
  const species = mapClustersToSpecies(clusters.centroids)

  // «Дырке» от прозрачности всегда достаётся самый светлый кластер (индекс 0 после
  // канонической сортировки в kmeansLab) - доска физически не может иметь дырок.
  let contentIndex = 0
  const gridLabels: number[] = new Array(cols * rows)
  for (let i = 0; i < cols * rows; i += 1) {
    if (hasContent && emptyMask[i]) {
      gridLabels[i] = 0
    } else {
      gridLabels[i] = clusters.labels[contentIndex] ?? 0
      contentIndex += 1
    }
  }

  const lowQuality = clusterFitRatio(clusterInput, clusters) < LOW_QUALITY_FIT_THRESHOLD

  const indexRows: number[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => gridLabels[row * cols + col] ?? 0),
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

  return {
    design,
    species,
    panelCount: design.panels.length,
    cols: colWidthsMm.length,
    rows: rowHeightsMm.length,
    lowQuality,
  }
}
