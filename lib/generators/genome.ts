import type { SpeciesId } from '@/lib/engine'
import { MAX_SLICE_ANGLE_DEG } from '@/lib/engine'
import {
  MAX_CELL_MM,
  MAX_PANEL_WIDTH_MM,
  MIN_BOARD_SPAN_MM,
  MIN_CELL_MM,
  fitWidths,
  roundHalf,
} from '@/lib/designs/fit'
import { MAX_PALETTE, MIN_PALETTE, makePalette, sanitisePalette } from './palette'
import { makeRng, mixSeed, type Rng } from './random'

export type FamilyId =
  | 'symmetry-pmm'
  | 'symmetry-p4m'
  | 'symmetry-p2'
  | 'stripes'
  | 'brick'
  | 'gradient'
  | 'chaos'
  | 'inlay'
  | 'chevron'
  | 'diamond'
  | 'tumbling'

export const FAMILY_IDS: readonly FamilyId[] = [
  'symmetry-pmm',
  'symmetry-p4m',
  'symmetry-p2',
  'stripes',
  'brick',
  'gradient',
  'chaos',
  'inlay',
  'chevron',
  'diamond',
  'tumbling',
]

export interface GenParams {
  readonly cols: number
  readonly rows: number
  readonly cellMm: number
  readonly density: number
  readonly jitter: number
  /**
   * Угол среза для угловых семейств (chevron/diamond/tumbling), градусов. Знак чередует сам
   * генератор (см. lib/generators/angled.ts), здесь хранится величина после clamp по хинту.
   * Для остальных семейств поле есть, но не используется - никакой SliceRef с ненулевым
   * углом они не порождают.
   */
  readonly angleDeg: number
}

export interface Genome {
  readonly familyId: FamilyId
  readonly seed: number
  readonly palette: readonly SpeciesId[]
  readonly colWidthsMm: readonly number[]
  readonly rowHeightsMm: readonly number[]
  readonly rowOrder: readonly number[]
  readonly params: GenParams
}

export interface FamilyHint {
  readonly cols: readonly [number, number]
  readonly rows: readonly [number, number]
  readonly palette: readonly [number, number]
  readonly squareCells: boolean
  readonly mirrorWidths: boolean
  readonly fixedCols?: number
  /**
   * Коридор угла среза для угловых семейств, градусов, по модулю. Отсутствует у прямых
   * семейств: у них угол всегда зажимается в 0.
   */
  readonly angle?: readonly [number, number]
}

/** Ряды доски: тот же коридор, что и у полос, плюс потолок длины ради вменяемого габарита. */
export const MIN_ROW_MM = MIN_CELL_MM
export const MAX_ROW_MM = MAX_CELL_MM
export const MAX_BOARD_LENGTH_MM = 600

/**
 * Разумные коридоры для каждого семейства. Это не про изготовимость (её держит clampGenome),
 * а про то, что узор должен читаться: восемь колонок для шахматной симметрии и
 * четырнадцать для хаоса дают разный результат, и брать один диапазон на всех неверно.
 */
export const FAMILY_HINTS: Readonly<Record<FamilyId, FamilyHint>> = {
  'symmetry-pmm': { cols: [6, 12], rows: [6, 14], palette: [2, 4], squareCells: false, mirrorWidths: true },
  'symmetry-p4m': { cols: [6, 12], rows: [6, 12], palette: [2, 4], squareCells: true, mirrorWidths: true },
  'symmetry-p2': { cols: [6, 12], rows: [6, 14], palette: [2, 4], squareCells: false, mirrorWidths: false },
  stripes: { cols: [5, 12], rows: [5, 12], palette: [2, 4], squareCells: false, mirrorWidths: false },
  brick: { cols: [6, 12], rows: [6, 14], palette: [2, 3], squareCells: false, mirrorWidths: false },
  gradient: { cols: [6, 12], rows: [6, 12], palette: [3, 5], squareCells: false, mirrorWidths: true },
  chaos: { cols: [7, 14], rows: [7, 16], palette: [2, 4], squareCells: false, mirrorWidths: false },
  inlay: { cols: [5, 5], rows: [6, 12], palette: [3, 4], squareCells: false, mirrorWidths: true, fixedCols: 5 },
  // Угловые семейства: cols здесь - число наклонных колонок (не полос), rows - число прямых
  // поперечных рядов доски. Толщина колонки и величина угла считаются отдельно в angled.ts
  // (коридор 50-100 мм и 20-40 градусов из раздела 0.5 плана), clampGenome эти поля не знает.
  chevron: { cols: [6, 10], rows: [4, 8], palette: [2, 3], squareCells: false, mirrorWidths: false, angle: [20, 40] },
  diamond: { cols: [6, 10], rows: [4, 8], palette: [2, 3], squareCells: false, mirrorWidths: false, angle: [20, 40] },
  tumbling: { cols: [6, 9], rows: [4, 8], palette: [3, 3], squareCells: false, mirrorWidths: false, angle: [25, 35] },
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

export function isPermutation(order: readonly number[], length: number): boolean {
  if (order.length !== length) return false
  const seen = new Set<number>()
  for (const value of order) {
    if (!Number.isInteger(value) || value < 0 || value >= length) return false
    if (seen.has(value)) return false
    seen.add(value)
  }
  return true
}

/**
 * Починка порядка рядов после скрещивания. Ранжирование сохраняется: если родитель
 * поставил третий ряд первым, потомок тоже поставит его раньше остальных.
 */
export function repairOrder(order: readonly number[], length: number): number[] {
  const padded = Array.from({ length }, (_, i) => order[i] ?? i)
  return padded
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value || a.index - b.index)
    .map((entry, rank) => ({ index: entry.index, rank }))
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.rank)
}

/** Зеркалит список относительно центра: левая половина побеждает. */
export function mirrorArray(list: readonly number[]): number[] {
  const out = [...list]
  for (let i = 0; i < out.length; i += 1) {
    const source = out[Math.min(i, out.length - 1 - i)]
    if (source !== undefined) out[i] = source
  }
  return out
}

function fitRows(heights: readonly number[]): number[] {
  return fitWidths(heights, {
    min: MIN_ROW_MM,
    max: MAX_ROW_MM,
    minTotal: MIN_BOARD_SPAN_MM,
    maxTotal: MAX_BOARD_LENGTH_MM,
  })
}

/**
 * Единственная гарантия изготовимости во всём генераторе. После неё геном рендерится
 * в Design, который validate принимает без ошибок. Ничто ниже по течению не перепроверяет.
 */
export function clampGenome(genome: Genome): Genome {
  const hint = FAMILY_HINTS[genome.familyId] ?? FAMILY_HINTS.stripes
  const familyId = FAMILY_IDS.includes(genome.familyId) ? genome.familyId : 'stripes'

  const cellMm = roundHalf(Math.max(MIN_CELL_MM, Math.min(MAX_CELL_MM, Number.isFinite(genome.params.cellMm) ? genome.params.cellMm : 25)))
  let cols = hint.fixedCols ?? clampInt(genome.params.cols, hint.cols[0], hint.cols[1])
  let rows = clampInt(genome.params.rows, hint.rows[0], hint.rows[1])
  if (hint.squareCells) rows = cols

  // Ширины: сначала подгоняем длину списка, потом зеркалим, потом чиним под рейсмус.
  const rawWidths = Array.from({ length: cols }, (_, i) => genome.colWidthsMm[i] ?? cellMm)
  let colWidthsMm = fitWidths(hint.mirrorWidths ? mirrorArray(rawWidths) : rawWidths, {
    min: MIN_CELL_MM,
    max: MAX_CELL_MM,
    minTotal: MIN_BOARD_SPAN_MM,
    maxTotal: MAX_PANEL_WIDTH_MM,
  })
  // fitWidths имеет право отрезать хвост: приводим счётчик колонок к реальности.
  if (colWidthsMm.length !== cols) cols = colWidthsMm.length
  if (hint.mirrorWidths) colWidthsMm = mirrorArray(colWidthsMm)
  if (hint.squareCells) rows = cols

  const rawHeights = hint.squareCells
    ? [...colWidthsMm]
    : Array.from({ length: rows }, (_, i) => genome.rowHeightsMm[i] ?? cellMm)
  let rowHeightsMm = fitRows(rawHeights)
  if (rowHeightsMm.length !== rows) rows = rowHeightsMm.length
  if (hint.squareCells && rowHeightsMm.length !== colWidthsMm.length) {
    rowHeightsMm = [...colWidthsMm].slice(0, rows)
    rows = rowHeightsMm.length
    colWidthsMm = colWidthsMm.slice(0, rows)
    cols = colWidthsMm.length
  }

  const paletteSize = clampInt(genome.palette.length, Math.max(MIN_PALETTE, hint.palette[0]), Math.min(MAX_PALETTE, hint.palette[1]))
  const seed = Number.isFinite(genome.seed) ? Math.abs(Math.trunc(genome.seed)) >>> 0 : 0
  const palette = sanitisePalette(genome.palette, seed, paletteSize)

  const rowOrder = isPermutation(genome.rowOrder, rows) ? [...genome.rowOrder] : repairOrder(genome.rowOrder, rows)

  // Угол среза: без хинта у семейства зажимается в 0 (прямой рез), с хинтом - в его коридор,
  // и всегда дополнительно в MAX_SLICE_ANGLE_DEG движка, округление до половины градуса как
  // у остальных числовых полей генома.
  const angleRaw = Number.isFinite(genome.params.angleDeg) ? genome.params.angleDeg : 0
  const angleBoundLo = hint.angle ? Math.max(-MAX_SLICE_ANGLE_DEG, hint.angle[0]) : 0
  const angleBoundHi = hint.angle ? Math.min(MAX_SLICE_ANGLE_DEG, hint.angle[1]) : 0
  const angleDeg = hint.angle
    ? Math.round(Math.max(angleBoundLo, Math.min(angleBoundHi, Math.abs(angleRaw))) * 2) / 2
    : 0

  return {
    familyId,
    seed,
    palette,
    colWidthsMm,
    rowHeightsMm,
    rowOrder,
    params: {
      cols,
      rows,
      cellMm,
      density: clamp01(genome.params.density),
      jitter: clamp01(genome.params.jitter),
      angleDeg,
    },
  }
}

function jitteredWidths(count: number, cellMm: number, jitter: number, rng: Rng): number[] {
  // Дрожание не больше 40 процентов: дальше полосы перестают читаться как одна сетка.
  return Array.from({ length: count }, () => roundHalf(cellMm * (1 + (rng.next() * 2 - 1) * jitter * 0.4)))
}

export function randomGenome(familyId: FamilyId, seed: number): Genome {
  const hint = FAMILY_HINTS[familyId]
  const base = Math.abs(Math.trunc(seed)) >>> 0
  const shapeRng = makeRng(mixSeed(base, 0x11))
  const widthRng = makeRng(mixSeed(base, 0x12))
  const paletteRng = makeRng(mixSeed(base, 0x13))

  const cols = hint.fixedCols ?? clampInt(shapeRng.range(hint.cols[0], hint.cols[1] + 1), hint.cols[0], hint.cols[1])
  const rows = hint.squareCells ? cols : clampInt(shapeRng.range(hint.rows[0], hint.rows[1] + 1), hint.rows[0], hint.rows[1])
  const cellMm = roundHalf(shapeRng.range(18, 34))
  const jitter = shapeRng.next()
  const density = shapeRng.next()
  const paletteSize = clampInt(paletteRng.range(hint.palette[0], hint.palette[1] + 1), hint.palette[0], hint.palette[1])
  const angleRng = makeRng(mixSeed(base, 0x14))
  const angleDeg = hint.angle ? angleRng.range(hint.angle[0], hint.angle[1]) : 0

  return clampGenome({
    familyId,
    seed: base,
    palette: makePalette(paletteRng, paletteSize),
    colWidthsMm: jitteredWidths(cols, cellMm, jitter, widthRng),
    rowHeightsMm: jitteredWidths(rows, cellMm, jitter, widthRng),
    rowOrder: Array.from({ length: rows }, (_, i) => i),
    params: { cols, rows, cellMm, density, jitter, angleDeg },
  })
}

/** Стабильный ключ генома: React key, дедупликация в популяции, id документа. */
export function genomeKey(genome: Genome): string {
  const parts = [
    genome.familyId,
    genome.seed,
    genome.palette.join('.'),
    genome.colWidthsMm.join('.'),
    genome.rowHeightsMm.join('.'),
    genome.rowOrder.join('.'),
    genome.params.cols,
    genome.params.rows,
    genome.params.density.toFixed(3),
    genome.params.jitter.toFixed(3),
    genome.params.angleDeg.toFixed(1),
  ]
  return parts.join('/')
}
