'use client'

import { create, type StoreApi, type UseBoundStore } from 'zustand'
import type { Cell, Design, PaintCost, PanelId, RowId, SpeciesId } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import type { Locale } from '@/lib/i18n'
import type { UnitSystem } from '@/lib/units'
import {
  canRedo as histCanRedo,
  canUndo as histCanUndo,
  commit,
  initHistory,
  redo as histRedo,
  resetHistory,
  undo as histUndo,
  type HistoryState,
} from './history'

export const DEFAULT_SPECIES_ID: SpeciesId = 'walnut'

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
  readonly activeSpeciesId: SpeciesId
  readonly selectedCellId: string | null
  readonly selectedPanelId: PanelId | null
  readonly selectedRowId: RowId | null
  readonly hoveredCellId: string | null
  readonly pendingFork: PendingFork | null

  setLocale(locale: Locale): void
  setUnit(unit: UnitSystem): void
  setActiveSpecies(speciesId: SpeciesId): void
  selectCell(cellId: string | null): void
  hoverCell(cellId: string | null): void
  selectPanel(panelId: PanelId | null): void
  selectRow(rowId: RowId | null): void

  paintCell(cell: Cell): void
  confirmFork(): void
  cancelFork(): void

  setStripWidth(panelId: PanelId, elementIndex: number, widthMm: number): void
  setStripSpecies(panelId: PanelId, elementIndex: number, speciesId: SpeciesId): void
  addStrip(panelId: PanelId, atIndex: number): void
  removeStrip(panelId: PanelId, elementIndex: number): void
  splitStripAt(panelId: PanelId, elementIndex: number, atMm: number): void
  moveStrip(panelId: PanelId, fromIndex: number, toIndex: number): void

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

const UI_DEFAULTS = {
  locale: 'ru' as Locale,
  unit: 'mm' as UnitSystem,
  activeSpeciesId: DEFAULT_SPECIES_ID,
  selectedCellId: null,
  selectedPanelId: null,
  selectedRowId: null,
  hoveredCellId: null,
  pendingFork: null,
}

export function createStudioStore(initialDesign: Design = makeCheckerboard()): StudioStore {
  return create<StudioState>((set) => {
    /** Единственная точка записи в документ: всё остальное ходит через неё, поэтому undo знает про каждую правку. */
    const edit = (recipe: (draft: import('immer').Draft<Design>) => void): void => {
      set((s) => ({ history: commit(s.history, recipe) }))
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
      setActiveSpecies: (activeSpeciesId) => set({ activeSpeciesId }),
      selectCell: (selectedCellId) => set({ selectedCellId }),
      hoverCell: (hoveredCellId) => set({ hoveredCellId }),
      selectPanel: (selectedPanelId) => set({ selectedPanelId }),
      selectRow: (selectedRowId) => set({ selectedRowId }),

      // Задача 3.
      paintCell: () => {},
      confirmFork: () => {},
      cancelFork: () => set({ pendingFork: null }),

      // Задача 4.
      setStripWidth: () => {},
      setStripSpecies: () => {},
      addStrip: () => {},
      removeStrip: () => {},
      splitStripAt: () => {},
      moveStrip: () => {},
      setRowThickness: () => {},
      setRowPanel: () => {},
      setRowTrim: () => {},
      toggleRowFlip: () => {},
      toggleRowMirror: () => {},
      addRow: () => {},
      removeRow: () => {},
      moveRow: () => {},

      setBoardWidthMm: (mm) => editNumber(mm, (d, v) => { d.board.targetWidthMm = v }),
      setBoardLengthMm: (mm) => editNumber(mm, (d, v) => { d.board.targetLengthMm = v }),
      setBoardThicknessMm: (mm) => editNumber(mm, (d, v) => { d.board.thicknessMm = v }),
      setKerfMm: (mm) => editNumber(mm, (d, v) => { d.kerfMm = v }),
      setPlaningAllowanceMm: (mm) => editNumber(mm, (d, v) => { d.planingAllowanceMm = v }),
      setPlanerWidthMm: (mm) => editNumber(mm, (d, v) => { d.planerWidthMm = v }),
      setDesignName: (name) => edit((d) => { d.name = name }),

      loadDesign: (design) =>
        set((s) => ({ history: resetHistory(s.history, design), pendingFork: null, selectedCellId: null })),
      resetStudio: (design) =>
        set((s) => ({ history: resetHistory(s.history, design ?? makeCheckerboard()), ...UI_DEFAULTS })),
      undo: () => set((s) => ({ history: histUndo(s.history), pendingFork: null })),
      redo: () => set((s) => ({ history: histRedo(s.history), pendingFork: null })),
    }
  })
}

export const useStudio: StudioStore = createStudioStore()
