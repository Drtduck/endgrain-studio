'use client'

import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { Cell, Design, PaintCost, PaintResult, Panel, PanelId, RowId, SpeciesId } from '@/lib/engine'
import {
  EngineError,
  MAX_SLICE_ANGLE_DEG,
  applyPaint,
  compile,
  elementExtentMm,
  isSliceRef,
  isStrip,
  splitPanel,
  usageCount,
  type PanelElement,
  type Row,
} from '@/lib/engine'
import { roundHalf } from '@/lib/designs/fit'
import { makeCheckerboard } from '@/lib/designs/samples'
import type { Population } from '@/lib/generators'
import type { Locale } from '@/lib/i18n'
import type { PixelGrid } from '@/lib/photo'
import type { UnitSystem } from '@/lib/units'
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  commit,
  commitValue,
  initHistory,
  redo as histRedo,
  resetHistory,
  undo as histUndo,
  type HistoryState,
} from './history'
import { nextRowId } from './ids'

export const DEFAULT_SPECIES_ID: SpeciesId = 'walnut'

export type StudioView = 'editor' | 'templates' | 'generate' | 'photo' | 'view3d' | 'projects' | 'books' | 'promo'

/** Полный список вкладок студии - источник истины для валидации `?tab=` в URL. */
export const STUDIO_VIEWS: readonly StudioView[] = [
  'editor',
  'templates',
  'generate',
  'photo',
  'view3d',
  'projects',
  'books',
  'promo',
]

export interface GeneratorUiState {
  readonly population: Population
  readonly favouriteIds: readonly string[]
}

/** Разобранная картинка живёт в памяти вкладки и никогда не уезжает в localStorage или в ссылку. */
export interface PhotoUiState {
  readonly grid: PixelGrid
  readonly fileName: string
  readonly colors: number
  readonly panels: number
}

export interface PendingFork {
  readonly cellId: string
  readonly speciesId: SpeciesId
  readonly next: Design
  readonly forkedPanelIds: readonly PanelId[]
  readonly cost: PaintCost
}

export interface StudioState {
  readonly history: HistoryState<Design>
  readonly locale: Locale
  readonly unit: UnitSystem
  readonly view: StudioView
  readonly activeSpeciesId: SpeciesId
  readonly selectedCellId: string | null
  readonly selectedPanelId: PanelId | null
  readonly selectedRowId: RowId | null
  /**
   * Индекс колонки (позиция полосы), выбранный кликом по номеру колонки под доской.
   * Одна колонка - это один и тот же индекс элемента сразу в нескольких панелях
   * (шахматка чередует панели по рядам), поэтому это индекс, а не id конкретной полосы.
   */
  readonly selectedStripIndex: number | null
  readonly hoveredCellId: string | null
  readonly pendingFork: PendingFork | null
  readonly generator: GeneratorUiState | null
  readonly photo: PhotoUiState | null
  /**
   * Ячейки, с которыми уже произошло хоть одно действие (клик, включая noop и разветвление).
   * Ключ - Cell.id (`${rowId}:${elementIndex}` или `${rowId}:${elementIndex}:${k}` для SliceRef),
   * поэтому набор сбрасывается вместе с документом: loadDesign/resetStudio дают ему заново пустой Set.
   */
  readonly touchedCellIds: ReadonlySet<string>
  /**
   * false только для свежего образца по умолчанию. Восстановление из localStorage/хэша
   * сбрасывает историю (undo/redo пустые), поэтому одного canUndo||canRedo недостаточно,
   * чтобы поймать «у пользователя уже есть реальная работа» - отсюда отдельный флаг.
   */
  readonly documentTouched: boolean

  setLocale(locale: Locale): void
  setUnit(unit: UnitSystem): void
  setView(view: StudioView): void
  setActiveSpecies(speciesId: SpeciesId): void
  selectCell(cellId: string | null): void
  hoverCell(cellId: string | null): void
  selectPanel(panelId: PanelId | null): void
  selectRow(rowId: RowId | null): void
  selectStrip(index: number | null): void
  setGenerator(next: GeneratorUiState): void
  setPhoto(next: PhotoUiState | null): void

  paintCell(cell: Cell): void
  confirmFork(): void
  cancelFork(): void
  markCellTouched(cellId: string): void

  setStripWidth(panelId: PanelId, elementIndex: number, widthMm: number): void
  setStripSpecies(panelId: PanelId, elementIndex: number, speciesId: SpeciesId): void
  addStrip(panelId: PanelId, atIndex: number): void
  /**
   * Добавляет полосу сразу во все панели, на которые ссылается хотя бы один ряд: это и есть
   * «Добавить полосу» для пользователя. Индекс клампится по каждой панели отдельно, поэтому
   * панели разной длины не рассинхронизируются и RAGGED_BOARD не возникает. `null` - добавить
   * в конец каждой панели.
   */
  addColumn(atIndex: number | null): void
  removeStrip(panelId: PanelId, elementIndex: number): void
  splitStripAt(panelId: PanelId, elementIndex: number, atMm: number): void
  moveStrip(panelId: PanelId, fromIndex: number, toIndex: number): void

  /** Угол вклеенного среза (SliceRef.angleDeg), градусов. Знак хранится как есть, без abs. */
  setSliceAngle(panelId: PanelId, elementIndex: number, angleDeg: number): void
  toggleSliceFlip(panelId: PanelId, elementIndex: number): void
  setSliceOffset(panelId: PanelId, elementIndex: number, offsetMm: number): void

  setRowThickness(rowId: RowId, thicknessMm: number): void
  setRowPanel(rowId: RowId, panelId: PanelId): void
  setRowTrim(rowId: RowId, trimMm: number): void
  toggleRowFlip(rowId: RowId): void
  toggleRowMirror(rowId: RowId): void
  addRow(afterRowId: RowId | null): void
  removeRow(rowId: RowId): void
  moveRow(fromIndex: number, toIndex: number): void

  setBoardWidthMm(mm: number): void
  setBoardLengthMm(mm: number): void
  setBoardThicknessMm(mm: number): void
  setKerfMm(mm: number): void
  setPlaningAllowanceMm(mm: number): void
  setPlanerWidthMm(mm: number): void
  setDesignName(name: string): void

  loadDesign(design: Design): void
  resetStudio(design?: Design): void
  undo(): void
  redo(): void
}

export type StudioStore = UseBoundStore<StoreApi<StudioState>>

export function selectDesign(s: StudioState): Design {
  return s.history.present
}
export function selectCanUndo(s: StudioState): boolean {
  return histCanUndo(s.history)
}
export function selectCanRedo(s: StudioState): boolean {
  return histCanRedo(s.history)
}
/** Есть ли реальная работа, которую жалко молча стереть выбором шаблона. */
export function selectIsDirty(s: StudioState): boolean {
  return s.documentTouched || histCanUndo(s.history) || histCanRedo(s.history)
}

const UI_DEFAULTS = {
  locale: 'ru' as Locale,
  unit: 'mm' as UnitSystem,
  view: 'editor' as StudioView,
  activeSpeciesId: DEFAULT_SPECIES_ID,
  selectedCellId: null,
  selectedPanelId: null,
  selectedRowId: null,
  selectedStripIndex: null,
  hoveredCellId: null,
  pendingFork: null,
  generator: null,
  photo: null,
  documentTouched: false,
  touchedCellIds: new Set<string>(),
}

const DEFAULT_STRIP_WIDTH_MM = 25
const DEFAULT_ROW_THICKNESS_MM = 30
const DEFAULT_ROW_TRIM_MM = 5

/** Перестановка внутри массива: возвращает false, если индексы вне диапазона или совпадают. */
function moveInPlace<T>(list: T[], from: number, to: number): boolean {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return false
  const [item] = list.splice(from, 1)
  if (item === undefined) return false
  list.splice(to, 0, item)
  return true
}

/** Иммутабельное добавление в набор тронутых ячеек: без изменений возвращает тот же Set. */
function withTouchedCell(touched: ReadonlySet<string>, cellId: string): ReadonlySet<string> {
  if (touched.has(cellId)) return touched
  const next = new Set(touched)
  next.add(cellId)
  return next
}

/** Порода полосы по индексу, если элемент существует и это Strip (не SliceRef). */
function stripSpeciesAt(panel: Panel, index: number): SpeciesId | undefined {
  const el = panel.elements[index]
  return el && isStrip(el) ? el.speciesId : undefined
}

export function createStudioStore(initialDesign: Design = makeCheckerboard()): StudioStore {
  return create<StudioState>((set, get) => {
    /** Единственная точка записи в документ: всё остальное ходит через неё, поэтому undo знает про каждую правку. */
    const edit = (recipe: (draft: import('immer').Draft<Design>) => void): void => {
      set((s) => ({ history: commit(s.history, recipe), documentTouched: true }))
    }
    /** Числовые поля защищены от NaN и Infinity: битое значение из инпута не должно попасть в документ. */
    const editNumber = (mm: number, recipe: (draft: import('immer').Draft<Design>, value: number) => void): void => {
      if (!Number.isFinite(mm)) return
      edit((d) => recipe(d, mm))
    }

    return {
      history: initHistory(initialDesign),
      ...UI_DEFAULTS,

      setLocale: (locale) => set({ locale }),
      setUnit: (unit) => set({ unit }),
      setView: (view) => set({ view }),
      setActiveSpecies: (activeSpeciesId) => set({ activeSpeciesId }),
      selectCell: (selectedCellId) => set({ selectedCellId }),
      hoverCell: (hoveredCellId) => set({ hoveredCellId }),
      selectPanel: (selectedPanelId) => set({ selectedPanelId }),
      selectRow: (selectedRowId) => set({ selectedRowId }),
      selectStrip: (selectedStripIndex) => set({ selectedStripIndex }),
      setGenerator: (generator) => set({ generator }),
      setPhoto: (photo) => set({ photo }),

      paintCell: (cell) => {
        const state = get()
        const design = state.history.present
        let result: PaintResult
        try {
          result = applyPaint(design, cell, state.activeSpeciesId)
        } catch (error) {
          // Клик по ячейке, за которой не стоит полоса (или по устаревшей модели после undo):
          // это не ошибка пользователя, просто нечего красить.
          if (error instanceof EngineError) return
          throw error
        }
        if (result.kind === 'noop') {
          // Кисть ничего не поменяла, но клик по ячейке был - подсветку «не тронуто» пора снять.
          set((s) => ({ touchedCellIds: withTouchedCell(s.touchedCellIds, cell.id) }))
          return
        }
        if (result.kind === 'inPlace') {
          set((s) => ({
            history: commitValue(s.history, result.design),
            selectedCellId: cell.id,
            pendingFork: null,
            documentTouched: true,
            touchedCellIds: withTouchedCell(s.touchedCellIds, cell.id),
          }))
          return
        }
        set((s) => ({
          pendingFork: {
            cellId: cell.id,
            speciesId: state.activeSpeciesId,
            next: result.design,
            forkedPanelIds: result.forkedPanelIds,
            cost: result.cost,
          },
          touchedCellIds: withTouchedCell(s.touchedCellIds, cell.id),
        }))
      },

      confirmFork: () => {
        const pending = get().pendingFork
        if (!pending) return
        set((s) => ({
          history: commitValue(s.history, pending.next),
          pendingFork: null,
          selectedCellId: pending.cellId,
          documentTouched: true,
          touchedCellIds: withTouchedCell(s.touchedCellIds, pending.cellId),
        }))
      },

      cancelFork: () => set({ pendingFork: null }),

      markCellTouched: (cellId) => set((s) => ({ touchedCellIds: withTouchedCell(s.touchedCellIds, cellId) })),

      setStripWidth: (panelId, elementIndex, widthMm) => {
        if (!Number.isFinite(widthMm) || widthMm <= 0) return
        edit((d) => {
          const el = d.panels.find((p) => p.id === panelId)?.elements[elementIndex]
          if (!el || el.kind !== 'strip') return
          el.widthMm = widthMm
        })
      },

      setStripSpecies: (panelId, elementIndex, speciesId) =>
        edit((d) => {
          const el = d.panels.find((p) => p.id === panelId)?.elements[elementIndex]
          if (!el || el.kind !== 'strip') return
          el.speciesId = speciesId
        }),

      addStrip: (panelId, atIndex) => {
        const speciesId = get().activeSpeciesId
        edit((d) => {
          const panel = d.panels.find((p) => p.id === panelId)
          if (!panel) return
          const index = Math.max(0, Math.min(atIndex, panel.elements.length))
          const left = panel.elements[index - 1] ?? panel.elements[index]
          const widthMm = left ? elementExtentMm(left) : DEFAULT_STRIP_WIDTH_MM
          const strip: PanelElement = { kind: 'strip', speciesId, widthMm }
          panel.elements.splice(index, 0, strip)
        })
      },

      addColumn: (atIndex) => {
        const speciesId = get().activeSpeciesId
        const design = get().history.present
        const usedPanelIds = new Set(design.panels.filter((p) => usageCount(design, p.id) > 0).map((p) => p.id))
        edit((d) => {
          for (const panel of d.panels) {
            if (!usedPanelIds.has(panel.id)) continue
            const index = atIndex === null ? panel.elements.length : Math.max(0, Math.min(atIndex, panel.elements.length))
            const left = panel.elements[index - 1] ?? panel.elements[index]
            const widthMm = left ? elementExtentMm(left) : DEFAULT_STRIP_WIDTH_MM
            // Продолжаем чередование пород: смотрим на предпредыдущую полосу, а не только на соседа
            // слева, иначе шахматка после вставки колонки ломает свой порядок.
            const continuedSpecies = stripSpeciesAt(panel, index - 2) ?? stripSpeciesAt(panel, index - 1)
            const strip: PanelElement = { kind: 'strip', speciesId: continuedSpecies ?? speciesId, widthMm }
            panel.elements.splice(index, 0, strip)
          }
        })
      },

      removeStrip: (panelId, elementIndex) =>
        edit((d) => {
          const panel = d.panels.find((p) => p.id === panelId)
          if (!panel || !panel.elements[elementIndex]) return
          panel.elements.splice(elementIndex, 1)
        }),

      splitStripAt: (panelId, elementIndex, atMm) => {
        if (!Number.isFinite(atMm)) return
        const design = get().history.present
        try {
          const next = splitPanel(design, panelId, elementIndex, atMm)
          set((s) => ({ history: commitValue(s.history, next), documentTouched: true }))
        } catch (error) {
          // SPLIT_OUT_OF_RANGE, PANEL_NOT_FOUND, ELEMENT_NOT_FOUND: неверный ввод, не авария.
          if (error instanceof EngineError) return
          throw error
        }
      },

      moveStrip: (panelId, fromIndex, toIndex) =>
        edit((d) => {
          const panel = d.panels.find((p) => p.id === panelId)
          if (!panel) return
          moveInPlace(panel.elements, fromIndex, toIndex)
        }),

      setSliceAngle: (panelId, elementIndex, angleDeg) => {
        if (!Number.isFinite(angleDeg)) return
        const clamped = Math.max(-MAX_SLICE_ANGLE_DEG, Math.min(MAX_SLICE_ANGLE_DEG, angleDeg))
        edit((d) => {
          const panel = d.panels.find((p) => p.id === panelId)
          const el = panel?.elements[elementIndex]
          if (!panel || !el || !isSliceRef(el)) return
          el.angleDeg = clamped
          // Сцепка колонок держится на offsetMm последующих SliceRef этой же панели (правило
          // base_{k+1} = base_k + t_k * tan(phi_k), см. lib/generators/angled.ts chevronColumns):
          // смена угла ОДНОЙ колонки без пересчёта хвоста цепочки рвёт линию V у соседей.
          let base = el.offsetMm + el.thicknessMm * Math.tan((el.angleDeg * Math.PI) / 180)
          for (let i = elementIndex + 1; i < panel.elements.length; i += 1) {
            const next = panel.elements[i]
            if (!next || !isSliceRef(next)) continue
            next.offsetMm = base
            base += next.thicknessMm * Math.tan((next.angleDeg * Math.PI) / 180)
          }
        })
      },

      toggleSliceFlip: (panelId, elementIndex) =>
        edit((d) => {
          const el = d.panels.find((p) => p.id === panelId)?.elements[elementIndex]
          if (!el || !isSliceRef(el)) return
          el.flip = !(el.flip ?? false)
        }),

      setSliceOffset: (panelId, elementIndex, offsetMm) => {
        if (!Number.isFinite(offsetMm)) return
        edit((d) => {
          const el = d.panels.find((p) => p.id === panelId)?.elements[elementIndex]
          if (!el || !isSliceRef(el)) return
          el.offsetMm = offsetMm
        })
      },

      setRowThickness: (rowId, thicknessMm) => {
        if (!Number.isFinite(thicknessMm) || thicknessMm <= 0) return
        edit((d) => {
          const row = d.rows.find((r) => r.id === rowId)
          if (!row) return
          row.thicknessMm = thicknessMm
        })
      },

      setRowPanel: (rowId, panelId) =>
        edit((d) => {
          const row = d.rows.find((r) => r.id === rowId)
          if (!row) return
          row.panelId = panelId
        }),

      setRowTrim: (rowId, trimMm) => {
        if (!Number.isFinite(trimMm) || trimMm < 0) return
        edit((d) => {
          const row = d.rows.find((r) => r.id === rowId)
          if (!row) return
          row.trimMm = trimMm
        })
      },

      toggleRowFlip: (rowId) =>
        edit((d) => {
          const row = d.rows.find((r) => r.id === rowId)
          if (!row) return
          row.flip = !row.flip
        }),

      toggleRowMirror: (rowId) =>
        edit((d) => {
          const row = d.rows.find((r) => r.id === rowId)
          if (!row) return
          row.mirror = !row.mirror
        }),

      addRow: (afterRowId) => {
        const design = get().history.present
        const id = nextRowId(design)
        edit((d) => {
          const index = afterRowId === null ? d.rows.length - 1 : d.rows.findIndex((r) => r.id === afterRowId)
          const template = d.rows[index] ?? d.rows.at(-1)
          if (template) {
            const clone: Row = { ...template, id }
            d.rows.splice(index + 1, 0, clone)
            return
          }
          const firstPanel = d.panels[0]
          if (!firstPanel) return
          const first: Row = {
            id,
            panelId: firstPanel.id,
            thicknessMm: DEFAULT_ROW_THICKNESS_MM,
            angleDeg: 0,
            flip: false,
            mirror: false,
            trimMm: DEFAULT_ROW_TRIM_MM,
          }
          d.rows.push(first)
        })
      },

      removeRow: (rowId) =>
        edit((d) => {
          const index = d.rows.findIndex((r) => r.id === rowId)
          if (index < 0) return
          d.rows.splice(index, 1)
        }),

      moveRow: (fromIndex, toIndex) => edit((d) => { moveInPlace(d.rows, fromIndex, toIndex) }),

      // Ширина/длина доски - выведенные величины (compile берёт их из полос/рядов), поэтому
      // правка целевого габарита масштабирует весь узор пропорционально: иначе поле было бы
      // мёртвой метаданной, не влияющей ни на что видимое.
      setBoardWidthMm: (mm) => {
        if (!Number.isFinite(mm) || mm <= 0) return
        const derivedWidth = compile(get().history.present).widthMm
        edit((d) => {
          if (derivedWidth > 0) {
            const factor = mm / derivedWidth
            for (const panel of d.panels) {
              for (const el of panel.elements) {
                if (el.kind === 'strip') el.widthMm = Math.max(0.5, roundHalf(el.widthMm * factor))
              }
            }
          }
          d.board.targetWidthMm = mm
        })
      },
      setBoardLengthMm: (mm) => {
        if (!Number.isFinite(mm) || mm <= 0) return
        const derivedLength = compile(get().history.present).lengthMm
        edit((d) => {
          if (derivedLength > 0) {
            const factor = mm / derivedLength
            for (const row of d.rows) {
              row.thicknessMm = Math.max(0.5, roundHalf(row.thicknessMm * factor))
            }
          }
          d.board.targetLengthMm = mm
        })
      },
      setBoardThicknessMm: (mm) => editNumber(mm, (d, v) => { d.board.thicknessMm = v }),
      setKerfMm: (mm) => editNumber(mm, (d, v) => { d.kerfMm = v }),
      setPlaningAllowanceMm: (mm) => editNumber(mm, (d, v) => { d.planingAllowanceMm = v }),
      setPlanerWidthMm: (mm) => editNumber(mm, (d, v) => { d.planerWidthMm = v }),
      // Своё имя перебивает ключ словаря при показе (см. designDisplayName), но сам ключ
      // остаётся в документе: стёртое поле возвращает исходное имя шаблона или генератора,
      // а не переименовывает проект в «Шахматку» навсегда.
      setDesignName: (name) =>
        edit((d) => {
          d.name = name
        }),

      loadDesign: (design) =>
        set((s) => ({
          history: resetHistory(s.history, design),
          pendingFork: null,
          selectedCellId: null,
          documentTouched: true,
          touchedCellIds: new Set(),
        })),
      // Сброс возвращает документ и выбор инструментов, но не язык и не единицы:
      // это настройки человека, а не состояние проекта.
      resetStudio: (design) =>
        set((s) => ({
          history: resetHistory(s.history, design ?? makeCheckerboard()),
          ...UI_DEFAULTS,
          locale: s.locale,
          unit: s.unit,
        })),
      undo: () => set((s) => ({ history: histUndo(s.history), pendingFork: null })),
      redo: () => set((s) => ({ history: histRedo(s.history), pendingFork: null })),
    }
  })
}

export const useStudio: StudioStore = createStudioStore()
