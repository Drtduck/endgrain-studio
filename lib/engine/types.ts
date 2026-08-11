export const SCHEMA_VERSION = 1 as const

export type SpeciesId = string
export type PanelId = string
export type RowId = string

/** Полоса первой склейки. Толщина берётся из board.thicknessMm, длина выводится через panelLengthMm. */
export interface Strip {
  readonly kind: 'strip'
  readonly speciesId: SpeciesId
  readonly widthMm: number
}

/** Ссылка на другую панель: срез толщиной thicknessMm, вклеенный в текущую панель. */
export interface SliceRef {
  readonly kind: 'sliceRef'
  readonly panelId: PanelId
  readonly thicknessMm: number
  readonly angleDeg: number
  /** Сдвиг рисунка вложенной панели вдоль длины доски, мм. Даёт herringbone и tumbling blocks. */
  readonly offsetMm: number
}

export type PanelElement = Strip | SliceRef

export interface Panel {
  readonly id: PanelId
  readonly elements: readonly PanelElement[]
}

/** Поперечный срез панели, из которого собирается финальная доска. */
export interface Row {
  readonly id: RowId
  readonly panelId: PanelId
  readonly thicknessMm: number
  readonly angleDeg: number
  readonly flip: boolean
  readonly mirror: boolean
  readonly trimMm: number
}

export interface BoardSpec {
  readonly targetWidthMm: number
  readonly targetLengthMm: number
  readonly thicknessMm: number
}

export interface Design {
  readonly schemaVersion: typeof SCHEMA_VERSION
  readonly id: string
  readonly name: string
  /** Палитра проекта: id пород, доступных в редакторе. */
  readonly species: readonly SpeciesId[]
  readonly panels: readonly Panel[]
  readonly rows: readonly Row[]
  readonly board: BoardSpec
  readonly kerfMm: number
  readonly planingAllowanceMm: number
  readonly planerWidthMm: number
}

export interface CellOrigin {
  readonly rowId: RowId
  readonly panelId: PanelId
  readonly elementIndex: number
  readonly depth: 0 | 1
  readonly innerPanelId?: PanelId
  readonly innerElementIndex?: number
}

export interface Cell {
  readonly id: string
  readonly xMm: number
  readonly yMm: number
  readonly widthMm: number
  readonly heightMm: number
  readonly speciesId: SpeciesId
  readonly grain: 'end'
  readonly origin: CellOrigin
}

export interface BoardModel {
  readonly widthMm: number
  readonly lengthMm: number
  readonly thicknessMm: number
  readonly cells: readonly Cell[]
  readonly panelLengthsMm: Readonly<Record<PanelId, number>>
  readonly glueUpCount: number
  readonly cutCount: number
  /** true, если генерация ячеек была остановлена по бюджету MAX_CELLS: модель неполна. */
  readonly truncated: boolean
}

export type DiagnosticLevel = 'error' | 'warning' | 'info'

export type DiagnosticCode =
  | 'MIN_STRIP_WIDTH'
  | 'PLANER_WIDTH'
  | 'PLANING_ALLOWANCE'
  | 'DEPTH_LIMIT'
  | 'PANEL_NOT_FOUND'
  | 'EMPTY_PANEL'
  | 'DIMENSION_SANITY'
  | 'RAGGED_BOARD'
  | 'ANGLE_UNSUPPORTED'
  | 'SHRINKAGE_MISMATCH'
  | 'CELL_BUDGET'
  | 'UNKNOWN_SPECIES'

export interface DiagnosticTarget {
  readonly panelId?: PanelId
  readonly rowId?: RowId
  readonly elementIndex?: number
}

export interface Diagnostic {
  readonly code: DiagnosticCode
  readonly level: DiagnosticLevel
  /** Ключ строки в lib/i18n, всегда вида `diag.<CODE>`. */
  readonly messageKey: string
  readonly params: Readonly<Record<string, string | number>>
  readonly target?: DiagnosticTarget
}

/** Один срез, снимаемый с панели: либо ряд доски, либо SliceRef внутри другой панели. */
export interface PanelSlice {
  readonly thicknessMm: number
  readonly trimMm: number
  readonly angleDeg: number
  readonly consumer: { readonly kind: 'row'; readonly rowId: RowId } | { readonly kind: 'sliceRef'; readonly panelId: PanelId; readonly elementIndex: number }
}

export const MIN_STRIP_WIDTH_MM = 4
export const DEFAULT_PLANER_WIDTH_MM = 330
export const MIN_PLANING_ALLOWANCE_MM = 3
export const BOARD_MIN_MM = 50
export const BOARD_MAX_MM = 1200
export const THICKNESS_MIN_MM = 10
export const THICKNESS_MAX_MM = 80
export const SHRINKAGE_DELTA_PP = 1.5
export const MAX_CELLS = 4000
export const WARN_CELLS = 2000
export const GEOM_EPS_MM = 1e-6
