import { DEFAULT_PLANER_WIDTH_MM, SCHEMA_VERSION, type Design, type Panel, type Row, type SpeciesId, type Strip } from '@/lib/engine'
import { SPECIES } from '@/lib/species'

export const GRID_THICKNESS_MM = 40
export const GRID_KERF_MM = 3
export const GRID_TRIM_MM = 5
export const GRID_ALLOWANCE_MM = 3

/** Порядок справочника пород: палитра проекта печатается от светлого к тёмному, а не как повезло. */
const SPECIES_ORDER = new Map(SPECIES.map((s, index) => [s.id, index]))

export interface GridSpec {
  readonly id: string
  /** Имя сетки живёт ключом словаря: документ не должен носить строку на одном языке. */
  readonly nameKey: string
  readonly nameParams?: Readonly<Record<string, string>>
  /** Ширины колонок вдоль ширины доски, мм. Одни и те же для всех рядов, иначе доска выйдет рваной. */
  readonly colWidthsMm: readonly number[]
  /** Высоты рядов вдоль длины доски, мм: это толщина поперечного среза. */
  readonly rowHeightsMm: readonly number[]
  readonly at: (col: number, row: number) => SpeciesId
  readonly thicknessMm?: number
}

export function uniform(count: number, mm: number): number[] {
  return Array.from({ length: count }, () => mm)
}

/** Целочисленный хэш без состояния: узор со «случайностью» остаётся детерминированным. */
export function hash2(col: number, row: number, seed: number): number {
  let h = (seed ^ Math.imul(col, 374761393) ^ Math.imul(row, 668265263)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export function pick<T>(list: readonly T[], index: number): T {
  if (list.length === 0) throw new Error('pick вызван с пустым списком')
  const value = list[((index % list.length) + list.length) % list.length]
  if (value === undefined) throw new Error('pick не нашёл элемент')
  return value
}

/**
 * Сетка в документ: одинаковые ряды переиспользуют одну панель первой склейки.
 * Это не оптимизация ради красоты структуры, а честная стоимость узора:
 * счётчик склеек в шапке показывает ровно столько панелей, сколько придётся склеить.
 */
export function makeGridDesign(spec: GridSpec): Design {
  const panels: Panel[] = []
  const panelIdByKey = new Map<string, string>()
  const rows: Row[] = []

  spec.rowHeightsMm.forEach((heightMm, rowIndex) => {
    const elements: Strip[] = spec.colWidthsMm.map((widthMm, colIndex) => ({
      kind: 'strip',
      speciesId: spec.at(colIndex, rowIndex),
      widthMm,
    }))
    const key = elements.map((el) => `${el.speciesId}@${el.widthMm}`).join('|')
    let panelId = panelIdByKey.get(key)
    if (panelId === undefined) {
      panelId = `P${panels.length + 1}`
      panelIdByKey.set(key, panelId)
      panels.push({ id: panelId, elements })
    }
    rows.push({
      id: `r${rowIndex}`,
      panelId,
      thicknessMm: heightMm,
      angleDeg: 0,
      flip: false,
      mirror: false,
      trimMm: GRID_TRIM_MM,
    })
  })

  const used = new Set<SpeciesId>()
  for (const panel of panels) {
    for (const el of panel.elements) {
      if (el.kind === 'strip') used.add(el.speciesId)
    }
  }
  const species = [...used].sort((a, b) => (SPECIES_ORDER.get(a) ?? 0) - (SPECIES_ORDER.get(b) ?? 0))

  const sum = (list: readonly number[]): number => list.reduce((acc, value) => acc + value, 0)

  return {
    schemaVersion: SCHEMA_VERSION,
    id: spec.id,
    name: '',
    nameKey: spec.nameKey,
    ...(spec.nameParams ? { nameParams: spec.nameParams } : {}),
    species,
    panels,
    rows,
    board: {
      targetWidthMm: sum(spec.colWidthsMm),
      targetLengthMm: sum(spec.rowHeightsMm),
      thicknessMm: spec.thicknessMm ?? GRID_THICKNESS_MM,
    },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}
