# Phase 2: Interactive Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only phase-1 shell into a working editor: click a cell to paint it, edit panels, rows and board settings, undo/redo everything, see live diagnostics and the complexity meter, in millimetres or inches, in Russian or English, with the project saved to localStorage and shareable by link.

**Architecture:** One Zustand store owns the single mutable value in the app: the `Design`. Every mutation goes through immer `produceWithPatches`, so undo/redo is a stack of patch pairs (limit 100) and no reducer has to write an inverse by hand. Everything else stays derived: `design -> compile -> BoardModel -> {BoardSvg, calc, validate}` recomputed by a one-entry memo, exactly as in phase 1. The engine is not touched: paint and split still come from `applyPaint` / `splitPanel`, and the store only decides what to do with the `PaintResult`. UI components are dumb: they read selectors and call actions, they never compute geometry and they never hold design state.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Zustand 5, immer (patches), Tailwind CSS 4, shadcn/ui (`components/ui/*`), vitest + @testing-library/react, Playwright, pnpm, Vercel.

## Global Constraints

Copied verbatim from `CLAUDE.md` and carried over from the phase-1 plan. Every task's requirements implicitly include this section.

- Em dash U+2014 is forbidden everywhere: source code, comments, commit messages, UI strings, this plan. Use a hyphen, a colon or parentheses instead. Any occurrence is a defect.
- All user-facing text and all git commit messages are in Russian. Technical terms stay in English.
- All internal dimensions are stored in millimetres as floating point numbers. Inches are presentation only, converted in exactly one place (`lib/units.ts`).
- Domain vocabulary is fixed: the board is made of strips (first glue-up), crosscuts, and a final re-glue. Kerf and allowances are always accounted for.
- `lib/engine` must have zero imports outside itself and the TypeScript standard library. **Phase 2 does not modify a single file under `lib/engine/`.** This is a UI-layer phase. If an engine change looks necessary, stop and report instead of editing.
- Panel recursion depth is capped at 2. Depth 3 is rejected by `validate`, never silently compiled.
- Schema version at rest is `1`. `parseDesign` is the only reader used by web, CLI and OG route.
- No UI literals in components: every user-visible string goes through `t(locale, key)` with the key present in both `lib/i18n/ru.ts` and `lib/i18n/en.ts`.
- No feature flags in this phase. The editor is core UX and ships on by default. `lib/flags.ts` is not touched.
- Russian is the default locale (`'ru'`); the English dictionary must be updated in the same commit as every new key (the type `Record<keyof typeof ru, string>` makes `pnpm typecheck` fail otherwise).
- TypeScript is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. Array indexing yields `T | undefined` and must be narrowed, never asserted with `!`.
- Node >= 20.11, pnpm >= 9. CI runs Node 22.
- Every task ends with a commit. Small commits, Russian messages, conventional prefix (`feat:`, `test:`, `chore:`, `fix:`).

## Phase-1 API this plan builds on (verified against the shipped source, not memory)

```ts
// lib/engine/types.ts
export type SpeciesId = string; export type PanelId = string; export type RowId = string
export interface Strip { readonly kind: 'strip'; readonly speciesId: SpeciesId; readonly widthMm: number }
export interface SliceRef { readonly kind: 'sliceRef'; readonly panelId: PanelId; readonly thicknessMm: number; readonly angleDeg: number; readonly offsetMm: number }
export type PanelElement = Strip | SliceRef
export interface Panel { readonly id: PanelId; readonly elements: readonly PanelElement[] }
export interface Row { readonly id: RowId; readonly panelId: PanelId; readonly thicknessMm: number; readonly angleDeg: number; readonly flip: boolean; readonly mirror: boolean; readonly trimMm: number }
export interface BoardSpec { readonly targetWidthMm: number; readonly targetLengthMm: number; readonly thicknessMm: number }
export interface Design { readonly schemaVersion: 1; readonly id: string; readonly name: string; readonly species: readonly SpeciesId[]; readonly panels: readonly Panel[]; readonly rows: readonly Row[]; readonly board: BoardSpec; readonly kerfMm: number; readonly planingAllowanceMm: number; readonly planerWidthMm: number }
export interface CellOrigin { readonly rowId: RowId; readonly panelId: PanelId; readonly elementIndex: number; readonly depth: 0 | 1; readonly innerPanelId?: PanelId; readonly innerElementIndex?: number }
export interface Cell { readonly id: string; readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number; readonly speciesId: SpeciesId; readonly grain: 'end'; readonly origin: CellOrigin }
export interface BoardModel { readonly widthMm: number; readonly lengthMm: number; readonly thicknessMm: number; readonly cells: readonly Cell[]; readonly panelLengthsMm: Readonly<Record<PanelId, number>>; readonly glueUpCount: number; readonly cutCount: number; readonly truncated: boolean }
export interface Diagnostic { readonly code: DiagnosticCode; readonly level: 'error' | 'warning' | 'info'; readonly messageKey: string; readonly params: Readonly<Record<string, string | number>>; readonly target?: DiagnosticTarget }
export interface DiagnosticTarget { readonly panelId?: PanelId; readonly rowId?: RowId; readonly elementIndex?: number }
export const MIN_STRIP_WIDTH_MM = 4; export const DEFAULT_PLANER_WIDTH_MM = 330; export const BOARD_MIN_MM = 50; export const BOARD_MAX_MM = 1200; export const THICKNESS_MIN_MM = 10; export const THICKNESS_MAX_MM = 80

// lib/engine/index.ts (public surface)
export function compile(design: Design): BoardModel
export function validate(design: Design, opts?: ValidateOptions): Diagnostic[]
export interface ValidateOptions { readonly shrinkageByPct?: Readonly<Record<SpeciesId, number>>; readonly knownSpeciesIds?: readonly SpeciesId[] }
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean
export function applyPaint(design: Design, cell: Cell, speciesId: SpeciesId): PaintResult
export function splitPanel(design: Design, panelId: PanelId, elementIndex: number, atMm: number): Design
export interface PaintCost { readonly extraGlueUps: number; readonly extraCuts: number; readonly extraLumberMBySpecies: Readonly<Record<SpeciesId, number>> }
export type PaintResult =
  | { readonly kind: 'noop'; readonly design: Design }
  | { readonly kind: 'inPlace'; readonly design: Design }
  | { readonly kind: 'fork'; readonly design: Design; readonly forkedPanelIds: readonly PanelId[]; readonly cost: PaintCost }
export function isStrip(el: PanelElement): el is Strip
export function isSliceRef(el: PanelElement): el is SliceRef
export function elementExtentMm(el: PanelElement): number
export function panelWidthMm(panel: Panel): number
export function findPanel(design: Design, panelId: PanelId): Panel | undefined
export function getPanel(design: Design, panelId: PanelId): Panel
export function usageCount(design: Design, panelId: PanelId): number
export function nextPanelId(design: Design): PanelId
export function panelLengthMm(design: Design, panelId: PanelId): number
export class EngineError extends Error { readonly code: EngineErrorCode }

// lib/calc/index.ts
export function calcProject(design: Design, model: BoardModel): CalcResult
export interface CalcResult { readonly bySpecies: readonly LumberNeed[]; readonly totalBoardFeet: number; readonly totalCostUsd: number; readonly totalWeightKg: number; readonly finishedVolumeMm3: number; readonly rawVolumeMm3: number; readonly wastePct: number; readonly glueUpCount: number; readonly cutCount: number }

// lib/species/index.ts
export const SPECIES: readonly Species[]                       // 16 entries
export const SPECIES_BY_ID: ReadonlyMap<SpeciesId, Species>
export function speciesHex(id: SpeciesId): string
export function shrinkageMap(): Record<SpeciesId, number>
export interface Species { readonly id: SpeciesId; readonly nameRu: string; readonly nameEn: string; readonly hex: string; /* lab, densityKgM3, pricePerBoardFootUsd, shrinkage*, foodSafe */ }

// lib/i18n/index.ts
export type Locale = 'ru' | 'en'; export type MessageKey = keyof typeof ru
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string

// lib/units.ts
export const MM_PER_INCH = 25.4
export function mmToInch(mm: number): number
export function inchToMm(inch: number): number
export function formatMm(mm: number, unit: 'mm' | 'in', unitLabel: string, digits?: number): string

// lib/persist/index.ts
export const LS_CURRENT_KEY = 'endgrain.current.v1'
export function encodeDesignToHash(design: Design): string
export function decodeDesignFromHash(hash: string): Design
export function saveToLocalStorage(design: Design): void
export function loadFromLocalStorage(): Design | null
export function parseDesign(input: unknown): Design

// lib/designs/samples.ts
export function makeCheckerboard(opts?: CheckerboardOptions): Design    // cellMm=30, cols=8, rows=8, walnut/maple, panels 'A' and 'B', rows 'r0'..'r7'

// components/*
export function BoardSvg({ model, locale, maxPx }: { model: BoardModel; locale: Locale; maxPx?: number }): JSX.Element   // emits <rect data-cell={cell.id}>
export function ComplexityMeter({ locale, calc, diagnostics, unit, model }: { locale: Locale; calc: CalcResult; diagnostics: readonly Diagnostic[]; unit: 'mm' | 'in'; model: BoardModel }): JSX.Element
export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }): JSX.Element
```

Cell ids are `${row.id}:${elementIndex}` at depth 0 and `${row.id}:${elementIndex}:${k}` at depth 1. In `makeCheckerboard()` every panel is used by four rows, so **painting any cell of the sample always takes the fork path**. Tests and the e2e suite rely on this.

## File Structure

New:

- `lib/store/history.ts` - patch-based undo/redo over any immutable value. Pure, no React, no zustand.
- `lib/store/ids.ts` - `nextRowId` (the engine ships `nextPanelId` only).
- `lib/store/studio.ts` - the Zustand store: state shape, every action, exported selectors, `createStudioStore` factory plus the `useStudio` singleton.
- `lib/store/derived.ts` - one-entry memo `derive(design)` returning `{ model, calc, diagnostics }`, plus the `useDerived()` hook.
- `lib/store/persist.ts` - debounced localStorage writer, hash bootstrap, share URL builder, `useStudioPersistence()`.
- `components/BoardCanvas.tsx` - interactive wrapper around `BoardSvg` (pointer delegation on `data-cell`).
- `components/SpeciesPalette.tsx` - 16 swatches from `lib/species`.
- `components/ForkDialog.tsx` - fork confirmation with `PaintCost` breakdown.
- `components/NumberFieldMm.tsx` - unit-aware numeric input, mm in, mm out.
- `components/PanelInspector.tsx` - panels and their strips.
- `components/RowInspector.tsx` - rows.
- `components/BoardSettings.tsx` - board size, kerf, allowances, planer width, unit toggle, share link.
- `components/HistoryControls.tsx` - undo/redo buttons plus the keyboard shortcuts effect.
- `components/DiagnosticsPanel.tsx` - localized `Diagnostic[]`.
- `playwright.config.ts`, `e2e/editor.spec.ts`.

Modified:

- `lib/units.ts` - add `UnitSystem`, `mmToDisplay`, `displayToMm`, `unitStepMm`.
- `components/BoardSvg.tsx` - two optional presentational props (`highlightCellId`, `selectedCellId`). Still pure, still usable for OG and export.
- `components/StudioShell.tsx` - rewritten as the store-driven layout.
- `lib/i18n/ru.ts`, `lib/i18n/en.ts` - new keys, added by the task that first uses them.
- `package.json`, `.github/workflows/ci.yml`.

Untouched: everything under `lib/engine/`, `lib/calc/`, `lib/species/`, `lib/persist/`, `lib/designs/`, `lib/flags.ts`.

---

### Task 1: Patch history and dependencies

**Files:**
- Modify: `package.json` (dependencies)
- Create: `lib/store/history.ts`
- Create: `lib/store/ids.ts`
- Test: `lib/store/history.test.ts`, `lib/store/ids.test.ts`

**Interfaces:**
- Consumes: `Design`, `Row`, `RowId` from `@/lib/engine`.
- Produces:
```ts
export const HISTORY_LIMIT = 100
export interface HistoryStep { readonly patches: readonly Patch[]; readonly inverse: readonly Patch[] }
export interface HistoryState<T> { readonly present: T; readonly past: readonly HistoryStep[]; readonly future: readonly HistoryStep[] }
export function initHistory<T>(present: T): HistoryState<T>
export function commit<T>(state: HistoryState<T>, recipe: (draft: Draft<T>) => void): HistoryState<T>
export function commitValue<T extends object>(state: HistoryState<T>, next: T): HistoryState<T>
export function resetHistory<T>(state: HistoryState<T>, next: T): HistoryState<T>
export function undo<T>(state: HistoryState<T>): HistoryState<T>
export function redo<T>(state: HistoryState<T>): HistoryState<T>
export function canUndo(state: HistoryState<unknown>): boolean
export function canRedo(state: HistoryState<unknown>): boolean
export function nextRowId(design: Design): RowId
```

- [ ] **Step 1: Install the runtime dependencies**

```bash
pnpm add zustand immer
```

Expected: `package.json` gains `zustand` and `immer` under `dependencies`, `pnpm-lock.yaml` updates. Both are UI-layer dependencies; `lib/engine` must never import them.

- [ ] **Step 2: Write the failing history test**

Create `lib/store/history.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { baseDesign, type Design } from '@/lib/engine'
import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  commit,
  commitValue,
  initHistory,
  redo,
  resetHistory,
  undo,
} from './history'

const start = (): ReturnType<typeof initHistory<Design>> => initHistory(baseDesign())

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = start()
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
  })

  it('commits a recipe and undoes it back to the original value', () => {
    const h0 = start()
    const h1 = commit(h0, (d) => {
      d.board.thicknessMm = 55
    })
    expect(h1.present.board.thicknessMm).toBe(55)
    expect(h0.present.board.thicknessMm).toBe(40)
    const h2 = undo(h1)
    expect(h2.present.board.thicknessMm).toBe(40)
    expect(canRedo(h2)).toBe(true)
  })

  it('redoes an undone step', () => {
    const h = redo(undo(commit(start(), (d) => { d.kerfMm = 4 })))
    expect(h.present.kerfMm).toBe(4)
    expect(canRedo(h)).toBe(false)
  })

  it('ignores a recipe that changes nothing', () => {
    const h0 = start()
    const h1 = commit(h0, (d) => { d.kerfMm = 3 })
    expect(h1).toBe(h0)
    expect(canUndo(h1)).toBe(false)
  })

  it('drops the redo stack once a new edit lands', () => {
    const h = commit(undo(commit(start(), (d) => { d.kerfMm = 4 })), (d) => { d.kerfMm = 5 })
    expect(canRedo(h)).toBe(false)
    expect(h.present.kerfMm).toBe(5)
  })

  it('commits a whole replacement value and only records the changed keys', () => {
    const h0 = start()
    const next: Design = { ...h0.present, name: 'другое имя' }
    const h1 = commitValue(h0, next)
    expect(h1.present.name).toBe('другое имя')
    expect(h1.past.at(-1)?.patches.map((p) => p.path.join('.'))).toEqual(['name'])
    expect(undo(h1).present.name).toBe(h0.present.name)
  })

  it('keeps at most HISTORY_LIMIT steps and never loses the newest', () => {
    let h = start()
    for (let i = 1; i <= HISTORY_LIMIT + 20; i += 1) h = commit(h, (d) => { d.kerfMm = i })
    expect(h.past).toHaveLength(HISTORY_LIMIT)
    expect(h.present.kerfMm).toBe(HISTORY_LIMIT + 20)
  })

  it('resetHistory forgets the stacks', () => {
    const h = resetHistory(commit(start(), (d) => { d.kerfMm = 4 }), baseDesign())
    expect(canUndo(h)).toBe(false)
    expect(canRedo(h)).toBe(false)
    expect(h.present.kerfMm).toBe(3)
  })

  it('undo and redo on empty stacks return the same object', () => {
    const h = start()
    expect(undo(h)).toBe(h)
    expect(redo(h)).toBe(h)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/history.test.ts`
Expected: FAIL, `Failed to resolve import "./history"`.

- [ ] **Step 4: Implement `lib/store/history.ts`**

```ts
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'

// Патчи выключены в immer по умолчанию: без этого вызова produceWithPatches бросает.
enablePatches()

/** Потолок стека отмены из спеки: 100 шагов. */
export const HISTORY_LIMIT = 100

export interface HistoryStep {
  readonly patches: readonly Patch[]
  readonly inverse: readonly Patch[]
}

export interface HistoryState<T> {
  readonly present: T
  readonly past: readonly HistoryStep[]
  readonly future: readonly HistoryStep[]
}

export function initHistory<T>(present: T): HistoryState<T> {
  return { present, past: [], future: [] }
}

function pushStep<T>(state: HistoryState<T>, present: T, step: HistoryStep): HistoryState<T> {
  const past = [...state.past, step]
  return { present, past: past.slice(-HISTORY_LIMIT), future: [] }
}

export function commit<T>(state: HistoryState<T>, recipe: (draft: Draft<T>) => void): HistoryState<T> {
  const [present, patches, inverse] = produceWithPatches(state.present, recipe)
  if (patches.length === 0) return state
  return pushStep(state, present, { patches, inverse })
}

/**
 * Коммит готового значения, пришедшего из движка (applyPaint, splitPanel).
 * Присваивание идентичной ссылки immer не считает изменением, поэтому патчи
 * получаются только по реально изменившимся ключам корня.
 */
export function commitValue<T extends object>(state: HistoryState<T>, next: T): HistoryState<T> {
  return commit(state, (draft) => {
    Object.assign(draft, next)
  })
}

/** Загрузка другого документа: история предыдущего к нему неприменима. */
export function resetHistory<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  void state
  return initHistory(next)
}

export function undo<T>(state: HistoryState<T>): HistoryState<T> {
  const step = state.past.at(-1)
  if (!step) return state
  return {
    present: applyPatches(state.present, [...step.inverse]),
    past: state.past.slice(0, -1),
    future: [step, ...state.future],
  }
}

export function redo<T>(state: HistoryState<T>): HistoryState<T> {
  const step = state.future[0]
  if (!step) return state
  return {
    present: applyPatches(state.present, [...step.patches]),
    past: [...state.past, step].slice(-HISTORY_LIMIT),
    future: state.future.slice(1),
  }
}

export function canUndo(state: HistoryState<unknown>): boolean {
  return state.past.length > 0
}

export function canRedo(state: HistoryState<unknown>): boolean {
  return state.future.length > 0
}
```

- [ ] **Step 5: Run the history test again**

Run: `pnpm exec vitest run lib/store/history.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing id test**

Create `lib/store/ids.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { baseDesign } from '@/lib/engine'
import { nextRowId } from './ids'

describe('nextRowId', () => {
  it('returns an id that is not taken yet', () => {
    const design = baseDesign()
    const id = nextRowId(design)
    expect(design.rows.some((r) => r.id === id)).toBe(false)
  })

  it('skips ids already in use', () => {
    const design = baseDesign({
      rows: [
        { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'r3', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
      ],
    })
    expect(nextRowId(design)).toBe('r4')
  })

  it('works on a design without rows', () => {
    expect(nextRowId(baseDesign({ rows: [] }))).toBe('r1')
  })
})
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/ids.test.ts`
Expected: FAIL, `Failed to resolve import "./ids"`.

- [ ] **Step 8: Implement `lib/store/ids.ts`**

```ts
import type { Design, RowId } from '@/lib/engine'

/** Движок отдаёт nextPanelId, но не nextRowId: та же логика для рядов живёт здесь. */
export function nextRowId(design: Design): RowId {
  const taken = new Set(design.rows.map((r) => r.id))
  let n = design.rows.length + 1
  while (taken.has(`r${n}`)) n += 1
  return `r${n}`
}
```

- [ ] **Step 9: Run both tests and the typecheck**

Run: `pnpm exec vitest run lib/store && pnpm typecheck`
Expected: PASS, 11 tests, no type errors.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml lib/store/history.ts lib/store/history.test.ts lib/store/ids.ts lib/store/ids.test.ts
git commit -m "feat(store): история правок на патчах immer и генератор id рядов"
```

---

### Task 2: Studio store core, settings and undo/redo

**Files:**
- Create: `lib/store/studio.ts`
- Test: `lib/store/studio.test.ts`

**Interfaces:**
- Consumes: everything from Task 1 (`initHistory`, `commit`, `commitValue`, `resetHistory`, `undo`, `redo`, `canUndo`, `canRedo`, `HistoryState`), `Design`, `BoardSpec`, `Locale`, `makeCheckerboard`.
- Produces the full store contract used by every component task:

```ts
export type UnitSystem = 'mm' | 'in'          // re-exported from lib/units in Task 6
export const DEFAULT_SPECIES_ID: SpeciesId    // 'walnut'

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
export function createStudioStore(initialDesign?: Design): StudioStore
export const useStudio: StudioStore

export function selectDesign(s: StudioState): Design
export function selectCanUndo(s: StudioState): boolean
export function selectCanRedo(s: StudioState): boolean
```

Task 2 implements state, settings actions, selection actions, `loadDesign`, `resetStudio`, `undo`, `redo`. Tasks 3 and 4 fill in paint and structural actions. To keep the module compiling between tasks, Task 2 writes every method of the interface, with the paint and structural ones as one-line bodies that Task 3 and Task 4 replace.

- [ ] **Step 1: Write the failing store test**

Create `lib/store/studio.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { baseDesign } from '@/lib/engine'
import { createStudioStore, selectCanRedo, selectCanUndo, selectDesign } from './studio'

describe('studio store: settings, selection, history', () => {
  it('starts on the given design with Russian locale and millimetres', () => {
    const s = createStudioStore(baseDesign()).getState()
    expect(selectDesign(s).id).toBe('fixture')
    expect(s.locale).toBe('ru')
    expect(s.unit).toBe('mm')
    expect(s.activeSpeciesId).toBe('walnut')
    expect(selectCanUndo(s)).toBe(false)
  })

  it('changes locale and unit without touching the design history', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setLocale('en')
    store.getState().setUnit('in')
    expect(store.getState().locale).toBe('en')
    expect(store.getState().unit).toBe('in')
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('edits board settings and records one undo step each', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setBoardThicknessMm(50)
    store.getState().setKerfMm(4)
    expect(selectDesign(store.getState()).board.thicknessMm).toBe(50)
    expect(selectDesign(store.getState()).kerfMm).toBe(4)
    store.getState().undo()
    expect(selectDesign(store.getState()).kerfMm).toBe(3)
    expect(selectDesign(store.getState()).board.thicknessMm).toBe(50)
    store.getState().undo()
    expect(selectDesign(store.getState()).board.thicknessMm).toBe(40)
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(selectCanRedo(store.getState())).toBe(true)
    store.getState().redo()
    expect(selectDesign(store.getState()).board.thicknessMm).toBe(50)
  })

  it('ignores a non finite number instead of poisoning the design', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setKerfMm(Number.NaN)
    expect(selectDesign(store.getState()).kerfMm).toBe(3)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('sets every remaining board field', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setBoardWidthMm(300)
    store.getState().setBoardLengthMm(400)
    store.getState().setPlaningAllowanceMm(4)
    store.getState().setPlanerWidthMm(250)
    store.getState().setDesignName('Доска для мамы')
    const d = selectDesign(store.getState())
    expect(d.board.targetWidthMm).toBe(300)
    expect(d.board.targetLengthMm).toBe(400)
    expect(d.planingAllowanceMm).toBe(4)
    expect(d.planerWidthMm).toBe(250)
    expect(d.name).toBe('Доска для мамы')
  })

  it('keeps selection out of the undo history', () => {
    const store = createStudioStore(baseDesign())
    store.getState().selectCell('r1:0')
    store.getState().hoverCell('r1:1')
    store.getState().selectPanel('A')
    store.getState().selectRow('r1')
    expect(store.getState().selectedCellId).toBe('r1:0')
    expect(store.getState().hoveredCellId).toBe('r1:1')
    expect(store.getState().selectedPanelId).toBe('A')
    expect(store.getState().selectedRowId).toBe('r1')
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('loadDesign swaps the document and forgets the history', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setKerfMm(5)
    store.getState().loadDesign(baseDesign({ id: 'другой', name: 'другой' }))
    expect(selectDesign(store.getState()).id).toBe('другой')
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(selectCanRedo(store.getState())).toBe(false)
  })

  it('resetStudio returns locale, unit and selection to defaults', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setLocale('en')
    store.getState().setUnit('in')
    store.getState().setActiveSpecies('padauk')
    store.getState().selectCell('r1:0')
    store.getState().resetStudio(baseDesign())
    const s = store.getState()
    expect(s.locale).toBe('ru')
    expect(s.unit).toBe('mm')
    expect(s.activeSpeciesId).toBe('walnut')
    expect(s.selectedCellId).toBe(null)
    expect(s.pendingFork).toBe(null)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/studio.test.ts`
Expected: FAIL, `Failed to resolve import "./studio"`.

- [ ] **Step 3: Implement `lib/store/studio.ts`**

The structural and paint bodies are deliberately empty here; Task 3 and Task 4 replace them and their tests are written there.

```ts
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
  return create<StudioState>((set, get) => {
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

      get _unused() {
        return get
      },
    } satisfies StudioState & { _unused: unknown }
  })
}

export const useStudio: StudioStore = createStudioStore()
```

Note on the `_unused` getter: `noUnusedParameters` rejects an unused `get`. Do **not** ship that hack. Instead drop `get` from the signature in Task 2 (`create<StudioState>((set) => ...)`) and add it back in Task 3 where it is genuinely needed. Write the file with `(set)` only and no `_unused` member, and no `satisfies` clause:

```ts
export function createStudioStore(initialDesign: Design = makeCheckerboard()): StudioStore {
  return create<StudioState>((set) => {
    // ... edit / editNumber as above ...
    return { /* ... same object, without _unused ... */ }
  })
}
```

- [ ] **Step 4: Run the store test**

Run: `pnpm exec vitest run lib/store/studio.test.ts`
Expected: PASS, 8 tests. `lib/units.ts` must already export `UnitSystem` for the import to resolve; if it does not yet, add exactly this line to `lib/units.ts` now and leave the rest of that file to Task 6:

```ts
export type UnitSystem = 'mm' | 'in'
```

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: no errors. If `noUnusedLocals` flags `get`, remove it from the callback signature.

- [ ] **Step 6: Commit**

```bash
git add lib/store/studio.ts lib/store/studio.test.ts lib/units.ts
git commit -m "feat(store): zustand-стор редактора, параметры доски, выделение и undo/redo"
```

---

### Task 3: Paint flow with fork confirmation

**Files:**
- Modify: `lib/store/studio.ts` (replace the `paintCell`, `confirmFork`, `cancelFork` bodies)
- Test: `lib/store/paint.test.ts`

**Interfaces:**
- Consumes: `applyPaint(design, cell, speciesId): PaintResult`, `EngineError`, `compile`, `PendingFork`, `commitValue`, `selectDesign`, `selectCanUndo`.
- Produces: the semantics every UI task relies on.
  - `paintCell(cell)`: `noop` leaves state untouched; `inPlace` commits immediately and selects the cell; `fork` commits nothing and parks a `PendingFork` for `ForkDialog`. An `EngineError` (cell whose origin is a `SliceRef`, not a strip) is swallowed: the click is a no-op, never a crash.
  - `confirmFork()`: commits `pendingFork.next` as one undo step and clears the dialog. No pending fork means no-op.
  - `cancelFork()`: clears the dialog, commits nothing.

- [ ] **Step 1: Write the failing paint test**

Create `lib/store/paint.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compile, type Cell, type Design } from '@/lib/engine'
import { baseDesign } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { createStudioStore, selectCanUndo, selectDesign } from './studio'

function cellById(design: Design, id: string): Cell {
  const cell = compile(design).cells.find((c) => c.id === id)
  if (!cell) throw new Error(`ячейка ${id} не найдена`)
  return cell
}

describe('studio store: покраска', () => {
  it('красит на месте, когда панель используется одним рядом', () => {
    // baseDesign: панель A используется только рядом r1, форк не нужен.
    const design = baseDesign()
    const store = createStudioStore(design)
    store.getState().paintCell(cellById(design, 'r1:0'))
    expect(selectDesign(store.getState()).panels[0]?.elements[0]).toMatchObject({ speciesId: 'walnut' })
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(selectDesign(store.getState()), 'r1:0'))
    expect(selectDesign(store.getState()).panels[0]?.elements[0]).toMatchObject({ speciesId: 'padauk' })
    expect(store.getState().pendingFork).toBe(null)
    expect(store.getState().selectedCellId).toBe('r1:0')
  })

  it('одна покраска на месте это один шаг отмены', () => {
    const design = baseDesign()
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r1:0'))
    store.getState().undo()
    expect(selectDesign(store.getState()).panels[0]?.elements[0]).toMatchObject({ speciesId: 'walnut' })
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('покраска той же породой ничего не делает', () => {
    const design = baseDesign()
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('walnut')
    store.getState().paintCell(cellById(design, 'r1:0'))
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(store.getState().pendingFork).toBe(null)
  })

  it('переиспользуемая панель не красится сразу, а открывает диалог с ценой', () => {
    const design = makeCheckerboard({ cols: 2, rows: 4 })
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r0:0'))
    const pending = store.getState().pendingFork
    expect(pending).not.toBe(null)
    expect(pending?.cellId).toBe('r0:0')
    expect(pending?.speciesId).toBe('padauk')
    expect(pending?.cost.extraGlueUps).toBeGreaterThan(0)
    expect(pending?.forkedPanelIds.length).toBeGreaterThan(0)
    // документ ещё не изменился
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(selectDesign(store.getState())).toBe(design)
  })

  it('подтверждение форка применяет документ одним шагом отмены', () => {
    const design = makeCheckerboard({ cols: 2, rows: 4 })
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r0:0'))
    store.getState().confirmFork()
    expect(store.getState().pendingFork).toBe(null)
    expect(selectDesign(store.getState()).panels.length).toBe(design.panels.length + 1)
    expect(compile(selectDesign(store.getState())).cells.find((c) => c.id === 'r0:0')?.speciesId).toBe('padauk')
    store.getState().undo()
    expect(selectDesign(store.getState()).panels.length).toBe(design.panels.length)
  })

  it('отмена форка не трогает документ', () => {
    const design = makeCheckerboard({ cols: 2, rows: 4 })
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    store.getState().paintCell(cellById(design, 'r0:0'))
    store.getState().cancelFork()
    expect(store.getState().pendingFork).toBe(null)
    expect(selectDesign(store.getState())).toBe(design)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('confirmFork без открытого диалога ничего не делает', () => {
    const store = createStudioStore(baseDesign())
    store.getState().confirmFork()
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('клик по ячейке с испорченным происхождением не роняет стор', () => {
    const design = baseDesign()
    const broken: Cell = {
      ...cellById(design, 'r1:0'),
      origin: { rowId: 'r1', panelId: 'A', elementIndex: 99, depth: 0 },
    }
    const store = createStudioStore(design)
    store.getState().setActiveSpecies('padauk')
    expect(() => store.getState().paintCell(broken)).not.toThrow()
    expect(selectCanUndo(store.getState())).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/paint.test.ts`
Expected: FAIL. The in-place test fails first with `expected undefined to match object { speciesId: 'padauk' }` because `paintCell` is still an empty function.

- [ ] **Step 3: Implement the paint actions in `lib/store/studio.ts`**

Add to the imports:

```ts
import { EngineError, applyPaint } from '@/lib/engine'
import { commitValue } from './history'
```

Change the store factory callback to take `get` as well (`create<StudioState>((set, get) => {`), then replace the three placeholder bodies:

```ts
      paintCell: (cell) => {
        const state = get()
        const design = state.history.present
        let result
        try {
          result = applyPaint(design, cell, state.activeSpeciesId)
        } catch (error) {
          // Клик по ячейке, за которой не стоит полоса (или по устаревшей модели после undo):
          // это не ошибка пользователя, просто нечего красить.
          if (error instanceof EngineError) return
          throw error
        }
        if (result.kind === 'noop') return
        if (result.kind === 'inPlace') {
          set((s) => ({
            history: commitValue(s.history, result.design),
            selectedCellId: cell.id,
            pendingFork: null,
          }))
          return
        }
        set({
          pendingFork: {
            cellId: cell.id,
            speciesId: state.activeSpeciesId,
            next: result.design,
            forkedPanelIds: result.forkedPanelIds,
            cost: result.cost,
          },
        })
      },

      confirmFork: () => {
        const pending = get().pendingFork
        if (!pending) return
        set((s) => ({
          history: commitValue(s.history, pending.next),
          pendingFork: null,
          selectedCellId: pending.cellId,
        }))
      },

      cancelFork: () => set({ pendingFork: null }),
```

TypeScript note: `result` is `PaintResult`, a discriminated union, so `result.forkedPanelIds` is only reachable after the two early returns. Do not annotate `result` with an explicit type; let inference narrow it. If `let result` without an initializer trips `strict`, declare it as `let result: PaintResult` and import the type.

- [ ] **Step 4: Run the paint test**

Run: `pnpm exec vitest run lib/store/paint.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 6: Commit**

```bash
git add lib/store/studio.ts lib/store/paint.test.ts
git commit -m "feat(store): покраска ячейки с подтверждением разветвления панели"
```

---

### Task 4: Panel and row editing actions

**Files:**
- Modify: `lib/store/studio.ts` (replace the twelve structural placeholders)
- Test: `lib/store/edit.test.ts`

**Interfaces:**
- Consumes: `splitPanel(design, panelId, elementIndex, atMm): Design`, `isStrip`, `elementExtentMm`, `EngineError`, `nextRowId` (Task 1), `commit`, `commitValue`.
- Produces the semantics used by `PanelInspector` and `RowInspector`:
  - `setStripWidth` and `setStripSpecies` are silent no-ops on a `SliceRef` element or an out-of-range index.
  - `addStrip(panelId, atIndex)` inserts a strip of `activeSpeciesId` at `atIndex`, taking its width from the element to its left, or 25 mm when the panel is empty.
  - `removeStrip` may empty a panel; `validate` reports `EMPTY_PANEL` and the UI stays alive (errors block nothing).
  - `splitStripAt` delegates to the engine and swallows `SPLIT_OUT_OF_RANGE`.
  - `moveStrip` / `moveRow` clamp out-of-range indices by doing nothing.
  - `addRow(afterRowId)` clones the named row (or the last one) with a fresh id from `nextRowId`; on an empty design it creates `{ panelId: first panel id, thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }` and does nothing at all if there are no panels.

- [ ] **Step 1: Write the failing edit test**

Create `lib/store/edit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { baseDesign, elementExtentMm, isStrip, type Design } from '@/lib/engine'
import { createStudioStore, selectCanUndo, selectDesign } from './studio'

const panelA = (d: Design) => d.panels.find((p) => p.id === 'A')

describe('studio store: панели', () => {
  it('меняет ширину полосы', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setStripWidth('A', 0, 40)
    expect(panelA(selectDesign(store.getState()))?.elements[0]).toMatchObject({ widthMm: 40 })
    store.getState().undo()
    expect(panelA(selectDesign(store.getState()))?.elements[0]).toMatchObject({ widthMm: 25 })
  })

  it('игнорирует несуществующий индекс и нечисловую ширину', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setStripWidth('A', 99, 40)
    store.getState().setStripWidth('A', 0, Number.NaN)
    store.getState().setStripWidth('нет', 0, 40)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('меняет породу полосы', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setStripSpecies('A', 1, 'padauk')
    expect(panelA(selectDesign(store.getState()))?.elements[1]).toMatchObject({ speciesId: 'padauk' })
  })

  it('добавляет полосу активной породы шириной соседа слева', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setActiveSpecies('padauk')
    store.getState().addStrip('A', 1)
    const els = panelA(selectDesign(store.getState()))?.elements ?? []
    expect(els).toHaveLength(3)
    expect(els[1]).toMatchObject({ kind: 'strip', speciesId: 'padauk', widthMm: 25 })
  })

  it('добавляет полосу шириной 25 мм в пустую панель', () => {
    const store = createStudioStore(baseDesign({ panels: [{ id: 'A', elements: [] }], rows: [] }))
    store.getState().addStrip('A', 0)
    expect(panelA(selectDesign(store.getState()))?.elements[0]).toMatchObject({ widthMm: 25 })
  })

  it('удаляет полосу и допускает пустую панель', () => {
    const store = createStudioStore(baseDesign())
    store.getState().removeStrip('A', 0)
    store.getState().removeStrip('A', 0)
    expect(panelA(selectDesign(store.getState()))?.elements).toHaveLength(0)
  })

  it('разрезает полосу на две по миллиметрам', () => {
    const store = createStudioStore(baseDesign())
    store.getState().splitStripAt('A', 0, 10)
    const els = panelA(selectDesign(store.getState()))?.elements ?? []
    expect(els).toHaveLength(3)
    expect(els[0] && isStrip(els[0]) ? els[0].widthMm : 0).toBe(10)
    expect(els[1] && isStrip(els[1]) ? els[1].widthMm : 0).toBe(15)
  })

  it('не разрезает за пределами полосы', () => {
    const store = createStudioStore(baseDesign())
    store.getState().splitStripAt('A', 0, 999)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('переставляет полосы местами', () => {
    const store = createStudioStore(baseDesign())
    const before = panelA(selectDesign(store.getState()))?.elements.map((e) => (isStrip(e) ? e.speciesId : '?'))
    store.getState().moveStrip('A', 0, 1)
    const after = panelA(selectDesign(store.getState()))?.elements.map((e) => (isStrip(e) ? e.speciesId : '?'))
    expect(after).toEqual([...(before ?? [])].reverse())
  })

  it('не переставляет по неверному индексу', () => {
    const store = createStudioStore(baseDesign())
    store.getState().moveStrip('A', 0, 7)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('сумма ширин панели сохраняется при разрезе', () => {
    const store = createStudioStore(baseDesign())
    const sum = (d: Design) => (panelA(d)?.elements ?? []).reduce((s, e) => s + elementExtentMm(e), 0)
    const before = sum(selectDesign(store.getState()))
    store.getState().splitStripAt('A', 0, 7)
    expect(sum(selectDesign(store.getState()))).toBeCloseTo(before, 6)
  })
})

describe('studio store: ряды', () => {
  it('меняет толщину, припуск и панель ряда', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setRowThickness('r1', 35)
    store.getState().setRowTrim('r1', 8)
    store.getState().setRowPanel('r1', 'B')
    const row = selectDesign(store.getState()).rows[0]
    expect(row).toMatchObject({ thicknessMm: 35, trimMm: 8, panelId: 'B' })
  })

  it('переключает flip и mirror', () => {
    const store = createStudioStore(baseDesign())
    store.getState().toggleRowFlip('r1')
    store.getState().toggleRowMirror('r1')
    expect(selectDesign(store.getState()).rows[0]).toMatchObject({ flip: true, mirror: true })
    store.getState().toggleRowFlip('r1')
    expect(selectDesign(store.getState()).rows[0]).toMatchObject({ flip: false, mirror: true })
  })

  it('добавляет ряд копией указанного и даёт ему свободный id', () => {
    const store = createStudioStore(baseDesign())
    store.getState().addRow('r1')
    const rows = selectDesign(store.getState()).rows
    expect(rows).toHaveLength(3)
    expect(rows[1]?.id).toBe('r3')
    expect(rows[1]?.panelId).toBe('A')
    expect(new Set(rows.map((r) => r.id)).size).toBe(3)
  })

  it('добавляет ряд в конец, когда ряд-образец не указан', () => {
    const store = createStudioStore(baseDesign())
    store.getState().addRow(null)
    const rows = selectDesign(store.getState()).rows
    expect(rows).toHaveLength(3)
    expect(rows[2]?.panelId).toBe('B')
  })

  it('создаёт первый ряд на первой панели, когда рядов нет', () => {
    const store = createStudioStore(baseDesign({ rows: [] }))
    store.getState().addRow(null)
    expect(selectDesign(store.getState()).rows[0]).toMatchObject({
      id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5,
    })
  })

  it('не создаёт ряд, когда в проекте нет панелей', () => {
    const store = createStudioStore(baseDesign({ panels: [], rows: [] }))
    store.getState().addRow(null)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('удаляет ряд', () => {
    const store = createStudioStore(baseDesign())
    store.getState().removeRow('r1')
    expect(selectDesign(store.getState()).rows.map((r) => r.id)).toEqual(['r2'])
  })

  it('переставляет ряды местами', () => {
    const store = createStudioStore(baseDesign())
    store.getState().moveRow(0, 1)
    expect(selectDesign(store.getState()).rows.map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('игнорирует неизвестный ряд', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setRowThickness('нет', 35)
    store.getState().toggleRowFlip('нет')
    store.getState().removeRow('нет')
    expect(selectCanUndo(store.getState())).toBe(false)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/edit.test.ts`
Expected: FAIL, first assertion `expected { widthMm: 25 } to match object { widthMm: 40 }`.

- [ ] **Step 3: Implement the structural actions in `lib/store/studio.ts`**

Add to the imports:

```ts
import { EngineError, applyPaint, elementExtentMm, isStrip, splitPanel, type Panel, type PanelElement, type Row } from '@/lib/engine'
import { nextRowId } from './ids'
```

Add these two module-level helpers above `createStudioStore` (pure, no store access, so they stay easy to read):

```ts
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
```

Replace the twelve placeholders with:

```ts
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
          set((s) => ({ history: commitValue(s.history, next) }))
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
```

Type note: inside a recipe the draft type is `Draft<Design>`, where `readonly` is stripped recursively, so `panel.elements.splice`, `el.widthMm = ...` and `row.flip = !row.flip` all typecheck. `Panel` is imported only if you annotate locals; if `noUnusedLocals` complains about the `Panel` import, drop it.

- [ ] **Step 4: Run the edit test**

Run: `pnpm exec vitest run lib/store/edit.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 5: Full suite, typecheck, lint**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: everything green.

- [ ] **Step 6: Commit**

```bash
git add lib/store/studio.ts lib/store/edit.test.ts
git commit -m "feat(store): правка полос и рядов, разрез, перестановка, добавление и удаление"
```

---

### Task 5: Derived model memo and persistence bridge

**Files:**
- Create: `lib/store/derived.ts`
- Create: `lib/store/persist.ts`
- Test: `lib/store/derived.test.ts`, `lib/store/persist.test.ts`

**Interfaces:**
- Consumes: `compile`, `validate`, `calcProject`, `SPECIES`, `shrinkageMap`, `encodeDesignToHash`, `decodeDesignFromHash`, `saveToLocalStorage`, `loadFromLocalStorage`, `makeCheckerboard`, `useStudio`, `selectDesign`.
- Produces:
```ts
// lib/store/derived.ts
export interface Derived { readonly model: BoardModel; readonly calc: CalcResult; readonly diagnostics: readonly Diagnostic[] }
export function derive(design: Design): Derived      // one-entry memo keyed on design identity
export function useDerived(): Derived

// lib/store/persist.ts
export const SAVE_DEBOUNCE_MS = 2000
export interface DebouncedSaver { push(design: Design): void; flush(): void; cancel(): void }
export function makeDebouncedSaver(save: (design: Design) => void, delayMs?: number): DebouncedSaver
export function readInitialDesign(hash: string): Design | null
export function shareUrl(href: string, design: Design): string
export function useStudioPersistence(): void
```

`readInitialDesign` returns the design encoded in the location hash, else the localStorage document, else `null` (the caller keeps the store's default checkerboard). `shareUrl` takes the current `window.location.href`, strips any existing hash and appends the fresh one.

- [ ] **Step 1: Write the failing derived test**

Create `lib/store/derived.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { baseDesign } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { derive } from './derived'

describe('derive', () => {
  it('возвращает модель, расчёт и диагностику одним объектом', () => {
    const d = derive(makeCheckerboard({ cols: 2, rows: 2 }))
    expect(d.model.cells).toHaveLength(4)
    expect(d.calc.glueUpCount).toBe(d.model.glueUpCount)
    expect(Array.isArray(d.diagnostics)).toBe(true)
  })

  it('отдаёт тот же объект для того же документа', () => {
    const design = baseDesign()
    expect(derive(design)).toBe(derive(design))
  })

  it('пересчитывает при смене документа', () => {
    const a = derive(baseDesign())
    const b = derive(baseDesign({ board: { targetWidthMm: 50, targetLengthMm: 60, thicknessMm: 60 } }))
    expect(b).not.toBe(a)
    expect(b.model.thicknessMm).toBe(60)
  })

  it('помечает неизвестную породу, потому что справочник передан в validate', () => {
    const design = baseDesign({ panels: [{ id: 'A', elements: [{ kind: 'strip', speciesId: 'ктотакой', widthMm: 25 }] }] })
    expect(derive(design).diagnostics.some((x) => x.code === 'UNKNOWN_SPECIES')).toBe(true)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/derived.test.ts`
Expected: FAIL, `Failed to resolve import "./derived"`.

- [ ] **Step 3: Implement `lib/store/derived.ts`**

```ts
'use client'

import { calcProject, type CalcResult } from '@/lib/calc'
import { compile, validate, type BoardModel, type Design, type Diagnostic } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { selectDesign, useStudio } from './studio'

export interface Derived {
  readonly model: BoardModel
  readonly calc: CalcResult
  readonly diagnostics: readonly Diagnostic[]
}

const KNOWN_SPECIES_IDS = SPECIES.map((s) => s.id)
const SHRINKAGE = shrinkageMap()

// Кэш на одну запись: документ иммутабельный, поэтому сравнение по ссылке точное и дешёвое.
// Без него compile и validate считались бы в каждом компоненте отдельно.
let cachedDesign: Design | null = null
let cachedResult: Derived | null = null

export function derive(design: Design): Derived {
  if (cachedDesign === design && cachedResult) return cachedResult
  const model = compile(design)
  const result: Derived = {
    model,
    calc: calcProject(design, model),
    diagnostics: validate(design, { shrinkageByPct: SHRINKAGE, knownSpeciesIds: KNOWN_SPECIES_IDS }),
  }
  cachedDesign = design
  cachedResult = result
  return result
}

export function useDerived(): Derived {
  return derive(useStudio(selectDesign))
}
```

- [ ] **Step 4: Run the derived test**

Run: `pnpm exec vitest run lib/store/derived.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the failing persistence test**

Create `lib/store/persist.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { baseDesign } from '@/lib/engine'
import { LS_CURRENT_KEY, encodeDesignToHash, serializeDesign } from '@/lib/persist'
import { makeDebouncedSaver, readInitialDesign, shareUrl, SAVE_DEBOUNCE_MS } from './persist'

describe('makeDebouncedSaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('пишет один раз на серию правок', () => {
    const save = vi.fn()
    const saver = makeDebouncedSaver(save)
    saver.push(baseDesign())
    saver.push(baseDesign({ kerfMm: 4 }))
    saver.push(baseDesign({ kerfMm: 5 }))
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0]).toMatchObject({ kerfMm: 5 })
  })

  it('flush пишет немедленно и снимает таймер', () => {
    const save = vi.fn()
    const saver = makeDebouncedSaver(save)
    saver.push(baseDesign())
    saver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('cancel отменяет запись', () => {
    const save = vi.fn()
    const saver = makeDebouncedSaver(save)
    saver.push(baseDesign())
    saver.cancel()
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('readInitialDesign', () => {
  beforeEach(() => window.localStorage.clear())

  it('читает документ из хэша ссылки', () => {
    const design = baseDesign({ name: 'из ссылки' })
    window.location.hash = encodeDesignToHash(design)
    expect(readInitialDesign(window.location.hash)?.name).toBe('из ссылки')
    window.location.hash = ''
  })

  it('падает обратно на localStorage, когда хэша нет', () => {
    window.localStorage.setItem(LS_CURRENT_KEY, serializeDesign(baseDesign({ name: 'из хранилища' })))
    expect(readInitialDesign('')?.name).toBe('из хранилища')
  })

  it('возвращает null на битом хэше и пустом хранилище', () => {
    expect(readInitialDesign('#этонекодек')).toBe(null)
  })
})

describe('shareUrl', () => {
  it('заменяет старый хэш новым', () => {
    const url = shareUrl('https://endgrain.example/studio#старое', baseDesign())
    expect(url.startsWith('https://endgrain.example/studio#')).toBe(true)
    expect(url.includes('старое')).toBe(false)
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/persist.test.ts`
Expected: FAIL, `Failed to resolve import "./persist"`.

- [ ] **Step 7: Implement `lib/store/persist.ts`**

```ts
'use client'

import { useEffect } from 'react'
import type { Design } from '@/lib/engine'
import {
  decodeDesignFromHash,
  encodeDesignToHash,
  loadFromLocalStorage,
  saveToLocalStorage,
} from '@/lib/persist'
import { selectDesign, useStudio } from './studio'

/** Автосохранение раз в две секунды после последней правки, как в спеке. */
export const SAVE_DEBOUNCE_MS = 2000

export interface DebouncedSaver {
  push(design: Design): void
  flush(): void
  cancel(): void
}

export function makeDebouncedSaver(save: (design: Design) => void, delayMs: number = SAVE_DEBOUNCE_MS): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Design | null = null

  const clear = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  return {
    push(design) {
      pending = design
      clear()
      timer = setTimeout(() => {
        timer = null
        if (pending) save(pending)
        pending = null
      }, delayMs)
    },
    flush() {
      clear()
      if (pending) save(pending)
      pending = null
    },
    cancel() {
      clear()
      pending = null
    },
  }
}

/** Ссылка важнее автосохранения: человек прислал проект, его и открываем. */
export function readInitialDesign(hash: string): Design | null {
  const raw = hash.replace(/^#/, '')
  if (raw.length > 0) {
    try {
      return decodeDesignFromHash(raw)
    } catch {
      // Битая ссылка не должна стирать локальную работу: молча идём в localStorage.
    }
  }
  return loadFromLocalStorage()
}

export function shareUrl(href: string, design: Design): string {
  const base = href.split('#')[0] ?? href
  return `${base}#${encodeDesignToHash(design)}`
}

/**
 * Единственное место, где стор встречается с браузером: подъём документа при монтировании
 * (после гидратации, поэтому серверная и клиентская разметка совпадают) и автосохранение.
 */
export function useStudioPersistence(): void {
  useEffect(() => {
    const restored = readInitialDesign(window.location.hash)
    if (restored) useStudio.getState().loadDesign(restored)

    const saver = makeDebouncedSaver(saveToLocalStorage)
    const unsubscribe = useStudio.subscribe((state, prev) => {
      const design = selectDesign(state)
      if (design !== selectDesign(prev)) saver.push(design)
    })
    const onHide = (): void => saver.flush()
    window.addEventListener('pagehide', onHide)

    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', onHide)
      saver.flush()
    }
  }, [])
}
```

Note: `useStudio.subscribe` with two arguments is the zustand v5 default subscribe signature `(state, prevState)`. No `subscribeWithSelector` middleware is needed.

- [ ] **Step 8: Run the persistence test**

Run: `pnpm exec vitest run lib/store/persist.test.ts`
Expected: PASS, 7 tests. `serializeDesign` is already exported from `lib/persist`; if the import fails, check `lib/persist/index.ts` (it exports `serializeDesign`).

- [ ] **Step 9: Full suite, typecheck, lint**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 10: Commit**

```bash
git add lib/store/derived.ts lib/store/derived.test.ts lib/store/persist.ts lib/store/persist.test.ts
git commit -m "feat(store): мемоизация compile/calc/validate и автосохранение с восстановлением из ссылки"
```

---

### Task 6: Unit-aware number input

**Files:**
- Modify: `lib/units.ts`
- Modify: `lib/units.test.ts`
- Create: `components/NumberFieldMm.tsx`
- Test: `components/NumberFieldMm.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Consumes: `t`, `Locale`, `MessageKey`.
- Produces:
```ts
// lib/units.ts
export type UnitSystem = 'mm' | 'in'                       // already added in Task 2
export function mmToDisplay(mm: number, unit: UnitSystem): string    // bare number, no unit label
export function displayToMm(text: string, unit: UnitSystem): number | null
export function unitStepMm(unit: UnitSystem): number

// components/NumberFieldMm.tsx
export function NumberFieldMm(props: {
  id: string
  labelKey: MessageKey
  valueMm: number
  unit: UnitSystem
  locale: Locale
  onCommitMm: (mm: number) => void
  minMm?: number
  maxMm?: number
  testId?: string
}): JSX.Element
```

`NumberFieldMm` is the only numeric input in the app. It keeps a local text draft so typing is not fought by re-renders, commits on blur and on Enter, reverts to the store value on Escape, and re-syncs its draft whenever `valueMm` or `unit` changes (that is how the unit toggle re-labels every field at once).

New i18n keys in this task: `units.title`, `aria.unitGroup`.

- [ ] **Step 1: Write the failing unit conversion test**

Append to `lib/units.test.ts`:

```ts
import { displayToMm, mmToDisplay, unitStepMm } from './units'

describe('представление размеров в полях ввода', () => {
  it('печатает миллиметры без хвостовых нулей', () => {
    expect(mmToDisplay(30, 'mm')).toBe('30')
    expect(mmToDisplay(30.5, 'mm')).toBe('30.5')
    expect(mmToDisplay(30.456, 'mm')).toBe('30.46')
  })

  it('печатает дюймы с тремя знаками', () => {
    expect(mmToDisplay(25.4, 'in')).toBe('1')
    expect(mmToDisplay(12.7, 'in')).toBe('0.5')
  })

  it('читает число в текущих единицах обратно в миллиметры', () => {
    expect(displayToMm('30', 'mm')).toBe(30)
    expect(displayToMm('1', 'in')).toBeCloseTo(25.4, 9)
    expect(displayToMm('1,5', 'in')).toBeCloseTo(38.1, 9)
  })

  it('возвращает null на нечисловом вводе', () => {
    expect(displayToMm('', 'mm')).toBe(null)
    expect(displayToMm('  ', 'mm')).toBe(null)
    expect(displayToMm('тридцать', 'mm')).toBe(null)
    expect(displayToMm('Infinity', 'mm')).toBe(null)
  })

  it('round-trip не теряет значение в пределах отображаемой точности', () => {
    for (const mm of [4, 25, 30.5, 330, 1200]) {
      expect(displayToMm(mmToDisplay(mm, 'mm'), 'mm')).toBeCloseTo(mm, 2)
      expect(displayToMm(mmToDisplay(mm, 'in'), 'in')).toBeCloseTo(mm, 1)
    }
  })

  it('шаг поля соответствует единицам', () => {
    expect(unitStepMm('mm')).toBe(1)
    expect(unitStepMm('in')).toBeCloseTo(25.4 / 16, 9)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/units.test.ts`
Expected: FAIL, `mmToDisplay is not a function`.

- [ ] **Step 3: Extend `lib/units.ts`**

Append (keep everything already in the file, including `formatMm`, untouched):

```ts
export type UnitSystem = 'mm' | 'in'

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/**
 * Значение для поля ввода: голое число без подписи единиц.
 * Миллиметры округляются до сотых, дюймы до тысячных: этого хватает
 * на 1/64 дюйма и не даёт полю дрожать при переключении единиц.
 */
export function mmToDisplay(mm: number, unit: UnitSystem): string {
  if (!Number.isFinite(mm)) return ''
  return unit === 'mm' ? trimZeros(mm.toFixed(2)) : trimZeros(mmToInch(mm).toFixed(3))
}

/** Разбор пользовательского ввода. Запятая как десятичный разделитель принимается. */
export function displayToMm(text: string, unit: UnitSystem): number | null {
  const normalized = text.trim().replace(',', '.')
  if (normalized === '') return null
  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return unit === 'mm' ? value : inchToMm(value)
}

/** Шаг стрелок в поле: 1 мм или 1/16 дюйма. */
export function unitStepMm(unit: UnitSystem): number {
  return unit === 'mm' ? 1 : MM_PER_INCH / 16
}
```

If Task 2 already added `export type UnitSystem = 'mm' | 'in'` to this file, do not add it twice.

- [ ] **Step 4: Run the units test**

Run: `pnpm exec vitest run lib/units.test.ts`
Expected: PASS, all existing tests plus 6 new ones.

- [ ] **Step 5: Add the two i18n keys**

In `lib/i18n/ru.ts`, inside the object:

```ts
  'units.title': 'Единицы',
  'aria.unitGroup': 'единицы измерения',
```

In `lib/i18n/en.ts`:

```ts
  'units.title': 'Units',
  'aria.unitGroup': 'measurement units',
```

- [ ] **Step 6: Write the failing component test**

Create `components/NumberFieldMm.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NumberFieldMm } from './NumberFieldMm'

const base = {
  id: 'kerf',
  labelKey: 'board.kerf' as const,
  unit: 'mm' as const,
  locale: 'ru' as const,
}

describe('NumberFieldMm', () => {
  it('показывает миллиметры и отдаёт миллиметры наружу', () => {
    const onCommitMm = vi.fn()
    render(<NumberFieldMm {...base} valueMm={30} onCommitMm={onCommitMm} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    expect(input.value).toBe('30')
    fireEvent.change(input, { target: { value: '42' } })
    fireEvent.blur(input)
    expect(onCommitMm).toHaveBeenCalledWith(42)
  })

  it('в дюймах показывает дюймы, а наружу отдаёт миллиметры', () => {
    const onCommitMm = vi.fn()
    render(<NumberFieldMm {...base} unit="in" valueMm={25.4} onCommitMm={onCommitMm} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    expect(input.value).toBe('1')
    fireEvent.change(input, { target: { value: '2' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommitMm.mock.calls[0]?.[0]).toBeCloseTo(50.8, 9)
  })

  it('не вызывает onCommitMm на мусорном вводе и возвращает прежнее значение', () => {
    const onCommitMm = vi.fn()
    render(<NumberFieldMm {...base} valueMm={30} onCommitMm={onCommitMm} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'ерунда' } })
    fireEvent.blur(input)
    expect(onCommitMm).not.toHaveBeenCalled()
    expect(input.value).toBe('30')
  })

  it('Escape откатывает черновик', () => {
    const onCommitMm = vi.fn()
    render(<NumberFieldMm {...base} valueMm={30} onCommitMm={onCommitMm} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('30')
    expect(onCommitMm).not.toHaveBeenCalled()
  })

  it('пересобирает черновик при смене единиц снаружи', () => {
    const { rerender } = render(<NumberFieldMm {...base} valueMm={25.4} onCommitMm={() => {}} />)
    const input = screen.getByLabelText('Толщина пропила') as HTMLInputElement
    expect(input.value).toBe('25.4')
    rerender(<NumberFieldMm {...base} unit="in" valueMm={25.4} onCommitMm={() => {}} />)
    expect(input.value).toBe('1')
  })

  it('переводит подпись', () => {
    render(<NumberFieldMm {...base} locale="en" valueMm={30} onCommitMm={() => {}} />)
    expect(screen.getByLabelText('Kerf')).toBeDefined()
  })
})
```

The label strings `board.kerf` / `Kerf` are added in Task 10; add just these two keys now so the test compiles, and Task 10 will add the rest of the `board.*` group:

`ru.ts`: `'board.kerf': 'Толщина пропила',`  `en.ts`: `'board.kerf': 'Kerf',`

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm exec vitest run components/NumberFieldMm.test.tsx`
Expected: FAIL, `Failed to resolve import "./NumberFieldMm"`.

- [ ] **Step 8: Implement `components/NumberFieldMm.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { displayToMm, mmToDisplay, unitStepMm, type UnitSystem } from '@/lib/units'

export function NumberFieldMm({
  id,
  labelKey,
  valueMm,
  unit,
  locale,
  onCommitMm,
  minMm,
  maxMm,
  testId,
}: {
  id: string
  labelKey: MessageKey
  valueMm: number
  unit: UnitSystem
  locale: Locale
  onCommitMm: (mm: number) => void
  minMm?: number
  maxMm?: number
  testId?: string
}) {
  const external = mmToDisplay(valueMm, unit)
  const [draft, setDraft] = useState(external)

  // Черновик живёт локально, чтобы курсор не прыгал при наборе, но обязан догонять
  // документ: undo, переключение единиц и загрузка из ссылки меняют значение снаружи.
  useEffect(() => setDraft(external), [external])

  const commit = (): void => {
    const mm = displayToMm(draft, unit)
    if (mm === null) {
      setDraft(external)
      return
    }
    const clamped = Math.min(maxMm ?? mm, Math.max(minMm ?? mm, mm))
    onCommitMm(clamped)
    setDraft(mmToDisplay(clamped, unit))
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {t(locale, labelKey)}
      </label>
      <input
        id={id}
        data-testid={testId ?? id}
        type="number"
        inputMode="decimal"
        step={unit === 'mm' ? unitStepMm(unit) : 0.0625}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') setDraft(external)
        }}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm tabular-nums shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  )
}
```

- [ ] **Step 9: Run the component test**

Run: `pnpm exec vitest run components/NumberFieldMm.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 10: Full suite, typecheck, lint**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: green. The i18n key-parity test in `lib/i18n/index.test.ts` guards ru/en drift.

- [ ] **Step 11: Commit**

```bash
git add lib/units.ts lib/units.test.ts components/NumberFieldMm.tsx components/NumberFieldMm.test.tsx lib/i18n/ru.ts lib/i18n/en.ts
git commit -m "feat(ui): поле ввода размеров с переключением мм и дюймов"
```

---

### Task 7: Interactive board, species palette, fork dialog

**Files:**
- Modify: `components/BoardSvg.tsx` (two optional presentational props)
- Modify: `components/BoardSvg.test.tsx` (cover the new props)
- Create: `components/BoardCanvas.tsx`
- Create: `components/SpeciesPalette.tsx`
- Create: `components/ForkDialog.tsx`
- Test: `components/BoardCanvas.test.tsx`, `components/SpeciesPalette.test.tsx`, `components/ForkDialog.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Consumes: `useStudio`, `selectDesign`, `useDerived`, `paintCell`, `confirmFork`, `cancelFork`, `setActiveSpecies`, `selectCell`, `hoverCell`, `PendingFork`, `SPECIES`, `SPECIES_BY_ID`, `speciesHex`, `PaintCost`, `Button`.
- Produces:
```ts
export function BoardSvg(props: { model: BoardModel; locale: Locale; maxPx?: number; highlightCellId?: string | null; selectedCellId?: string | null }): JSX.Element
export function BoardCanvas(): JSX.Element        // reads the store, no props
export function SpeciesPalette(): JSX.Element     // reads the store, no props
export function ForkDialog(): JSX.Element | null  // renders only while pendingFork is set
```

New i18n keys: `palette.title`, `palette.active`, `aria.palette`, `aria.boardCanvas`, `fork.title`, `fork.body`, `fork.glueUps`, `fork.cuts`, `fork.lumber`, `fork.confirm`, `fork.cancel`.

Interaction contract: clicks are delegated on the wrapper via `event.target.closest('[data-cell]')`, so `BoardSvg` stays a pure renderer usable by the future PNG, PDF and OG paths. `onPointerDown` covers mouse, pen and touch in one handler; `touch-action: manipulation` stops the double-tap zoom delay on phones.

- [ ] **Step 1: Write the failing BoardSvg highlight test**

Append to `components/BoardSvg.test.tsx`:

```tsx
  it('обводит наведённую и выбранную ячейку, не меняя заливку', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(
      <BoardSvg model={model} locale="ru" highlightCellId="r0:1" selectedCellId="r1:0" />,
    )
    const hovered = container.querySelector('rect[data-cell="r0:1"]')
    const selected = container.querySelector('rect[data-cell="r1:0"]')
    const plain = container.querySelector('rect[data-cell="r0:0"]')
    expect(hovered?.getAttribute('stroke')).toBe('#111111')
    expect(selected?.getAttribute('stroke')).toBe('#111111')
    expect(selected?.getAttribute('stroke-width')).toBe('1.6')
    expect(hovered?.getAttribute('stroke-width')).toBe('1')
    expect(plain?.getAttribute('stroke-width')).toBe('0.4')
    expect(hovered?.getAttribute('fill')).toBe('#e3caa1')
  })
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run components/BoardSvg.test.tsx`
Expected: FAIL, `expected "rgba(0,0,0,0.18)" to be "#111111"`.

- [ ] **Step 3: Extend `components/BoardSvg.tsx`**

```tsx
import type { BoardModel } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { speciesHex } from '@/lib/species'

export function BoardSvg({
  model,
  locale,
  maxPx = 640,
  highlightCellId = null,
  selectedCellId = null,
}: {
  model: BoardModel
  locale: Locale
  maxPx?: number
  highlightCellId?: string | null
  selectedCellId?: string | null
}) {
  if (model.widthMm <= 0 || model.lengthMm <= 0) return <svg role="img" aria-label={t(locale, 'aria.emptyBoard')} />

  const scale = maxPx / Math.max(model.widthMm, model.lengthMm)

  return (
    <svg
      viewBox={`0 0 ${model.widthMm} ${model.lengthMm}`}
      width={model.widthMm * scale}
      height={model.lengthMm * scale}
      role="img"
      aria-label={t(locale, 'aria.boardPreview')}
      className="max-w-full rounded-lg shadow-sm"
    >
      {model.cells.map((cell) => {
        const isSelected = cell.id === selectedCellId
        const isHighlighted = cell.id === highlightCellId
        return (
          <rect
            key={cell.id}
            data-cell={cell.id}
            x={cell.xMm}
            y={cell.yMm}
            width={cell.widthMm}
            height={cell.heightMm}
            fill={speciesHex(cell.speciesId)}
            stroke={isSelected || isHighlighted ? '#111111' : 'rgba(0,0,0,0.18)'}
            strokeWidth={isSelected ? 1.6 : isHighlighted ? 1 : 0.4}
          />
        )
      })}
    </svg>
  )
}
```

`exactOptionalPropertyTypes` note: the props are declared `string | null` with a default of `null`, not `string | undefined`, precisely so callers can pass the store value straight through.

- [ ] **Step 4: Run the BoardSvg test**

Run: `pnpm exec vitest run components/BoardSvg.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Add the i18n keys for this task**

`lib/i18n/ru.ts`:

```ts
  'palette.title': 'Породы',
  'palette.active': 'Выбрана: {name}',
  'aria.palette': 'выбор породы',
  'aria.boardCanvas': 'холст доски, клик красит ячейку выбранной породой',
  'fork.title': 'Панель придётся разветвить',
  'fork.body': 'Эта полоса идёт в несколько рядов. Чтобы покрасить только эту ячейку, панель будет склеена ещё раз.',
  'fork.glueUps': 'Дополнительных склеек: {count}',
  'fork.cuts': 'Дополнительных резов: {count}',
  'fork.lumber': '{name}: плюс {meters} м',
  'fork.confirm': 'Разветвить',
  'fork.cancel': 'Отмена',
```

`lib/i18n/en.ts`:

```ts
  'palette.title': 'Species',
  'palette.active': 'Selected: {name}',
  'aria.palette': 'species picker',
  'aria.boardCanvas': 'board canvas, click paints a cell with the selected species',
  'fork.title': 'This panel has to be forked',
  'fork.body': 'This strip is used by several rows. To paint only this cell the panel gets glued up a second time.',
  'fork.glueUps': 'Extra glue-ups: {count}',
  'fork.cuts': 'Extra cuts: {count}',
  'fork.lumber': '{name}: plus {meters} m',
  'fork.confirm': 'Fork',
  'fork.cancel': 'Cancel',
```

- [ ] **Step 6: Write the failing palette test**

Create `components/SpeciesPalette.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { SpeciesPalette } from './SpeciesPalette'

describe('SpeciesPalette', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('рисует все 16 пород справочника', () => {
    const { container } = render(<SpeciesPalette />)
    expect(container.querySelectorAll('[data-testid^="species-"]')).toHaveLength(16)
  })

  it('клик по образцу делает породу активной', () => {
    render(<SpeciesPalette />)
    fireEvent.click(screen.getByTestId('species-padauk'))
    expect(useStudio.getState().activeSpeciesId).toBe('padauk')
  })

  it('помечает активную породу через aria-pressed и показывает её имя на языке интерфейса', () => {
    const { rerender } = render(<SpeciesPalette />)
    expect(screen.getByTestId('species-walnut').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Выбрана: Орех')).toBeDefined()
    useStudio.getState().setLocale('en')
    rerender(<SpeciesPalette />)
    expect(screen.getByText('Selected: Black walnut')).toBeDefined()
  })
})
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm exec vitest run components/SpeciesPalette.test.tsx`
Expected: FAIL, `Failed to resolve import "./SpeciesPalette"`.

- [ ] **Step 8: Implement `components/SpeciesPalette.tsx`**

```tsx
'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t } from '@/lib/i18n'
import { SPECIES, SPECIES_BY_ID } from '@/lib/species'
import { useStudio } from '@/lib/store/studio'

export function SpeciesPalette() {
  const locale = useStudio((s) => s.locale)
  const activeSpeciesId = useStudio((s) => s.activeSpeciesId)
  const setActiveSpecies = useStudio((s) => s.setActiveSpecies)
  const active = SPECIES_BY_ID.get(activeSpeciesId)
  const nameOf = (nameRu: string, nameEn: string): string => (locale === 'ru' ? nameRu : nameEn)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'palette.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(locale, 'palette.active', { name: active ? nameOf(active.nameRu, active.nameEn) : activeSpeciesId })}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-8 gap-1.5" role="group" aria-label={t(locale, 'aria.palette')}>
          {SPECIES.map((species) => {
            const isActive = species.id === activeSpeciesId
            const title = nameOf(species.nameRu, species.nameEn)
            return (
              <button
                key={species.id}
                type="button"
                data-testid={`species-${species.id}`}
                aria-pressed={isActive}
                aria-label={title}
                title={title}
                onClick={() => setActiveSpecies(species.id)}
                style={{ backgroundColor: species.hex }}
                className={`h-8 w-full rounded-md border transition ${
                  isActive ? 'border-foreground ring-2 ring-foreground' : 'border-black/20 hover:border-foreground/60'
                }`}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 9: Run the palette test**

Run: `pnpm exec vitest run components/SpeciesPalette.test.tsx`
Expected: PASS, 3 tests.

- [ ] **Step 10: Write the failing canvas test**

Create `components/BoardCanvas.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { BoardCanvas } from './BoardCanvas'

describe('BoardCanvas', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('красит ячейку на месте, когда панель используется одним рядом', () => {
    const { container } = render(<BoardCanvas />)
    useStudio.getState().setActiveSpecies('padauk')
    const rect = container.querySelector('rect[data-cell="r1:0"]')
    expect(rect).not.toBe(null)
    fireEvent.pointerDown(rect as Element, { bubbles: true })
    expect(useStudio.getState().history.present.panels[0]?.elements[0]).toMatchObject({ speciesId: 'padauk' })
  })

  it('открывает подтверждение вместо покраски, когда панель переиспользуется', () => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 }))
    const { container } = render(<BoardCanvas />)
    useStudio.getState().setActiveSpecies('padauk')
    fireEvent.pointerDown(container.querySelector('rect[data-cell="r0:0"]') as Element, { bubbles: true })
    expect(useStudio.getState().pendingFork?.cellId).toBe('r0:0')
  })

  it('запоминает наведённую ячейку и забывает её при уходе курсора', () => {
    const { container } = render(<BoardCanvas />)
    const rect = container.querySelector('rect[data-cell="r1:1"]') as Element
    fireEvent.pointerOver(rect, { bubbles: true })
    expect(useStudio.getState().hoveredCellId).toBe('r1:1')
    fireEvent.pointerLeave(container.querySelector('[data-testid="board-canvas"]') as Element)
    expect(useStudio.getState().hoveredCellId).toBe(null)
  })

  it('клик мимо ячейки ничего не ломает', () => {
    const { container } = render(<BoardCanvas />)
    const wrapper = container.querySelector('[data-testid="board-canvas"]') as Element
    expect(() => fireEvent.pointerDown(wrapper, { bubbles: true })).not.toThrow()
    expect(useStudio.getState().pendingFork).toBe(null)
  })
})
```

- [ ] **Step 11: Run it and watch it fail**

Run: `pnpm exec vitest run components/BoardCanvas.test.tsx`
Expected: FAIL, `Failed to resolve import "./BoardCanvas"`.

- [ ] **Step 12: Implement `components/BoardCanvas.tsx`**

```tsx
'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'

/** Ищем ячейку по data-cell вверх по дереву: BoardSvg остаётся чистым рендерером без обработчиков. */
function cellIdOf(event: ReactPointerEvent<HTMLDivElement>): string | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  return target.closest('[data-cell]')?.getAttribute('data-cell') ?? null
}

export function BoardCanvas() {
  const locale = useStudio((s) => s.locale)
  const hoveredCellId = useStudio((s) => s.hoveredCellId)
  const selectedCellId = useStudio((s) => s.selectedCellId)
  const paintCell = useStudio((s) => s.paintCell)
  const hoverCell = useStudio((s) => s.hoverCell)
  const { model } = useDerived()

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const id = cellIdOf(event)
    if (id === null) return
    const cell = model.cells.find((c) => c.id === id)
    if (!cell) return
    paintCell(cell)
  }

  return (
    <div
      data-testid="board-canvas"
      role="application"
      aria-label={t(locale, 'aria.boardCanvas')}
      className="inline-block cursor-crosshair touch-manipulation select-none"
      onPointerDown={onPointerDown}
      onPointerOver={(event) => hoverCell(cellIdOf(event))}
      onPointerLeave={() => hoverCell(null)}
    >
      <BoardSvg model={model} locale={locale} highlightCellId={hoveredCellId} selectedCellId={selectedCellId} />
    </div>
  )
}
```

- [ ] **Step 13: Run the canvas test**

Run: `pnpm exec vitest run components/BoardCanvas.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 14: Write the failing fork dialog test**

Create `components/ForkDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { compile } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { ForkDialog } from './ForkDialog'

function openFork(): void {
  const design = makeCheckerboard({ cols: 2, rows: 4 })
  useStudio.getState().resetStudio(design)
  useStudio.getState().setActiveSpecies('padauk')
  const cell = compile(design).cells.find((c) => c.id === 'r0:0')
  if (!cell) throw new Error('ячейка r0:0 не найдена')
  useStudio.getState().paintCell(cell)
}

describe('ForkDialog', () => {
  beforeEach(() => useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 })))

  it('не рисуется, пока нет отложенного форка', () => {
    const { container } = render(<ForkDialog />)
    expect(container.querySelector('[role="dialog"]')).toBe(null)
  })

  it('показывает цену разветвления в склейках, резах и погонаже', () => {
    openFork()
    render(<ForkDialog />)
    expect(screen.getByRole('dialog')).toBeDefined()
    const cost = useStudio.getState().pendingFork?.cost
    expect(screen.getByTestId('fork-glueups').textContent).toContain(String(cost?.extraGlueUps))
    expect(screen.getByTestId('fork-cuts').textContent).toContain(String(cost?.extraCuts))
    expect(screen.getAllByTestId('fork-lumber').length).toBeGreaterThan(0)
  })

  it('подтверждение применяет правку и закрывает диалог', () => {
    openFork()
    render(<ForkDialog />)
    fireEvent.click(screen.getByTestId('fork-confirm'))
    expect(useStudio.getState().pendingFork).toBe(null)
    expect(compile(useStudio.getState().history.present).cells.find((c) => c.id === 'r0:0')?.speciesId).toBe('padauk')
  })

  it('отмена закрывает диалог, не трогая документ', () => {
    openFork()
    const before = useStudio.getState().history.present
    render(<ForkDialog />)
    fireEvent.click(screen.getByTestId('fork-cancel'))
    expect(useStudio.getState().pendingFork).toBe(null)
    expect(useStudio.getState().history.present).toBe(before)
  })

  it('Escape отменяет разветвление', () => {
    openFork()
    render(<ForkDialog />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useStudio.getState().pendingFork).toBe(null)
  })
})
```

- [ ] **Step 15: Run it and watch it fail**

Run: `pnpm exec vitest run components/ForkDialog.test.tsx`
Expected: FAIL, `Failed to resolve import "./ForkDialog"`.

- [ ] **Step 16: Implement `components/ForkDialog.tsx`**

A plain overlay is used on purpose: `components/ui` has no dialog primitive yet, and adding one is scope this phase does not need.

```tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { SPECIES_BY_ID } from '@/lib/species'
import { useStudio } from '@/lib/store/studio'

export function ForkDialog() {
  const locale = useStudio((s) => s.locale)
  const pendingFork = useStudio((s) => s.pendingFork)
  const confirmFork = useStudio((s) => s.confirmFork)
  const cancelFork = useStudio((s) => s.cancelFork)

  useEffect(() => {
    if (!pendingFork) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancelFork()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingFork, cancelFork])

  if (!pendingFork) return null

  const lumber = Object.entries(pendingFork.cost.extraLumberMBySpecies)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'fork.title')}
        data-testid="fork-dialog"
        className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg"
      >
        <h2 className="text-lg font-semibold">{t(locale, 'fork.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t(locale, 'fork.body')}</p>

        <ul className="mt-4 space-y-1 text-sm">
          <li data-testid="fork-glueups">{t(locale, 'fork.glueUps', { count: pendingFork.cost.extraGlueUps })}</li>
          <li data-testid="fork-cuts">{t(locale, 'fork.cuts', { count: pendingFork.cost.extraCuts })}</li>
          {lumber.map(([speciesId, meters]) => {
            const species = SPECIES_BY_ID.get(speciesId)
            const name = species ? (locale === 'ru' ? species.nameRu : species.nameEn) : speciesId
            return (
              <li key={speciesId} data-testid="fork-lumber">
                {t(locale, 'fork.lumber', { name, meters: meters.toFixed(2) })}
              </li>
            )
          })}
        </ul>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" data-testid="fork-cancel" onClick={cancelFork}>
            {t(locale, 'fork.cancel')}
          </Button>
          <Button data-testid="fork-confirm" onClick={confirmFork}>
            {t(locale, 'fork.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

If `Button` from `components/ui/button.tsx` does not forward `data-testid`, put the attribute on a wrapping `<span>` instead; do not modify the shadcn primitive.

- [ ] **Step 17: Run the fork dialog test**

Run: `pnpm exec vitest run components/ForkDialog.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 18: Full suite, typecheck, lint**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 19: Commit**

```bash
git add components/BoardSvg.tsx components/BoardSvg.test.tsx components/BoardCanvas.tsx components/BoardCanvas.test.tsx components/SpeciesPalette.tsx components/SpeciesPalette.test.tsx components/ForkDialog.tsx components/ForkDialog.test.tsx lib/i18n/ru.ts lib/i18n/en.ts
git commit -m "feat(ui): интерактивный холст доски, палитра пород и диалог разветвления панели"
```

---

### Task 8: Panel inspector

**Files:**
- Create: `components/PanelInspector.tsx`
- Test: `components/PanelInspector.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Consumes: `useStudio`, `selectDesign`, `useDerived`, `NumberFieldMm`, `SPECIES`, `SPECIES_BY_ID`, `speciesHex`, `isStrip`, `panelWidthMm`, `usageCount`, `MIN_STRIP_WIDTH_MM`, and the store actions `setStripWidth`, `setStripSpecies`, `addStrip`, `removeStrip`, `splitStripAt`, `moveStrip`, `selectPanel`.
- Produces: `export function PanelInspector(): JSX.Element` (reads the store, no props).

Layout per panel: a header with the panel id, its width in the current unit, its slice usage count and its derived length from `model.panelLengthsMm`, then one row per element. A `Strip` row shows a colour swatch, a species `<select>`, a `NumberFieldMm` for the width, a split field with a button, up/down buttons and a delete button. A `SliceRef` row is read-only in this phase (nested panels are produced by generators in a later phase) and shows its referenced panel id and its thickness.

New i18n keys: `panels.title`, `panels.panel`, `panels.usage`, `panels.width`, `panels.length`, `panels.stripSpecies`, `panels.stripWidth`, `panels.addStrip`, `panels.removeStrip`, `panels.split`, `panels.splitAt`, `panels.moveUp`, `panels.moveDown`, `panels.empty`, `panels.sliceRef`.

- [ ] **Step 1: Add the i18n keys**

`lib/i18n/ru.ts`:

```ts
  'panels.title': 'Панели первой склейки',
  'panels.panel': 'Панель {id}',
  'panels.usage': 'срезов: {count}',
  'panels.width': 'ширина {widthMm}',
  'panels.length': 'длина заготовки {lengthMm}',
  'panels.stripSpecies': 'Порода',
  'panels.stripWidth': 'Ширина полосы',
  'panels.addStrip': 'Добавить полосу',
  'panels.removeStrip': 'Удалить полосу',
  'panels.split': 'Разрезать',
  'panels.splitAt': 'Разрез на',
  'panels.moveUp': 'Левее',
  'panels.moveDown': 'Правее',
  'panels.empty': 'В панели нет полос',
  'panels.sliceRef': 'Срез панели {panelId}, толщина {thicknessMm}',
```

`lib/i18n/en.ts`:

```ts
  'panels.title': 'First glue-up panels',
  'panels.panel': 'Panel {id}',
  'panels.usage': 'slices: {count}',
  'panels.width': 'width {widthMm}',
  'panels.length': 'blank length {lengthMm}',
  'panels.stripSpecies': 'Species',
  'panels.stripWidth': 'Strip width',
  'panels.addStrip': 'Add strip',
  'panels.removeStrip': 'Remove strip',
  'panels.split': 'Split',
  'panels.splitAt': 'Split at',
  'panels.moveUp': 'Left',
  'panels.moveDown': 'Right',
  'panels.empty': 'This panel has no strips',
  'panels.sliceRef': 'Slice of panel {panelId}, thickness {thicknessMm}',
```

- [ ] **Step 2: Write the failing test**

Create `components/PanelInspector.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { baseDesign, isStrip } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { PanelInspector } from './PanelInspector'

const design = () => useStudio.getState().history.present
const panelA = () => design().panels.find((p) => p.id === 'A')

describe('PanelInspector', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('перечисляет панели и их полосы', () => {
    render(<PanelInspector />)
    expect(screen.getByTestId('panel-A')).toBeDefined()
    expect(screen.getByTestId('panel-B')).toBeDefined()
    expect(within(screen.getByTestId('panel-A')).getAllByTestId(/^strip-A-\d+$/)).toHaveLength(2)
  })

  it('показывает ширину панели в текущих единицах', () => {
    render(<PanelInspector />)
    expect(screen.getByTestId('panel-A-meta').textContent).toContain('50')
    useStudio.getState().setUnit('in')
    expect(screen.getByTestId('panel-A-meta').textContent).toContain('1.97')
  })

  it('меняет ширину полосы через поле ввода', () => {
    render(<PanelInspector />)
    const input = screen.getByTestId('strip-A-0-width') as HTMLInputElement
    fireEvent.change(input, { target: { value: '40' } })
    fireEvent.blur(input)
    const el = panelA()?.elements[0]
    expect(el && isStrip(el) ? el.widthMm : 0).toBe(40)
  })

  it('меняет породу полосы через выпадающий список', () => {
    render(<PanelInspector />)
    fireEvent.change(screen.getByTestId('strip-A-0-species'), { target: { value: 'padauk' } })
    expect(panelA()?.elements[0]).toMatchObject({ speciesId: 'padauk' })
  })

  it('добавляет и удаляет полосу', () => {
    render(<PanelInspector />)
    useStudio.getState().setActiveSpecies('padauk')
    fireEvent.click(screen.getByTestId('panel-A-add'))
    expect(panelA()?.elements).toHaveLength(3)
    fireEvent.click(screen.getByTestId('strip-A-0-remove'))
    expect(panelA()?.elements).toHaveLength(2)
  })

  it('разрезает полосу по введённому размеру', () => {
    render(<PanelInspector />)
    fireEvent.change(screen.getByTestId('strip-A-0-splitat'), { target: { value: '10' } })
    fireEvent.blur(screen.getByTestId('strip-A-0-splitat'))
    fireEvent.click(screen.getByTestId('strip-A-0-split'))
    expect(panelA()?.elements).toHaveLength(3)
    const first = panelA()?.elements[0]
    expect(first && isStrip(first) ? first.widthMm : 0).toBe(10)
  })

  it('переставляет полосы кнопками', () => {
    render(<PanelInspector />)
    const before = panelA()?.elements.map((e) => (isStrip(e) ? e.speciesId : '?'))
    fireEvent.click(screen.getByTestId('strip-A-0-down'))
    const after = panelA()?.elements.map((e) => (isStrip(e) ? e.speciesId : '?'))
    expect(after).toEqual([...(before ?? [])].reverse())
  })

  it('сообщает о пустой панели вместо пустого места', () => {
    useStudio.getState().resetStudio(baseDesign({ panels: [{ id: 'A', elements: [] }], rows: [] }))
    render(<PanelInspector />)
    expect(screen.getByText('В панели нет полос')).toBeDefined()
  })

  it('показывает вложенный срез только для чтения', () => {
    useStudio.getState().resetStudio(
      baseDesign({
        panels: [
          { id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 25 }] },
          { id: 'B', elements: [{ kind: 'sliceRef', panelId: 'A', thicknessMm: 12, angleDeg: 0, offsetMm: 0 }] },
        ],
        rows: [{ id: 'r1', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
      }),
    )
    render(<PanelInspector />)
    expect(screen.getByTestId('strip-B-0').textContent).toContain('Срез панели A')
    expect(screen.queryByTestId('strip-B-0-width')).toBe(null)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run components/PanelInspector.test.tsx`
Expected: FAIL, `Failed to resolve import "./PanelInspector"`.

- [ ] **Step 4: Implement `components/PanelInspector.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MIN_STRIP_WIDTH_MM, isStrip, panelWidthMm, usageCount, type Panel, type PanelElement } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { SPECIES, speciesHex } from '@/lib/species'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { formatMm, type UnitSystem } from '@/lib/units'

function StripRow({
  panelId,
  index,
  element,
  locale,
  unit,
}: {
  panelId: string
  index: number
  element: PanelElement
  locale: Locale
  unit: UnitSystem
}) {
  const setStripWidth = useStudio((s) => s.setStripWidth)
  const setStripSpecies = useStudio((s) => s.setStripSpecies)
  const removeStrip = useStudio((s) => s.removeStrip)
  const splitStripAt = useStudio((s) => s.splitStripAt)
  const moveStrip = useStudio((s) => s.moveStrip)
  const [splitAtMm, setSplitAtMm] = useState(0)
  const testId = `strip-${panelId}-${index}`

  if (!isStrip(element)) {
    const unitLabel = t(locale, unit === 'mm' ? 'units.mm' : 'units.in')
    return (
      <li data-testid={testId} className="rounded-md border px-2 py-1.5 text-sm text-muted-foreground">
        {t(locale, 'panels.sliceRef', {
          panelId: element.panelId,
          thicknessMm: formatMm(element.thicknessMm, unit, unitLabel, 1),
        })}
      </li>
    )
  }

  return (
    <li data-testid={testId} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
      <span
        aria-hidden="true"
        style={{ backgroundColor: speciesHex(element.speciesId) }}
        className="h-8 w-8 shrink-0 rounded border border-black/20"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={`${testId}-species`} className="text-xs text-muted-foreground">
          {t(locale, 'panels.stripSpecies')}
        </label>
        <select
          id={`${testId}-species`}
          data-testid={`${testId}-species`}
          value={element.speciesId}
          onChange={(e) => setStripSpecies(panelId, index, e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {SPECIES.map((s) => (
            <option key={s.id} value={s.id}>
              {locale === 'ru' ? s.nameRu : s.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div className="w-24">
        <NumberFieldMm
          id={`${testId}-width`}
          testId={`${testId}-width`}
          labelKey="panels.stripWidth"
          valueMm={element.widthMm}
          unit={unit}
          locale={locale}
          minMm={MIN_STRIP_WIDTH_MM}
          onCommitMm={(mm) => setStripWidth(panelId, index, mm)}
        />
      </div>

      <div className="w-24">
        <NumberFieldMm
          id={`${testId}-splitat`}
          testId={`${testId}-splitat`}
          labelKey="panels.splitAt"
          valueMm={splitAtMm}
          unit={unit}
          locale={locale}
          onCommitMm={setSplitAtMm}
        />
      </div>

      <Button size="sm" variant="outline" data-testid={`${testId}-split`} onClick={() => splitStripAt(panelId, index, splitAtMm)}>
        {t(locale, 'panels.split')}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-up`} aria-label={t(locale, 'panels.moveUp')} onClick={() => moveStrip(panelId, index, index - 1)}>
        {'<'}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-down`} aria-label={t(locale, 'panels.moveDown')} onClick={() => moveStrip(panelId, index, index + 1)}>
        {'>'}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-remove`} aria-label={t(locale, 'panels.removeStrip')} onClick={() => removeStrip(panelId, index)}>
        {t(locale, 'panels.removeStrip')}
      </Button>
    </li>
  )
}

function PanelCard({ panel, locale, unit }: { panel: Panel; locale: Locale; unit: UnitSystem }) {
  const design = useStudio(selectDesign)
  const addStrip = useStudio((s) => s.addStrip)
  const selectPanel = useStudio((s) => s.selectPanel)
  const { model } = useDerived()
  const unitLabel = t(locale, unit === 'mm' ? 'units.mm' : 'units.in')
  const lengthMm = model.panelLengthsMm[panel.id] ?? 0

  return (
    <section data-testid={`panel-${panel.id}`} className="rounded-lg border p-3" onFocus={() => selectPanel(panel.id)}>
      <header className="mb-2">
        <h3 className="text-sm font-medium">{t(locale, 'panels.panel', { id: panel.id })}</h3>
        <p data-testid={`panel-${panel.id}-meta`} className="text-xs text-muted-foreground">
          {t(locale, 'panels.width', { widthMm: formatMm(panelWidthMm(panel), unit, unitLabel, 1) })}
          {', '}
          {t(locale, 'panels.length', { lengthMm: formatMm(lengthMm, unit, unitLabel, 1) })}
          {', '}
          {t(locale, 'panels.usage', { count: usageCount(design, panel.id) })}
        </p>
      </header>

      {panel.elements.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t(locale, 'panels.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {panel.elements.map((element, index) => (
            <StripRow
              key={`${panel.id}-${index}`}
              panelId={panel.id}
              index={index}
              element={element}
              locale={locale}
              unit={unit}
            />
          ))}
        </ul>
      )}

      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        data-testid={`panel-${panel.id}-add`}
        onClick={() => addStrip(panel.id, panel.elements.length)}
      >
        {t(locale, 'panels.addStrip')}
      </Button>
    </section>
  )
}

export function PanelInspector() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const design = useStudio(selectDesign)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'panels.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {design.panels.map((panel) => (
          <PanelCard key={panel.id} panel={panel} locale={locale} unit={unit} />
        ))}
      </CardContent>
    </Card>
  )
}
```

React key note: strips have no stable identity in the model, so the index-based key is the honest choice here; `NumberFieldMm` re-syncs from `valueMm` on every change, so a reorder cannot leave a stale draft behind.

- [ ] **Step 5: Run the test**

Run: `pnpm exec vitest run components/PanelInspector.test.tsx`
Expected: PASS, 9 tests.

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add components/PanelInspector.tsx components/PanelInspector.test.tsx lib/i18n/ru.ts lib/i18n/en.ts
git commit -m "feat(ui): инспектор панелей с правкой, разрезом и перестановкой полос"
```

---

### Task 9: Row inspector

**Files:**
- Create: `components/RowInspector.tsx`
- Test: `components/RowInspector.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Consumes: `useStudio`, `selectDesign`, `NumberFieldMm`, and the store actions `setRowThickness`, `setRowPanel`, `setRowTrim`, `toggleRowFlip`, `toggleRowMirror`, `addRow`, `removeRow`, `moveRow`, `selectRow`.
- Produces: `export function RowInspector(): JSX.Element` (reads the store, no props).

New i18n keys: `rows.title`, `rows.row`, `rows.panel`, `rows.thickness`, `rows.trim`, `rows.flip`, `rows.mirror`, `rows.add`, `rows.remove`, `rows.moveUp`, `rows.moveDown`, `rows.empty`.

- [ ] **Step 1: Add the i18n keys**

`lib/i18n/ru.ts`:

```ts
  'rows.title': 'Ряды доски',
  'rows.row': 'Ряд {id}',
  'rows.panel': 'Панель',
  'rows.thickness': 'Толщина среза',
  'rows.trim': 'Торцевой припуск',
  'rows.flip': 'Переворот',
  'rows.mirror': 'Зеркало',
  'rows.add': 'Добавить ряд',
  'rows.remove': 'Удалить ряд',
  'rows.moveUp': 'Выше',
  'rows.moveDown': 'Ниже',
  'rows.empty': 'В доске пока нет рядов',
```

`lib/i18n/en.ts`:

```ts
  'rows.title': 'Board rows',
  'rows.row': 'Row {id}',
  'rows.panel': 'Panel',
  'rows.thickness': 'Slice thickness',
  'rows.trim': 'End trim',
  'rows.flip': 'Flip',
  'rows.mirror': 'Mirror',
  'rows.add': 'Add row',
  'rows.remove': 'Remove row',
  'rows.moveUp': 'Up',
  'rows.moveDown': 'Down',
  'rows.empty': 'The board has no rows yet',
```

- [ ] **Step 2: Write the failing test**

Create `components/RowInspector.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { RowInspector } from './RowInspector'

const rows = () => useStudio.getState().history.present.rows

describe('RowInspector', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('перечисляет ряды документа', () => {
    render(<RowInspector />)
    expect(screen.getByTestId('row-r1')).toBeDefined()
    expect(screen.getByTestId('row-r2')).toBeDefined()
  })

  it('меняет толщину среза и торцевой припуск', () => {
    render(<RowInspector />)
    const thickness = screen.getByTestId('row-r1-thickness')
    fireEvent.change(thickness, { target: { value: '35' } })
    fireEvent.blur(thickness)
    const trim = screen.getByTestId('row-r1-trim')
    fireEvent.change(trim, { target: { value: '8' } })
    fireEvent.blur(trim)
    expect(rows()[0]).toMatchObject({ thicknessMm: 35, trimMm: 8 })
  })

  it('переставляет ряд на другую панель', () => {
    render(<RowInspector />)
    fireEvent.change(screen.getByTestId('row-r1-panel'), { target: { value: 'B' } })
    expect(rows()[0]?.panelId).toBe('B')
  })

  it('переключает переворот и зеркало', () => {
    render(<RowInspector />)
    fireEvent.click(screen.getByTestId('row-r1-flip'))
    fireEvent.click(screen.getByTestId('row-r1-mirror'))
    expect(rows()[0]).toMatchObject({ flip: true, mirror: true })
    expect((screen.getByTestId('row-r1-flip') as HTMLInputElement).checked).toBe(true)
  })

  it('добавляет ряд копией текущего и удаляет ряд', () => {
    render(<RowInspector />)
    fireEvent.click(screen.getByTestId('row-r1-add'))
    expect(rows()).toHaveLength(3)
    fireEvent.click(screen.getByTestId('row-r1-remove'))
    expect(rows().map((r) => r.id)).not.toContain('r1')
  })

  it('переставляет ряды кнопками', () => {
    render(<RowInspector />)
    fireEvent.click(screen.getByTestId('row-r1-down'))
    expect(rows().map((r) => r.id)).toEqual(['r2', 'r1'])
  })

  it('показывает подсказку, когда рядов нет, и умеет добавить первый', () => {
    useStudio.getState().resetStudio(baseDesign({ rows: [] }))
    render(<RowInspector />)
    expect(screen.getByText('В доске пока нет рядов')).toBeDefined()
    fireEvent.click(screen.getByTestId('rows-add'))
    expect(rows()).toHaveLength(1)
  })

  it('переводит подписи', () => {
    useStudio.getState().setLocale('en')
    render(<RowInspector />)
    expect(screen.getByText('Board rows')).toBeDefined()
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run components/RowInspector.test.tsx`
Expected: FAIL, `Failed to resolve import "./RowInspector"`.

- [ ] **Step 4: Implement `components/RowInspector.tsx`**

```tsx
'use client'

import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Design, Row } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { selectDesign, useStudio } from '@/lib/store/studio'
import type { UnitSystem } from '@/lib/units'

function RowCard({
  row,
  index,
  design,
  locale,
  unit,
}: {
  row: Row
  index: number
  design: Design
  locale: Locale
  unit: UnitSystem
}) {
  const setRowThickness = useStudio((s) => s.setRowThickness)
  const setRowPanel = useStudio((s) => s.setRowPanel)
  const setRowTrim = useStudio((s) => s.setRowTrim)
  const toggleRowFlip = useStudio((s) => s.toggleRowFlip)
  const toggleRowMirror = useStudio((s) => s.toggleRowMirror)
  const addRow = useStudio((s) => s.addRow)
  const removeRow = useStudio((s) => s.removeRow)
  const moveRow = useStudio((s) => s.moveRow)
  const selectRow = useStudio((s) => s.selectRow)
  const testId = `row-${row.id}`

  return (
    <li data-testid={testId} className="flex flex-wrap items-end gap-2 rounded-md border p-2" onFocus={() => selectRow(row.id)}>
      <span className="w-16 shrink-0 text-sm font-medium">{t(locale, 'rows.row', { id: row.id })}</span>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${testId}-panel`} className="text-xs text-muted-foreground">
          {t(locale, 'rows.panel')}
        </label>
        <select
          id={`${testId}-panel`}
          data-testid={`${testId}-panel`}
          value={row.panelId}
          onChange={(e) => setRowPanel(row.id, e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {design.panels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>
      </div>

      <div className="w-24">
        <NumberFieldMm
          id={`${testId}-thickness`}
          testId={`${testId}-thickness`}
          labelKey="rows.thickness"
          valueMm={row.thicknessMm}
          unit={unit}
          locale={locale}
          onCommitMm={(mm) => setRowThickness(row.id, mm)}
        />
      </div>

      <div className="w-24">
        <NumberFieldMm
          id={`${testId}-trim`}
          testId={`${testId}-trim`}
          labelKey="rows.trim"
          valueMm={row.trimMm}
          unit={unit}
          locale={locale}
          minMm={0}
          onCommitMm={(mm) => setRowTrim(row.id, mm)}
        />
      </div>

      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          data-testid={`${testId}-flip`}
          checked={row.flip}
          onChange={() => toggleRowFlip(row.id)}
        />
        {t(locale, 'rows.flip')}
      </label>

      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          data-testid={`${testId}-mirror`}
          checked={row.mirror}
          onChange={() => toggleRowMirror(row.id)}
        />
        {t(locale, 'rows.mirror')}
      </label>

      <Button size="sm" variant="outline" data-testid={`${testId}-up`} aria-label={t(locale, 'rows.moveUp')} onClick={() => moveRow(index, index - 1)}>
        {'^'}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-down`} aria-label={t(locale, 'rows.moveDown')} onClick={() => moveRow(index, index + 1)}>
        {'v'}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-add`} onClick={() => addRow(row.id)}>
        {t(locale, 'rows.add')}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-remove`} onClick={() => removeRow(row.id)}>
        {t(locale, 'rows.remove')}
      </Button>
    </li>
  )
}

export function RowInspector() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const design = useStudio(selectDesign)
  const addRow = useStudio((s) => s.addRow)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'rows.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {design.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(locale, 'rows.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {design.rows.map((row, index) => (
              <RowCard key={row.id} row={row} index={index} design={design} locale={locale} unit={unit} />
            ))}
          </ul>
        )}
        <Button size="sm" variant="outline" data-testid="rows-add" onClick={() => addRow(null)}>
          {t(locale, 'rows.add')}
        </Button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: Run the test**

Run: `pnpm exec vitest run components/RowInspector.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Full suite, typecheck, lint**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add components/RowInspector.tsx components/RowInspector.test.tsx lib/i18n/ru.ts lib/i18n/en.ts
git commit -m "feat(ui): инспектор рядов с толщиной, припуском, переворотом и зеркалом"
```

---

### Task 10: Board settings, unit toggle, share link, undo/redo controls

**Files:**
- Create: `components/BoardSettings.tsx`
- Create: `components/HistoryControls.tsx`
- Test: `components/BoardSettings.test.tsx`, `components/HistoryControls.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Consumes: `useStudio`, `selectDesign`, `selectCanUndo`, `selectCanRedo`, `NumberFieldMm`, `shareUrl` (Task 5), `BOARD_MIN_MM`, `BOARD_MAX_MM`, `THICKNESS_MIN_MM`, `THICKNESS_MAX_MM`, `DEFAULT_PLANER_WIDTH_MM`, and the setters `setBoardWidthMm`, `setBoardLengthMm`, `setBoardThicknessMm`, `setKerfMm`, `setPlaningAllowanceMm`, `setPlanerWidthMm`, `setDesignName`, `setUnit`, `undo`, `redo`.
- Produces:
```ts
export function BoardSettings(): JSX.Element
export function HistoryControls(): JSX.Element   // buttons plus the cmd/ctrl+z shortcut effect
```

Keyboard contract: `Cmd+Z` / `Ctrl+Z` undoes, `Shift+Cmd+Z` / `Shift+Ctrl+Z` and `Ctrl+Y` redo. The handler ignores the event when focus sits in an `input`, `textarea` or `select`, so the browser's own text undo keeps working inside fields.

New i18n keys: `board.name`, `board.width`, `board.length`, `board.thickness`, `board.allowance`, `board.planerWidth`, `board.settings`, `share.copy`, `share.copied`, `history.undo`, `history.redo`, `aria.historyGroup`. (`board.kerf`, `units.title` and `aria.unitGroup` were added in Task 6.)

- [ ] **Step 1: Add the i18n keys**

`lib/i18n/ru.ts`:

```ts
  'board.settings': 'Параметры доски',
  'board.name': 'Название проекта',
  'board.width': 'Ширина доски',
  'board.length': 'Длина доски',
  'board.thickness': 'Толщина доски',
  'board.allowance': 'Припуск на строгание',
  'board.planerWidth': 'Ширина рейсмуса',
  'share.copy': 'Скопировать ссылку',
  'share.copied': 'Ссылка скопирована',
  'history.undo': 'Отменить',
  'history.redo': 'Вернуть',
  'aria.historyGroup': 'отмена и возврат правок',
```

`lib/i18n/en.ts`:

```ts
  'board.settings': 'Board settings',
  'board.name': 'Project name',
  'board.width': 'Board width',
  'board.length': 'Board length',
  'board.thickness': 'Board thickness',
  'board.allowance': 'Planing allowance',
  'board.planerWidth': 'Planer width',
  'share.copy': 'Copy link',
  'share.copied': 'Link copied',
  'history.undo': 'Undo',
  'history.redo': 'Redo',
  'aria.historyGroup': 'undo and redo',
```

- [ ] **Step 2: Write the failing board settings test**

Create `components/BoardSettings.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { BoardSettings } from './BoardSettings'

const design = () => useStudio.getState().history.present

function commitField(testId: string, value: string): void {
  const input = screen.getByTestId(testId)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

describe('BoardSettings', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('правит все размеры доски в миллиметрах', () => {
    render(<BoardSettings />)
    commitField('board-width', '300')
    commitField('board-length', '400')
    commitField('board-thickness', '45')
    commitField('board-kerf', '4')
    commitField('board-allowance', '5')
    commitField('board-planer', '250')
    expect(design().board).toMatchObject({ targetWidthMm: 300, targetLengthMm: 400, thicknessMm: 45 })
    expect(design().kerfMm).toBe(4)
    expect(design().planingAllowanceMm).toBe(5)
    expect(design().planerWidthMm).toBe(250)
  })

  it('правит название проекта', () => {
    render(<BoardSettings />)
    fireEvent.change(screen.getByTestId('board-name'), { target: { value: 'Подарок' } })
    expect(design().name).toBe('Подарок')
  })

  it('переключение на дюймы переписывает значения всех полей', () => {
    render(<BoardSettings />)
    expect((screen.getByTestId('board-thickness') as HTMLInputElement).value).toBe('40')
    fireEvent.click(screen.getByTestId('unit-in'))
    expect(useStudio.getState().unit).toBe('in')
    expect((screen.getByTestId('board-thickness') as HTMLInputElement).value).toBe('1.575')
  })

  it('ввод в дюймах сохраняется в миллиметрах', () => {
    render(<BoardSettings />)
    fireEvent.click(screen.getByTestId('unit-in'))
    commitField('board-thickness', '2')
    expect(design().board.thicknessMm).toBeCloseTo(50.8, 9)
  })

  it('копирует ссылку на проект в буфер обмена', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<BoardSettings />)
    fireEvent.click(screen.getByTestId('share-copy'))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(String(writeText.mock.calls[0]?.[0])).toContain('#')
    expect(await screen.findByText('Ссылка скопирована')).toBeDefined()
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run components/BoardSettings.test.tsx`
Expected: FAIL, `Failed to resolve import "./BoardSettings"`.

- [ ] **Step 4: Implement `components/BoardSettings.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BOARD_MAX_MM, BOARD_MIN_MM, THICKNESS_MAX_MM, THICKNESS_MIN_MM } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { shareUrl } from '@/lib/store/persist'
import { selectDesign, useStudio } from '@/lib/store/studio'
import type { UnitSystem } from '@/lib/units'

export function BoardSettings() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const setUnit = useStudio((s) => s.setUnit)
  const design = useStudio(selectDesign)
  const setDesignName = useStudio((s) => s.setDesignName)
  const setBoardWidthMm = useStudio((s) => s.setBoardWidthMm)
  const setBoardLengthMm = useStudio((s) => s.setBoardLengthMm)
  const setBoardThicknessMm = useStudio((s) => s.setBoardThicknessMm)
  const setKerfMm = useStudio((s) => s.setKerfMm)
  const setPlaningAllowanceMm = useStudio((s) => s.setPlaningAllowanceMm)
  const setPlanerWidthMm = useStudio((s) => s.setPlanerWidthMm)
  const [copied, setCopied] = useState(false)

  const copyLink = (): void => {
    const url = shareUrl(window.location.href, design)
    window.history.replaceState(null, '', url)
    void navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-base">{t(locale, 'board.settings')}</CardTitle>
        <div className="flex gap-1" role="group" aria-label={t(locale, 'aria.unitGroup')}>
          {(['mm', 'in'] as const).map((u: UnitSystem) => (
            <Button
              key={u}
              size="sm"
              variant={u === unit ? 'default' : 'outline'}
              data-testid={`unit-${u}`}
              onClick={() => setUnit(u)}
            >
              {t(locale, u === 'mm' ? 'units.mm' : 'units.in')}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="board-name" className="text-xs text-muted-foreground">
            {t(locale, 'board.name')}
          </label>
          <input
            id="board-name"
            data-testid="board-name"
            value={design.name}
            onChange={(e) => setDesignName(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <NumberFieldMm id="board-width" testId="board-width" labelKey="board.width" valueMm={design.board.targetWidthMm} unit={unit} locale={locale} minMm={BOARD_MIN_MM} maxMm={BOARD_MAX_MM} onCommitMm={setBoardWidthMm} />
          <NumberFieldMm id="board-length" testId="board-length" labelKey="board.length" valueMm={design.board.targetLengthMm} unit={unit} locale={locale} minMm={BOARD_MIN_MM} maxMm={BOARD_MAX_MM} onCommitMm={setBoardLengthMm} />
          <NumberFieldMm id="board-thickness" testId="board-thickness" labelKey="board.thickness" valueMm={design.board.thicknessMm} unit={unit} locale={locale} minMm={THICKNESS_MIN_MM} maxMm={THICKNESS_MAX_MM} onCommitMm={setBoardThicknessMm} />
          <NumberFieldMm id="board-kerf" testId="board-kerf" labelKey="board.kerf" valueMm={design.kerfMm} unit={unit} locale={locale} minMm={0.1} maxMm={10} onCommitMm={setKerfMm} />
          <NumberFieldMm id="board-allowance" testId="board-allowance" labelKey="board.allowance" valueMm={design.planingAllowanceMm} unit={unit} locale={locale} minMm={0} onCommitMm={setPlaningAllowanceMm} />
          <NumberFieldMm id="board-planer" testId="board-planer" labelKey="board.planerWidth" valueMm={design.planerWidthMm} unit={unit} locale={locale} minMm={50} onCommitMm={setPlanerWidthMm} />
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" data-testid="share-copy" onClick={copyLink}>
            {t(locale, 'share.copy')}
          </Button>
          {copied ? <span className="text-sm text-muted-foreground">{t(locale, 'share.copied')}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
```

The `1.575` in the test is `mmToDisplay(40, 'in')`: `40 / 25.4 = 1.5748...` rounded to three decimals and trimmed.

- [ ] **Step 5: Run the board settings test**

Run: `pnpm exec vitest run components/BoardSettings.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the failing history controls test**

Create `components/HistoryControls.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { HistoryControls } from './HistoryControls'

const kerf = () => useStudio.getState().history.present.kerfMm

describe('HistoryControls', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('обе кнопки выключены, пока правок не было', () => {
    render(<HistoryControls />)
    expect((screen.getByTestId('undo') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByTestId('redo') as HTMLButtonElement).disabled).toBe(true)
  })

  it('кнопки отменяют и возвращают правку', () => {
    render(<HistoryControls />)
    useStudio.getState().setKerfMm(7)
    fireEvent.click(screen.getByTestId('undo'))
    expect(kerf()).toBe(3)
    fireEvent.click(screen.getByTestId('redo'))
    expect(kerf()).toBe(7)
  })

  it('ctrl+z отменяет, shift+ctrl+z возвращает', () => {
    render(<HistoryControls />)
    useStudio.getState().setKerfMm(7)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(kerf()).toBe(3)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(kerf()).toBe(7)
  })

  it('cmd+z работает на macOS', () => {
    render(<HistoryControls />)
    useStudio.getState().setKerfMm(7)
    fireEvent.keyDown(window, { key: 'z', metaKey: true })
    expect(kerf()).toBe(3)
  })

  it('ctrl+y тоже возвращает правку', () => {
    render(<HistoryControls />)
    useStudio.getState().setKerfMm(7)
    useStudio.getState().undo()
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(kerf()).toBe(7)
  })

  it('не перехватывает отмену внутри поля ввода', () => {
    render(
      <>
        <HistoryControls />
        <input data-testid="поле" />
      </>,
    )
    useStudio.getState().setKerfMm(7)
    const field = screen.getByTestId('поле')
    field.focus()
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true, bubbles: true })
    expect(kerf()).toBe(7)
  })
})
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm exec vitest run components/HistoryControls.test.tsx`
Expected: FAIL, `Failed to resolve import "./HistoryControls"`.

- [ ] **Step 8: Implement `components/HistoryControls.tsx`**

```tsx
'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { selectCanRedo, selectCanUndo, useStudio } from '@/lib/store/studio'

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return EDITABLE.has(target.tagName) || target.isContentEditable
}

export function HistoryControls() {
  const locale = useStudio((s) => s.locale)
  const canUndo = useStudio(selectCanUndo)
  const canRedo = useStudio(selectCanRedo)
  const undo = useStudio((s) => s.undo)
  const redo = useStudio((s) => s.redo)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return
      // Внутри поля ввода отмена принадлежит браузеру: он откатывает текст, а не документ.
      if (isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  return (
    <div className="flex gap-1" role="group" aria-label={t(locale, 'aria.historyGroup')}>
      <Button size="sm" variant="outline" data-testid="undo" disabled={!canUndo} onClick={undo}>
        {t(locale, 'history.undo')}
      </Button>
      <Button size="sm" variant="outline" data-testid="redo" disabled={!canRedo} onClick={redo}>
        {t(locale, 'history.redo')}
      </Button>
    </div>
  )
}
```

- [ ] **Step 9: Run the history controls test**

Run: `pnpm exec vitest run components/HistoryControls.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 10: Full suite, typecheck, lint**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint`
Expected: green.

- [ ] **Step 11: Commit**

```bash
git add components/BoardSettings.tsx components/BoardSettings.test.tsx components/HistoryControls.tsx components/HistoryControls.test.tsx lib/i18n/ru.ts lib/i18n/en.ts
git commit -m "feat(ui): параметры доски, переключатель единиц, ссылка на проект и отмена правок"
```

---

### Task 11: Diagnostics panel and the assembled studio shell

**Files:**
- Create: `components/DiagnosticsPanel.tsx`
- Modify: `components/StudioShell.tsx` (full rewrite)
- Test: `components/DiagnosticsPanel.test.tsx`, `components/StudioShell.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Consumes: everything produced by Tasks 5 to 10: `useDerived`, `useStudioPersistence`, `BoardCanvas`, `SpeciesPalette`, `ForkDialog`, `PanelInspector`, `RowInspector`, `BoardSettings`, `HistoryControls`, `ComplexityMeter`, `LocaleToggle`.
- Produces:
```ts
export function DiagnosticsPanel(): JSX.Element
export function StudioShell(): JSX.Element   // still the only export consumed by app/page.tsx
```

`app/page.tsx` is not modified: it already renders `<StudioShell />`.

New i18n keys: `diagnostics.title`, `diagnostics.none`, `diagnostics.counts`, `diagnostics.at`.

- [ ] **Step 1: Add the i18n keys**

`lib/i18n/ru.ts`:

```ts
  'diagnostics.title': 'Проверки изготовимости',
  'diagnostics.none': 'Замечаний нет, доска изготовима',
  'diagnostics.counts': 'ошибок {errors}, предупреждений {warnings}',
  'diagnostics.at': 'панель {panelId}, ряд {rowId}',
```

`lib/i18n/en.ts`:

```ts
  'diagnostics.title': 'Buildability checks',
  'diagnostics.none': 'No issues, the board is buildable',
  'diagnostics.counts': '{errors} errors, {warnings} warnings',
  'diagnostics.at': 'panel {panelId}, row {rowId}',
```

- [ ] **Step 2: Write the failing diagnostics test**

Create `components/DiagnosticsPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { useStudio } from '@/lib/store/studio'
import { DiagnosticsPanel } from './DiagnosticsPanel'

describe('DiagnosticsPanel', () => {
  beforeEach(() => useStudio.getState().resetStudio(baseDesign()))

  it('сообщает, что замечаний нет', () => {
    render(<DiagnosticsPanel />)
    expect(screen.getByText('Замечаний нет, доска изготовима')).toBeDefined()
  })

  it('показывает локализованное сообщение об ошибке и не прячет редактор', () => {
    useStudio.getState().resetStudio(
      baseDesign({ panels: [{ id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 1 }] }] }),
    )
    render(<DiagnosticsPanel />)
    const list = screen.getByTestId('diagnostics-list')
    expect(list.textContent).toContain('не удержится в струбцине')
    expect(screen.getByTestId('diagnostics-counts').textContent).toContain('ошибок')
  })

  it('переводит сообщения на английский', () => {
    useStudio.getState().resetStudio(
      baseDesign({ panels: [{ id: 'A', elements: [{ kind: 'strip', speciesId: 'maple', widthMm: 1 }] }] }),
    )
    useStudio.getState().setLocale('en')
    render(<DiagnosticsPanel />)
    expect(screen.getByTestId('diagnostics-list').textContent).toContain('will not hold in a clamp')
  })

  it('обновляется вслед за правкой документа', () => {
    const { rerender } = render(<DiagnosticsPanel />)
    expect(screen.queryByTestId('diagnostics-list')).toBe(null)
    useStudio.getState().setStripWidth('A', 0, 1)
    rerender(<DiagnosticsPanel />)
    expect(screen.getByTestId('diagnostics-list').textContent).toContain('не удержится в струбцине')
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run components/DiagnosticsPanel.test.tsx`
Expected: FAIL, `Failed to resolve import "./DiagnosticsPanel"`.

- [ ] **Step 4: Implement `components/DiagnosticsPanel.tsx`**

```tsx
'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t, type MessageKey } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'

export function DiagnosticsPanel() {
  const locale = useStudio((s) => s.locale)
  const { diagnostics } = useDerived()
  const errors = diagnostics.filter((d) => d.level === 'error').length
  const warnings = diagnostics.filter((d) => d.level === 'warning').length

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'diagnostics.title')}</CardTitle>
        {diagnostics.length > 0 ? (
          <p data-testid="diagnostics-counts" className="text-sm text-muted-foreground">
            {t(locale, 'diagnostics.counts', { errors, warnings })}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        {diagnostics.length === 0 ? (
          <Badge variant="secondary">{t(locale, 'diagnostics.none')}</Badge>
        ) : (
          <ul data-testid="diagnostics-list" className="space-y-1 text-sm">
            {diagnostics.map((d, i) => (
              <li
                key={`${d.code}-${i}`}
                data-level={d.level}
                className={d.level === 'error' ? 'text-red-600' : 'text-amber-600'}
              >
                {t(locale, d.messageKey as MessageKey, d.params)}
                {d.target ? (
                  <span className="ml-1 text-muted-foreground">
                    ({t(locale, 'diagnostics.at', { panelId: d.target.panelId ?? '-', rowId: d.target.rowId ?? '-' })})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

Diagnostics are informational: nothing here disables an action. Errors are loud, not blocking, exactly as the phase scope requires.

- [ ] **Step 5: Run the diagnostics test**

Run: `pnpm exec vitest run components/DiagnosticsPanel.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing shell test**

Create `components/StudioShell.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { StudioShell } from './StudioShell'

describe('StudioShell', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.location.hash = ''
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
  })

  it('собирает холст, палитру, инспекторы, параметры, счётчик и проверки', () => {
    const { container } = render(<StudioShell />)
    expect(container.querySelector('[data-testid="board-canvas"]')).not.toBe(null)
    expect(screen.getByTestId('species-walnut')).toBeDefined()
    expect(screen.getByTestId('panel-A')).toBeDefined()
    expect(screen.getByTestId('row-r0')).toBeDefined()
    expect(screen.getByTestId('board-thickness')).toBeDefined()
    expect(screen.getByTestId('undo')).toBeDefined()
    expect(screen.getByText('Сложность проекта')).toBeDefined()
    expect(screen.getByText('Проверки изготовимости')).toBeDefined()
  })

  it('переключение языка переводит весь интерфейс', () => {
    render(<StudioShell />)
    fireEvent.click(screen.getByText('EN'))
    expect(screen.getByText('Project complexity')).toBeDefined()
    expect(screen.getByText('Board rows')).toBeDefined()
  })

  it('переключение единиц меняет числа в счётчике сложности', () => {
    render(<StudioShell />)
    expect(screen.getByText(/Габарит: 60/)).toBeDefined()
    fireEvent.click(screen.getByTestId('unit-in'))
    expect(screen.getByText(/2\.36"/)).toBeDefined()
  })

  it('покраска через холст и отмена возвращают исходный цвет', () => {
    const { container } = render(<StudioShell />)
    fireEvent.click(screen.getByTestId('species-padauk'))
    const rect = container.querySelector('rect[data-cell="r0:0"]') as Element
    const before = rect.getAttribute('fill')
    fireEvent.pointerDown(rect, { bubbles: true })
    fireEvent.click(screen.getByTestId('fork-confirm'))
    expect(container.querySelector('rect[data-cell="r0:0"]')?.getAttribute('fill')).toBe('#a8422a')
    fireEvent.click(screen.getByTestId('undo'))
    expect(container.querySelector('rect[data-cell="r0:0"]')?.getAttribute('fill')).toBe(before)
  })
})
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm exec vitest run components/StudioShell.test.tsx`
Expected: FAIL, `Unable to find an element by: [data-testid="board-canvas"]` (the old shell renders the static `BoardSvg`).

- [ ] **Step 8: Rewrite `components/StudioShell.tsx`**

```tsx
'use client'

import { BoardCanvas } from '@/components/BoardCanvas'
import { BoardSettings } from '@/components/BoardSettings'
import { ComplexityMeter } from '@/components/ComplexityMeter'
import { DiagnosticsPanel } from '@/components/DiagnosticsPanel'
import { ForkDialog } from '@/components/ForkDialog'
import { HistoryControls } from '@/components/HistoryControls'
import { LocaleToggle } from '@/components/LocaleToggle'
import { PanelInspector } from '@/components/PanelInspector'
import { RowInspector } from '@/components/RowInspector'
import { SpeciesPalette } from '@/components/SpeciesPalette'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudioPersistence } from '@/lib/store/persist'
import { useStudio } from '@/lib/store/studio'

export function StudioShell() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const setLocale = useStudio((s) => s.setLocale)
  const { model, calc, diagnostics } = useDerived()
  useStudioPersistence()

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t(locale, 'app.title')}</h1>
          <p className="text-sm text-muted-foreground">{t(locale, 'app.tagline')}</p>
        </div>
        <div className="flex items-center gap-2">
          <HistoryControls />
          <LocaleToggle locale={locale} onChange={setLocale} />
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          <section aria-label={t(locale, 'board.title')} className="overflow-x-auto">
            <BoardCanvas />
          </section>
          <PanelInspector />
          <RowInspector />
        </div>

        <aside className="flex flex-col gap-4">
          <SpeciesPalette />
          <BoardSettings />
          <ComplexityMeter locale={locale} calc={calc} diagnostics={diagnostics} unit={unit} model={model} />
          <DiagnosticsPanel />
        </aside>
      </div>

      <ForkDialog />
    </main>
  )
}
```

`ComplexityMeter` keeps its phase-1 props exactly; only the values now come from the store, so its own diagnostics list and the new `DiagnosticsPanel` show the same data at two levels of detail. That duplication is intentional: the meter is the glanceable summary in the sidebar, the panel carries the targets.

- [ ] **Step 9: Run the shell test**

Run: `pnpm exec vitest run components/StudioShell.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 10: Full suite, typecheck, lint, production build**

Run: `pnpm exec vitest run && pnpm typecheck && pnpm lint && pnpm build`
Expected: all green. The build must not warn about server components: every new component starts with `'use client'`, and `app/page.tsx` stays a server component that renders the client shell.

- [ ] **Step 11: Verify by hand in the browser**

Run: `pnpm dev`, open `http://localhost:3000`, then check in order:
1. clicking a cell opens the fork dialog with a non-zero cost, and confirming repaints that cell only;
2. `Cmd+Z` restores it, `Shift+Cmd+Z` repaints it;
3. switching to inches re-labels every field, the meter and the panel widths at once;
4. editing the thickness changes weight and cost in the meter within one frame;
5. reload keeps the project (localStorage), and the copied link opens the same board in a private window.

- [ ] **Step 12: Commit**

```bash
git add components/DiagnosticsPanel.tsx components/DiagnosticsPanel.test.tsx components/StudioShell.tsx components/StudioShell.test.tsx lib/i18n/ru.ts lib/i18n/en.ts
git commit -m "feat(ui): панель диагностики и сборка редактора в единый экран студии"
```

---

### Task 12: Playwright smoke suite and CI job

**Files:**
- Modify: `package.json` (devDependency and two scripts)
- Create: `playwright.config.ts`
- Create: `e2e/editor.spec.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.gitignore`
- Modify: `eslint.config.mjs`

**Interfaces:**
- Consumes: the `data-testid` contract established by Tasks 7, 10 and 11: `board-canvas`, `species-<id>`, `fork-dialog`, `fork-confirm`, `fork-cancel`, `undo`, `redo`, `unit-mm`, `unit-in`, `board-thickness`, plus `rect[data-cell="<id>"]` from `BoardSvg`.
- Produces: `pnpm test:e2e`, a green `e2e` job in CI.

The suite runs against a real production build (`pnpm build && pnpm start`), because that is what Vercel serves and because `next dev` recompiles on first hit and makes the first navigation flaky.

- [ ] **Step 1: Install Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

Expected: `@playwright/test` appears under `devDependencies`, the Chromium bundle downloads.

- [ ] **Step 2: Add the scripts to `package.json`**

```json
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui"
```

Place them right after `"test:watch"` in the `scripts` object.

- [ ] **Step 3: Keep Playwright output out of git and out of lint**

Append to `.gitignore`:

```
# playwright
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
```

In `eslint.config.mjs`, add the report directories to the existing `globalIgnores([...])` array:

```js
    "test-results/**",
    "playwright-report/**",
```

- [ ] **Step 4: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const baseURL = `http://127.0.0.1:${PORT}`
const isCI = process.env['CI'] === 'true' || process.env['CI'] === '1'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Редактор рассчитан и на телефон: смоук гоняем в размере ноутбука, тачи покрыты pointer-событиями.
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
```

- [ ] **Step 5: Write the three smoke tests**

Create `e2e/editor.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

/** Стартовый проект - шахматка, панели переиспользуются, поэтому покраска всегда идёт через форк. */
async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

function cell(page: Page, id: string) {
  return page.locator(`rect[data-cell="${id}"]`)
}

async function paintWithPadauk(page: Page, cellId: string): Promise<void> {
  await page.getByTestId('species-padauk').click()
  await cell(page, cellId).click()
  await expect(page.getByTestId('fork-dialog')).toBeVisible()
  await page.getByTestId('fork-confirm').click()
  await expect(page.getByTestId('fork-dialog')).toBeHidden()
}

test('покраска ячейки меняет её цвет', async ({ page }) => {
  await openStudio(page)
  const target = cell(page, 'r0:0')
  const before = await target.getAttribute('fill')
  expect(before).not.toBe('#a8422a')

  await paintWithPadauk(page, 'r0:0')

  await expect(cell(page, 'r0:0')).toHaveAttribute('fill', '#a8422a')
  // Соседний ряд на той же панели остаётся прежним: разветвление тронуло только этот ряд.
  await expect(cell(page, 'r2:0')).toHaveAttribute('fill', before ?? '')
})

test('смена толщины доски пересчитывает счётчик сложности', async ({ page }) => {
  await openStudio(page)
  const meterSize = page.getByText(/Габарит:/)
  await expect(meterSize).toContainText('толщина 40 мм')

  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('60')
  await thickness.blur()

  await expect(meterSize).toContainText('толщина 60 мм')

  // Единицы влияют на всё разом: тот же счётчик переходит в дюймы.
  await page.getByTestId('unit-in').click()
  await expect(page.getByText(/Габарит:/)).toContainText('2.36"')
})

test('отмена возвращает покрашенную ячейку к прежней породе', async ({ page }) => {
  await openStudio(page)
  const before = await cell(page, 'r0:0').getAttribute('fill')

  await paintWithPadauk(page, 'r0:0')
  await expect(cell(page, 'r0:0')).toHaveAttribute('fill', '#a8422a')

  await page.getByTestId('undo').click()
  await expect(cell(page, 'r0:0')).toHaveAttribute('fill', before ?? '')

  await page.getByTestId('redo').click()
  await expect(cell(page, 'r0:0')).toHaveAttribute('fill', '#a8422a')
})
```

`#a8422a` is padauk's hex from `lib/species/index.ts`. The default checkerboard is 8 x 8 with 30 mm cells, so `r0:0` and `r2:0` both come from panel `A` before the fork and only `r0` is redirected to the clone after it.

- [ ] **Step 6: Run the suite locally**

Run: `pnpm test:e2e`
Expected: 3 passed. First run builds the app, so allow a couple of minutes. If the port is busy, kill the stale server (`lsof -ti tcp:3100 | xargs kill`) rather than changing the port.

- [ ] **Step 7: Confirm vitest still ignores the e2e directory**

Run: `pnpm exec vitest run`
Expected: the Playwright spec is not collected. `vitest.config.ts` lists explicit includes (`lib/**`, `components/**`, `app/**`), so `e2e/` is out of scope already and the config needs no change. If a future include is widened, add `exclude: ['e2e/**']`.

- [ ] **Step 8: Add the CI job**

Replace `.github/workflows/ci.yml` with:

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps chromium
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: ${{ !cancelled() }}
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

The `e2e` job runs in parallel with `check` and builds the app itself through `webServer`, so nothing is shared between them.

- [ ] **Step 9: Full local verification**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`
Expected: every command exits 0. This is the same sequence CI runs.

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts e2e/editor.spec.ts .github/workflows/ci.yml .gitignore eslint.config.mjs
git commit -m "test(e2e): смоук-тесты Playwright на покраску, размеры и отмену, отдельная работа в CI"
```

- [ ] **Step 11: Push and confirm the deploy**

```bash
git push origin main
```

Then check that both CI jobs are green and open the Vercel production URL: paint a cell, undo it, switch to inches and to English, reload and confirm the project survived.

---

## Self-Review

Run by the plan author against the phase-2 scope and the shipped phase-1 source.

**1. Scope coverage.** Every numbered item of the phase-2 brief maps to at least one task:

| Scope item | Tasks |
|---|---|
| Zustand + immer store, selection, undo/redo via patches | 1, 2 |
| localStorage debounce and URL hash sharing through `lib/persist` | 5 (writer, hash bootstrap), 10 (copy-link button) |
| Interactive SVG editor, paint, fork-confirm with `PaintCost` | 3 (store), 7 (canvas, dialog) |
| Species palette, 16 swatches | 7 |
| Hover highlight, touch basics | 7 (`pointerover`, `pointerleave`, `touch-manipulation`, pointer events cover touch) |
| Panel inspector: width, add/remove strip, `splitPanel` at mm, reorder | 4 (store), 8 (UI) |
| Rows list: thickness, panel assignment, flip/mirror, trim, add/remove | 4 (store), 9 (UI) |
| Board settings: target width/length/thickness, kerf, planing allowance, planer width | 2 (store), 10 (UI) |
| Unit toggle mm/inch affecting all displayed numbers, mm internal | 6 (conversion and field), 10 (toggle), 8 and 9 (inspectors read `unit`), 11 (meter gets `unit`) |
| Undo/redo buttons and keyboard | 10 |
| Live `validate()` diagnostics panel, localized, non-blocking | 5 (derived), 11 (panel) |
| Complexity meter stays live | 5 (memo feeds the existing `ComplexityMeter`), 11 (wired in the shell) |
| Playwright setup, config, CI step, 3 smoke tests | 12 |
| No flags, Russian default, English dictionary complete | Enforced by the global constraints; keys added in 6, 7, 8, 9, 10, 11; `lib/i18n/index.test.ts` fails the build on drift |

**2. Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N", no test described without its code. Every code step carries a complete block. The two places where a decision is deferred to the implementer are explicit and bounded: the `data-testid` fallback if the shadcn `Button` swallows unknown props (Task 7, Step 16) and dropping an unused import if `noUnusedLocals` complains (Task 4, Step 3).

**3. Type consistency against the real shipped API.** Checked against the files, not memory:

- `applyPaint(design, cell, speciesId)` returns the three-way union with `forkedPanelIds` and `cost` only on `kind: 'fork'`. Task 3 narrows before touching them.
- `PaintCost` fields are `extraGlueUps`, `extraCuts`, `extraLumberMBySpecies` (metres, keyed by `SpeciesId`). Task 7's dialog uses exactly those names.
- `splitPanel(design, panelId, elementIndex, atMm)` returns `Design` and throws `EngineError('SPLIT_OUT_OF_RANGE')`. Task 4 catches `EngineError` only.
- `validate(design, { shrinkageByPct, knownSpeciesIds })` matches `ValidateOptions` exactly; `shrinkageMap()` returns `Record<SpeciesId, number>` and `SPECIES.map(s => s.id)` gives `SpeciesId[]`. Task 5 passes both, which is what makes `UNKNOWN_SPECIES` fire.
- `BoardModel.panelLengthsMm` is `Readonly<Record<PanelId, number>>`; Task 8 indexes it with `?? 0` because of `noUncheckedIndexedAccess`.
- `Diagnostic.messageKey` is `string`, and `ComplexityMeter` already casts it to `MessageKey`; `DiagnosticsPanel` repeats that cast rather than inventing a new type.
- `formatMm(mm, unit, unitLabel, digits)` takes the localized label from the caller. Tasks 8 and 9 pass `t(locale, 'units.mm' | 'units.in')`, the same way `ComplexityMeter` does.
- `ComplexityMeter` props are unchanged (`locale`, `calc`, `diagnostics`, `unit`, `model`), and `unit: 'mm' | 'in'` is structurally identical to the new `UnitSystem`, so the shell passes the store value directly.
- `BoardSvg` already emits `data-cell={cell.id}`, which is what makes pointer delegation possible without touching the renderer's contract; the two new props are optional with `null` defaults so the phase-1 call sites and tests keep working.
- Store action names are used identically in every consumer: `setStripWidth`, `setStripSpecies`, `addStrip`, `removeStrip`, `splitStripAt`, `moveStrip`, `setRowThickness`, `setRowPanel`, `setRowTrim`, `toggleRowFlip`, `toggleRowMirror`, `addRow`, `removeRow`, `moveRow`, `setBoardWidthMm`, `setBoardLengthMm`, `setBoardThicknessMm`, `setKerfMm`, `setPlaningAllowanceMm`, `setPlanerWidthMm`, `setDesignName`, `loadDesign`, `resetStudio`, `undo`, `redo`.
- `lib/engine` is imported but never edited in any task. The only phase-1 files modified are `lib/units.ts`, `components/BoardSvg.tsx`, `components/StudioShell.tsx` and the two dictionaries.

**4. Known risks carried into execution.**

- immer `autoFreeze` deep-freezes the `Design` after the first commit. The engine only reads and spreads, and `parseDesign` rebuilds objects, so nothing mutates a frozen value. If a frozen-object error ever appears, the fix is `setAutoFreeze(false)` in `lib/store/history.ts`, not a change in the engine.
- The store singleton is created at module load with `makeCheckerboard()` so server and client render the same markup; restoring from the hash or localStorage happens in an effect inside `useStudioPersistence`, after hydration. Restoring during render would be a hydration mismatch.
- `commitValue` records root-key patches rather than deep ones for engine-produced designs. That is coarser than a hand-written path patch but still correct, still bounded by structural sharing, and it keeps the engine free of immer.
