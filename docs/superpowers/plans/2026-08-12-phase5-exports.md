# Phase 5: exporters (SVG, PNG, cut list, CSV, workshop PDF)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Day 5 of the 7-day plan. This phase closes the **last open MVP item** from README (`экспорт изображения`) and, in the same stroke, four of the contest bonus items that the spec lists as separate features: карта раскроя, пошаговая схема переклеек, PDF-инструкция, and мм/дюймы in the printed output. After this phase a woodworker downloads one PDF, walks to the shop, and builds the board without opening the app again: strip widths and species per panel, panel length with kerf and planing allowance and end trims already added, crosscut thicknesses per row, the order of the two glue-ups, and which rows get flipped or mirrored.

**Architecture:** the data flow of phases 1-4 does not change: `Design -> compile -> BoardModel -> {render2d, render3d, calc, validate}`. Phase 5 adds `lib/export`, a leaf module that sits **after** the engine and reads it, never writes to it. The split inside `lib/export` is by testability, and it is the single most important design decision of this phase:

- **Pure, no DOM, unit-tested in vitest:** `lib/export/svg.ts` (a `BoardModel` becomes an SVG *string*), `lib/export/cutlist.ts` (a `Design` becomes cut-plan data and an ordered step list), `lib/export/csv.ts` (cut plan becomes a CSV string), `lib/export/filename.ts`.
- **Browser-only, no unit tests, covered end to end by Playwright:** `lib/export/png.ts` (SVG string through `<canvas>` to a PNG `Blob`), `lib/export/pdf.ts` (jsPDF plus svg2pdf.js), `lib/export/pdfFont.ts` (fetch a TTF and register it in the jsPDF VFS), `lib/export/download.ts` (`Blob` plus `a[download]`).

Nothing in the pure half may import the browser half, and `lib/export/index.ts` therefore re-exports **only** the pure half. The browser half is always reached through a dynamic `import()` from the click handler. That is not a style preference: jsPDF plus svg2pdf.js is roughly 350 KB minified, it touches `window` at module scope, and a static import from a component would put it in the first-load bundle of a Next.js page that is server-rendered.

The SVG geometry is **not** duplicated. Phase 2 shipped `components/BoardSvg.tsx` with a `ROW_LABEL_MARGIN_MM` constant and a viewBox formula. This phase extracts both into `lib/render2d/layout.ts` and makes `BoardSvg.tsx` and `lib/export/svg.ts` import them, which is exactly what the spec means by "одна и та же сцена отдаёт React-элементы для интерфейса, строку для PNG, вход для PDF". "В экспорте выглядит иначе" then cannot happen, and a unit test pins it.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Zustand 5, immer, Tailwind CSS 4, shadcn/ui (`components/ui/*`), vitest + @testing-library/react, fast-check, Playwright, pnpm, Vercel. **Two new runtime dependencies, both lazy loaded:** `jspdf` and `svg2pdf.js`. **Two new static assets:** `public/fonts/PTSans-Regular.ttf` and `public/fonts/PTSans-Bold.ttf` (OFL), fetched at runtime only when the user clicks "PDF", so they cost zero bytes in the JS bundle.

## Global Constraints

Copied verbatim from `CLAUDE.md` and carried over from the phase-1, phase-2, phase-3 and phase-4 plans. Every task's requirements implicitly include this section.

- Em dash U+2014 is forbidden everywhere: source code, comments, commit messages, UI strings, this plan. Use a hyphen, a colon or parentheses instead. Any occurrence is a defect. **In phase 5 this extends to generated artefacts:** the CSV, the SVG caption and every string drawn into the PDF must be free of U+2014, and a unit test asserts it on the generated strings, not only on the dictionaries.
- All user-facing text and all git commit messages are in Russian. Technical terms stay in English.
- All internal dimensions are stored in millimetres as floating point numbers. Inches are presentation only, converted in exactly one place (`lib/units.ts`). **The PDF prints both**, through one helper, `bothUnits()`, which calls `formatMm` twice.
- Domain vocabulary is fixed: the board is made of strips (first glue-up), crosscuts, and a final re-glue. Kerf and allowances are always accounted for.
- `lib/engine` must have zero imports outside itself and the TypeScript standard library. **Phase 5 does not modify a single file under `lib/engine/`.** If an engine change looks necessary, stop and report instead of editing.
- Panel recursion depth is capped at 2 and the only supported cut angle is 0.
- Schema version at rest is `1`. `parseDesign` is the only reader used by web, CLI and OG route.
- No UI literals in components: every user-visible string goes through `t(locale, key)` with the key present in both `lib/i18n/ru.ts` and `lib/i18n/en.ts`.
- Russian is the default locale (`'ru'`); the English dictionary must be updated in the same commit as every new key (`en.ts` is typed against `keyof typeof ru`, so `pnpm typecheck` fails on drift, and `lib/i18n/index.test.ts` fails on both drift and em dashes).
- TypeScript is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. Array indexing yields `T | undefined` and must be narrowed, never asserted with `!`.
- Node >= 20.11, pnpm >= 9. CI runs Node 22 and executes `pnpm typecheck && pnpm lint && pnpm test && pnpm build` plus a separate `e2e` job.
- Every task ends with a commit. Small commits, Russian messages, conventional prefix (`feat:`, `test:`, `chore:`, `fix:`).

**Phase-5 additions to the constraint list, equally non-negotiable:**

- **The pure half of `lib/export` may not touch the DOM.** No `document`, no `window`, no `Blob`, no `URL`, no `canvas`. `lib/export/purity.test.ts` reads the source files off disk and fails on those identifiers, the same trick `lib/generators/purity.test.ts` already uses for `Math.random`.
- **`lib/export/index.ts` re-exports only the pure half.** If `components/ExportPanel.tsx` could reach `pdf.ts` through a barrel import, the bundle split would silently regress and nobody would notice until the Lighthouse score dropped.
- **jsPDF and svg2pdf.js are imported dynamically, inside a function body, never at module scope.** `pnpm build` output is checked: the first-load JS for `/` must not grow by more than 2 KB in this phase.
- **The PDF is generated fully client-side.** No API route, no serverless PDF rendering, no network round trip beyond the two font files off the same origin.
- **Downloads are user-gesture initiated.** Every export runs from a click handler, so Safari and Firefox do not swallow the `a[download]`.

## Repo quirks to respect (learned in phases 1-4, not negotiable)

1. **`react-hooks/set-state-in-effect`** is an error in this ESLint config. Never mirror props or store values into `useState` from a `useEffect`. `ExportPanel` contains **zero** `useEffect` calls: the busy flag and the error flag are set inside async click handlers only.
2. **`exactOptionalPropertyTypes: true`.** `{ foo: undefined }` is not assignable to `{ foo?: string }`. Build optional fields with a conditional spread: `...(value === undefined ? {} : { foo: value })`. In this phase it bites on `BoardSvgOptions` (`title`, `caption`, `rowLabels`), `PngOptions` (`scale`, `background`) and `GlueUpStep.panelId`. Read optionals with `??` defaults instead of passing `undefined` through.
3. **`act()` around out-of-band store mutations in tests.** `act(() => { useStudio.getState().setLocale('en') })` when a component is mounted. Calls in `beforeEach` before any `render` do not need it.
4. **Vitest include globs** are `['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx', 'app/**/*.test.tsx']`. `lib/export/*.test.ts` is **already matched**. **Do not touch `vitest.config.ts`.**
5. **jsdom has no canvas 2D context.** `HTMLCanvasElement.prototype.getContext` returns `null`, `canvas.toBlob` does not exist, and `new Image()` never fires `onload` for an object URL. Therefore `png.ts` and `pdf.ts` have **no** `.test.ts` file at all, and `ExportPanel.test.tsx` mocks them with `vi.mock('@/lib/export/png')`. Chromium under Playwright has a real 2D context, so both paths are covered in `e2e/export.spec.ts`. This is the same split phase 4 used for `components/photoDecode.ts`.
6. **`data-testid` on shadcn `Button`.** `components/ui/button.tsx` wraps `@base-ui/react/button` and forwards unknown props, so `data-testid` reaches the DOM. Do not modify the UI primitive.
7. **Native DOM assertions.** The suite uses `@testing-library/jest-dom`, and existing tests assert with `toHaveAttribute` / `toHaveValue` on real DOM nodes. Keep that style; do not introduce snapshot testing for the SVG string (assert on structure: rect count, fill values, viewBox).
8. **`components/ui/` holds exactly `badge`, `button`, `card`, `separator`.** There is no spinner and no toast. The busy state is a disabled `Button` whose label switches to `export.busy`; the error state is a `<p role="alert">`. Do not run `shadcn add` in this phase.
9. **`t()` formats numeric params through `Number(value.toFixed(2))`.** Passing a raw millimetre float into a message therefore silently rounds to two decimals. Everything dimensional in this phase is pre-formatted into a **string** by `formatMm` / `bothUnits` before it reaches `t()`, so the rounding rule lives in one place.
10. **`derive()` is a one-entry memo keyed by document identity.** `useDerived()` inside `ExportPanel` costs nothing: the shell already called it, and the design object is immutable, so it is a reference hit.
11. **Playwright downloads.** `playwright.config.ts` sets no `acceptDownloads`, which means the default (`true`) applies. Use `const [download] = await Promise.all([page.waitForEvent('download'), button.click()])` and read the file through `await download.path()` plus `node:fs`. Never assert on the suggested filename alone.
12. **The e2e web server runs `pnpm build && pnpm start`.** Anything that only works in `next dev` (for example a font served from outside `public/`) will pass locally and fail in CI. The fonts go in `public/fonts/`.

## Phase 1-4 API this plan builds on (verified against the shipped source, not memory)

```ts
// lib/engine/types.ts
export const SCHEMA_VERSION = 1 as const
export interface Strip { readonly kind: 'strip'; readonly speciesId: SpeciesId; readonly widthMm: number }
export interface SliceRef { readonly kind: 'sliceRef'; readonly panelId: PanelId; readonly thicknessMm: number; readonly angleDeg: number; readonly offsetMm: number }
export type PanelElement = Strip | SliceRef
export interface Panel { readonly id: PanelId; readonly elements: readonly PanelElement[] }
export interface Row { readonly id: RowId; readonly panelId: PanelId; readonly thicknessMm: number; readonly angleDeg: number; readonly flip: boolean; readonly mirror: boolean; readonly trimMm: number }
export interface BoardSpec { readonly targetWidthMm: number; readonly targetLengthMm: number; readonly thicknessMm: number }
export interface Design {
  readonly schemaVersion: 1; readonly id: string; readonly name: string
  readonly species: readonly SpeciesId[]; readonly panels: readonly Panel[]; readonly rows: readonly Row[]
  readonly board: BoardSpec; readonly kerfMm: number; readonly planingAllowanceMm: number; readonly planerWidthMm: number
}
export interface CellOrigin { readonly rowId: RowId; readonly panelId: PanelId; readonly elementIndex: number; readonly depth: 0 | 1; readonly innerPanelId?: PanelId; readonly innerElementIndex?: number }
export interface Cell { readonly id: string; readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number; readonly speciesId: SpeciesId; readonly grain: 'end'; readonly origin: CellOrigin }
export interface BoardModel {
  readonly widthMm: number; readonly lengthMm: number; readonly thicknessMm: number
  readonly cells: readonly Cell[]; readonly panelLengthsMm: Readonly<Record<PanelId, number>>
  readonly glueUpCount: number; readonly cutCount: number; readonly truncated: boolean
}
export interface PanelSlice {
  readonly thicknessMm: number; readonly trimMm: number; readonly angleDeg: number
  readonly consumer:
    | { readonly kind: 'row'; readonly rowId: RowId }
    | { readonly kind: 'sliceRef'; readonly panelId: PanelId; readonly elementIndex: number }
}
export const MIN_STRIP_WIDTH_MM = 4; export const DEFAULT_PLANER_WIDTH_MM = 330
export const BOARD_MIN_MM = 50; export const BOARD_MAX_MM = 1200
export const THICKNESS_MIN_MM = 10; export const THICKNESS_MAX_MM = 80
export const MAX_CELLS = 4000; export const WARN_CELLS = 2000; export const GEOM_EPS_MM = 1e-6

// lib/engine/index.ts (public surface, untouched in this phase)
export function compile(design: Design): BoardModel
export interface RowBand { readonly id: RowId; readonly topMm: number; readonly heightMm: number }
export function rowBandsMm(design: Design): RowBand[]
export function validate(design: Design, opts?: ValidateOptions): Diagnostic[]
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean
export function isStrip(el: PanelElement): el is Strip
export function isSliceRef(el: PanelElement): el is SliceRef
export function elementExtentMm(el: PanelElement): number      // widthMm | thicknessMm
export function panelWidthMm(panel: Panel): number             // sum of elementExtentMm
export function findPanel(design: Design, panelId: PanelId): Panel | undefined
export function getPanel(design: Design, panelId: PanelId): Panel          // throws EngineError
export function slicesOfPanel(design: Design, panelId: PanelId): PanelSlice[]
export function panelLengthMm(design: Design, panelId: PanelId): number
export function usageCount(design: Design, panelId: PanelId): number
export function baseDesign(...): Design; export function stripsPanel(...): Panel   // fixtures

// lib/calc/index.ts
export interface LumberNeed { readonly speciesId: SpeciesId; readonly rawVolumeMm3: number; readonly boardFeet: number; readonly linearMeters: number; readonly costUsd: number; readonly weightKg: number }
export interface CalcResult {
  readonly bySpecies: readonly LumberNeed[]; readonly totalBoardFeet: number; readonly totalCostUsd: number
  readonly totalWeightKg: number; readonly finishedVolumeMm3: number; readonly rawVolumeMm3: number
  readonly wastePct: number; readonly glueUpCount: number; readonly cutCount: number
}
export function calcProject(design: Design, model: BoardModel): CalcResult

// lib/units.ts
export type UnitSystem = 'mm' | 'in'
export const MM_PER_INCH = 25.4
export function mmToInch(mm: number): number
export function formatMm(mm: number, unit: 'mm' | 'in', unitLabel: string, digits?: number): string  // digits default 1; inches always 2 dp plus a "

// lib/species/index.ts
export interface Species { readonly id: SpeciesId; readonly nameRu: string; readonly nameEn: string; readonly hex: string; readonly lab: Lab; readonly densityKgM3: number; readonly pricePerBoardFootUsd: number; readonly shrinkageTangentialPct: number; readonly shrinkageRadialPct: number; readonly foodSafe: boolean }
export const SPECIES: readonly Species[]                       // 16 entries
export const SPECIES_BY_ID: ReadonlyMap<SpeciesId, Species>
export function speciesHex(id: SpeciesId): string              // '#cccccc' for unknown, never throws
export function getSpeciesById(id: SpeciesId): Species         // throws EngineError

// lib/i18n/index.ts
export type Locale = 'ru' | 'en'
export type MessageKey = keyof typeof ru
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string

// lib/store/studio.ts
export type StudioView = 'editor' | 'templates' | 'generate' | 'photo' | 'view3d'
export function selectDesign(s: StudioState): Design
export const useStudio: StudioStore                            // s.locale, s.unit, s.view, ...

// lib/store/derived.ts
export interface Derived { readonly model: BoardModel; readonly calc: CalcResult; readonly diagnostics: readonly Diagnostic[] }
export function derive(design: Design): Derived
export function useDerived(): Derived

// components/BoardSvg.tsx (phase 2, plus the rowLabels prop from phase 2 day 2)
export function BoardSvg(props: {
  model: BoardModel; locale: Locale; maxPx?: number
  highlightCellId?: string | null; selectedCellId?: string | null
  rowLabels?: readonly RowBand[]
}): JSX.Element
```

Five engine facts that shape every line of this phase:

- **`panelLengthMm` already contains everything the shop needs.** It is `sum(thicknessMm + planingAllowanceMm + trimMm) + kerfMm * (n - 1)` over `slicesOfPanel`. The cut list must print that number as *the* length to rip the strips to, and must show the breakdown so the user trusts it. Do not re-derive it; call it.
- **`slicesOfPanel` returns rows *and* sliceRef consumers in that order.** A panel that is both crosscut into board rows and sliced into another panel gets both kinds of consumer in one list. The cut map has to label them differently: a row consumer maps to a numbered board row, a sliceRef consumer maps to "вклейка в щит P2".
- **`rowBandsMm` skips rows whose panel is missing**, so the visible row numbering in the editor is the index in *that* array, not in `design.rows`. The PDF must number rows the same way or the printed instruction will disagree with the screen. Build the row-number lookup from `rowBandsMm(design)`, never from `design.rows.indexOf`.
- **`BoardModel.truncated`** is `true` when compile hit `MAX_CELLS`. An export of a truncated model is a lie. The PDF prints a warning line in that case and the SVG caption carries it too.
- **`speciesHex` never throws** and returns `#cccccc` for an unknown id, while `getSpeciesById` throws. Exporters use `speciesHex` and `SPECIES_BY_ID.get`, never `getSpeciesById`, because an export must not crash on a design that validate has already flagged.

## Decision: the print-HTML fallback is deferred, not built

The spec names the HTML print page as the mitigation for the main technical risk ("PDF: связка jsPDF и svg2pdf.js капризна к шрифтам и трансформациям", D5 line: "решение о переключении принимается вечером D5 по факту"). This plan **does not build it in the main path**, for three reasons.

First, the risk it hedges is retired inside Task 8, not after it: the acceptance criteria there include a real Chromium run that opens the produced PDF and asserts Cyrillic glyphs survive, so we learn whether jsPDF works before we would have to choose.

Second, the fallback is not free. A print sheet is a second full layout of the same three pages, a second set of i18n keys, a print stylesheet that fights Tailwind's preflight, and a page that must render off-screen without breaking the editor's layout. That is most of a day, and day 6 is already spent on the viral layer and the English locale.

Third, the risky part of jsPDF is drawing *vector SVG through svg2pdf*, and Task 8 deliberately restricts svg2pdf to exactly one call (the page-1 board preview). Everything else, the strip-stack diagrams, the row-order diagram, the tables, is drawn with plain `doc.rect` and `doc.text`, which cannot fail on transforms. If svg2pdf misbehaves, the degradation is "page 1 shows the board as a raster PNG instead of vector", not "no PDF".

**Appendix A** carries the contingency in enough detail that it can be executed in about three hours if the Task 8 gate fails. The go / no-go is step 8.10.

---

## Task 6: shared 2D layout, standalone SVG export, PNG rasterisation, download helpers

**Goal:** one function turns a `BoardModel` into a self-contained SVG string that opens in Inkscape, and another turns that string into a PNG `Blob` at an arbitrary scale. The SVG that the editor draws on screen and the SVG that goes into the file share their geometry, by construction.

**Files:**

- `lib/render2d/layout.ts` (new): `ROW_LABEL_MARGIN_MM`, `boardLayout()`.
- `lib/render2d/layout.test.ts` (new).
- `components/BoardSvg.tsx` (edit): drop the local constant and the inline arithmetic, import `boardLayout`.
- `lib/export/svg.ts` (new, pure).
- `lib/export/svg.test.ts` (new).
- `lib/export/filename.ts` (new, pure) + `lib/export/filename.test.ts`.
- `lib/export/png.ts` (new, browser only, no unit test).
- `lib/export/download.ts` (new, browser only, no unit test).
- `lib/export/purity.test.ts` (new).
- `lib/export/index.ts` (new barrel, pure half only).

**Interfaces:**

```ts
// lib/render2d/layout.ts
/** Ширина колонки с номерами рядов, мм в системе координат viewBox. */
export const ROW_LABEL_MARGIN_MM = 14

export interface BoardLayout {
  /** Сдвиг доски вправо: 0 без колонки номеров, ROW_LABEL_MARGIN_MM с ней. */
  readonly marginMm: number
  readonly totalWidthMm: number
  readonly totalHeightMm: number
  readonly viewBox: string
  /** Множитель мм -> px, чтобы наибольшая сторона уложилась в maxPx. */
  readonly scale: number
  readonly widthPx: number
  readonly heightPx: number
}

export function boardLayout(
  model: Pick<BoardModel, 'widthMm' | 'lengthMm'>,
  options?: { readonly maxPx?: number; readonly withRowLabels?: boolean; readonly captionMm?: number },
): BoardLayout

// lib/export/svg.ts
export interface BoardSvgOptions {
  /** Заголовок над доской. Пустая строка и undefined одинаково означают «без заголовка». */
  readonly title?: string
  /** Подпись под доской: габарит, породы, дата. Ложится в одну или несколько строк. */
  readonly caption?: string
  readonly maxPx?: number
  readonly background?: string
  readonly rowLabels?: readonly RowBand[]
}

export interface RenderedSvg {
  readonly svg: string
  readonly widthPx: number
  readonly heightPx: number
}

export function renderBoardSvg(model: BoardModel, options?: BoardSvgOptions): RenderedSvg
export function boardSvgString(model: BoardModel, options?: BoardSvgOptions): string
export function escapeXml(text: string): string

// lib/export/filename.ts
export function safeFileName(designName: string, extension: string): string

// lib/export/png.ts (browser)
export interface PngOptions { readonly scale?: number; readonly background?: string }
export function svgToPngBlob(rendered: RenderedSvg, options?: PngOptions): Promise<Blob>

// lib/export/download.ts (browser)
export function downloadBlob(blob: Blob, fileName: string): void
export function downloadText(text: string, fileName: string, mimeType: string): void
```

**Steps:**

- [ ] **6.1 Failing test for the shared layout.** Create `lib/render2d/layout.test.ts`. It must fail because the module does not exist yet.

```ts
import { describe, expect, it } from 'vitest'
import { ROW_LABEL_MARGIN_MM, boardLayout } from './layout'

const model = { widthMm: 300, lengthMm: 450 }

describe('boardLayout', () => {
  it('без колонки номеров не добавляет отступ', () => {
    const l = boardLayout(model, { maxPx: 900 })
    expect(l.marginMm).toBe(0)
    expect(l.totalWidthMm).toBe(300)
    expect(l.viewBox).toBe('0 0 300 450')
  })

  it('с колонкой номеров расширяет viewBox ровно на маржу', () => {
    const l = boardLayout(model, { maxPx: 900, withRowLabels: true })
    expect(l.marginMm).toBe(ROW_LABEL_MARGIN_MM)
    expect(l.totalWidthMm).toBe(300 + ROW_LABEL_MARGIN_MM)
    expect(l.viewBox).toBe(`0 0 ${300 + ROW_LABEL_MARGIN_MM} 450`)
  })

  it('масштабирует по наибольшей стороне, включая подпись', () => {
    const l = boardLayout(model, { maxPx: 900, captionMm: 50 })
    expect(l.totalHeightMm).toBe(500)
    expect(l.scale).toBeCloseTo(900 / 500, 10)
    expect(l.heightPx).toBeCloseTo(900, 6)
    expect(l.widthPx).toBeCloseTo(300 * (900 / 500), 6)
  })

  it('нулевая доска не даёт NaN и не делит на ноль', () => {
    const l = boardLayout({ widthMm: 0, lengthMm: 0 }, { maxPx: 640 })
    expect(Number.isFinite(l.scale)).toBe(true)
    expect(l.widthPx).toBe(0)
    expect(l.heightPx).toBe(0)
  })
})
```

- [ ] **6.2 Implement `lib/render2d/layout.ts`.**

```ts
import type { BoardModel } from '@/lib/engine'

/** Ширина колонки с номерами рядов, мм в системе координат viewBox. */
export const ROW_LABEL_MARGIN_MM = 14

export interface BoardLayout {
  readonly marginMm: number
  readonly totalWidthMm: number
  readonly totalHeightMm: number
  readonly viewBox: string
  readonly scale: number
  readonly widthPx: number
  readonly heightPx: number
}

export interface BoardLayoutOptions {
  readonly maxPx?: number
  readonly withRowLabels?: boolean
  /** Дополнительная высота под заголовок и подпись, мм. Экран её не использует, экспорт использует. */
  readonly captionMm?: number
}

/**
 * Единственное место, где считается геометрия 2D-сцены доски.
 * И экранный BoardSvg, и экспортный renderBoardSvg берут числа отсюда,
 * поэтому «в экспорте выглядит иначе» не может случиться незаметно.
 */
export function boardLayout(
  model: Pick<BoardModel, 'widthMm' | 'lengthMm'>,
  options: BoardLayoutOptions = {},
): BoardLayout {
  const maxPx = options.maxPx ?? 640
  const marginMm = options.withRowLabels === true ? ROW_LABEL_MARGIN_MM : 0
  const captionMm = options.captionMm ?? 0
  const totalWidthMm = model.widthMm + marginMm
  const totalHeightMm = model.lengthMm + captionMm
  const longest = Math.max(totalWidthMm, totalHeightMm)
  // Пустая модель приходит из compile при битом документе: масштаб 0 честнее NaN.
  const scale = longest > 0 ? maxPx / longest : 0
  return {
    marginMm,
    totalWidthMm,
    totalHeightMm,
    viewBox: `0 0 ${totalWidthMm} ${totalHeightMm}`,
    scale,
    widthPx: totalWidthMm * scale,
    heightPx: totalHeightMm * scale,
  }
}
```

- [ ] **6.3 Rewire `components/BoardSvg.tsx` onto the shared layout.** The rendered output must be byte-identical to what phase 2 shipped: same `viewBox`, same `width`/`height`, same margin behaviour. `components/BoardSvg.test.tsx` is the regression net and must stay green **without being edited**.

```diff
-import type { BoardModel, RowBand } from '@/lib/engine'
+import type { BoardModel, RowBand } from '@/lib/engine'
 import { t, type Locale } from '@/lib/i18n'
+import { ROW_LABEL_MARGIN_MM, boardLayout } from '@/lib/render2d/layout'
 import { speciesHex } from '@/lib/species'
-
-/** Ширина колонки с номерами рядов, мм в системе координат viewBox. */
-const ROW_LABEL_MARGIN_MM = 14
@@
   const hasLabels = Boolean(rowLabels && rowLabels.length > 0)
-  const marginMm = hasLabels ? ROW_LABEL_MARGIN_MM : 0
-  const totalWidthMm = model.widthMm + marginMm
-  const scale = maxPx / Math.max(totalWidthMm, model.lengthMm)
+  const layout = boardLayout(model, { maxPx, withRowLabels: hasLabels })
+  const marginMm = layout.marginMm
 
   return (
     <svg
-      viewBox={`0 0 ${totalWidthMm} ${model.lengthMm}`}
-      width={totalWidthMm * scale}
-      height={model.lengthMm * scale}
+      viewBox={layout.viewBox}
+      width={layout.widthPx}
+      height={layout.heightPx}
```

`ROW_LABEL_MARGIN_MM` stays imported because the row-label `<text>` uses `marginMm / 2`, which now comes off `layout`. If the import ends up unused after the edit, delete it: `noUnusedLocals` is on.

- [ ] **6.4 Failing test for the SVG string.** Create `lib/export/svg.test.ts`.

```ts
import { describe, expect, it } from 'vitest'
import { compile, rowBandsMm } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { speciesHex } from '@/lib/species'
import { ROW_LABEL_MARGIN_MM } from '@/lib/render2d/layout'
import { boardSvgString, escapeXml, renderBoardSvg } from './svg'

const design = makeCheckerboard()
const model = compile(design)

function countRects(svg: string): number {
  return svg.split('<rect').length - 1
}

describe('renderBoardSvg', () => {
  it('отдаёт самостоятельный документ с xmlns', () => {
    const { svg } = renderBoardSvg(model)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true)
  })

  it('рисует по прямоугольнику на ячейку плюс подложку', () => {
    const { svg } = renderBoardSvg(model)
    expect(countRects(svg)).toBe(model.cells.length + 1)
  })

  it('красит ячейки цветами пород', () => {
    const { svg } = renderBoardSvg(model)
    const first = model.cells[0]
    expect(first).toBeDefined()
    if (first) expect(svg).toContain(`fill="${speciesHex(first.speciesId)}"`)
  })

  it('без подписи и заголовка высота равна длине доски', () => {
    const { svg } = renderBoardSvg(model)
    expect(svg).toContain(`viewBox="0 0 ${model.widthMm} ${model.lengthMm}"`)
  })

  it('заголовок и подпись увеличивают viewBox и попадают в текст', () => {
    const { svg } = renderBoardSvg(model, { title: 'Шахматка', caption: '300 × 450 мм' })
    expect(svg).toContain('>Шахматка<')
    expect(svg).toContain('>300 × 450 мм<')
    expect(svg).not.toContain(`viewBox="0 0 ${model.widthMm} ${model.lengthMm}"`)
  })

  it('колонка номеров рядов сдвигает доску и печатает номера', () => {
    const bands = rowBandsMm(design)
    const { svg } = renderBoardSvg(model, { rowLabels: bands })
    expect(svg).toContain(`viewBox="0 0 ${model.widthMm + ROW_LABEL_MARGIN_MM} ${model.lengthMm}"`)
    expect(svg).toContain(`>${bands.length}<`)
  })

  it('пиксельный размер согласован с maxPx', () => {
    const r = renderBoardSvg(model, { maxPx: 1200 })
    expect(Math.max(r.widthPx, r.heightPx)).toBeCloseTo(1200, 6)
  })

  it('экранирует спецсимволы в заголовке', () => {
    const { svg } = renderBoardSvg(model, { title: 'A & B <тест> "кавычки"' })
    expect(svg).toContain('A &amp; B &lt;тест&gt; &quot;кавычки&quot;')
    expect(svg).not.toContain('<тест>')
  })

  it('никогда не содержит длинного тире', () => {
    const { svg } = renderBoardSvg(model, { title: 'Доска', caption: 'габарит 300 × 450' })
    expect(svg.includes(String.fromCharCode(0x2014))).toBe(false)
  })

  it('пустая модель отдаёт валидный пустой svg, а не бросает', () => {
    const empty = { ...model, cells: [], widthMm: 0, lengthMm: 0 }
    expect(() => renderBoardSvg(empty)).not.toThrow()
    expect(renderBoardSvg(empty).svg).toContain('<svg')
  })
})

describe('escapeXml', () => {
  it('покрывает пять сущностей', () => {
    expect(escapeXml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&apos;')
  })
})

describe('boardSvgString', () => {
  it('это тонкая обёртка над renderBoardSvg', () => {
    expect(boardSvgString(model)).toBe(renderBoardSvg(model).svg)
  })
})
```

- [ ] **6.5 Implement `lib/export/svg.ts`.** String building, not `ReactDOMServer`: `react-dom/server` is a server-only entry, it would drag React into the export path, and it produces attributes we would have to post-process anyway.

```ts
import type { BoardModel, RowBand } from '@/lib/engine'
import { boardLayout } from '@/lib/render2d/layout'
import { speciesHex } from '@/lib/species'

/** Высота строки заголовка и подписи в миллиметрах сцены. */
const TITLE_MM = 12
const CAPTION_MM = 9
const TEXT_PADDING_MM = 4

export interface BoardSvgOptions {
  readonly title?: string
  readonly caption?: string
  readonly maxPx?: number
  readonly background?: string
  readonly rowLabels?: readonly RowBand[]
}

export interface RenderedSvg {
  readonly svg: string
  readonly widthPx: number
  readonly heightPx: number
}

const XML_ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

export function escapeXml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char)
}

/** Число в атрибут: без хвостов вида 0.30000000000000004, которые раздувают файл. */
function num(value: number): string {
  return String(Number(value.toFixed(3)))
}

/**
 * Самостоятельный SVG-документ доски: открывается в браузере и в Inkscape,
 * годится как вход для canvas (PNG) и для svg2pdf (PDF).
 * Чистая функция: ни одного обращения к DOM, поэтому тестируется в vitest напрямую.
 */
export function renderBoardSvg(model: BoardModel, options: BoardSvgOptions = {}): RenderedSvg {
  const title = options.title ?? ''
  const caption = options.caption ?? ''
  const background = options.background ?? '#ffffff'
  const labels = options.rowLabels ?? []
  const hasLabels = labels.length > 0
  const headMm = title === '' ? 0 : TITLE_MM + TEXT_PADDING_MM
  const footMm = caption === '' ? 0 : CAPTION_MM + TEXT_PADDING_MM

  const layout = boardLayout(model, {
    ...(options.maxPx === undefined ? {} : { maxPx: options.maxPx }),
    withRowLabels: hasLabels,
    captionMm: headMm + footMm,
  })

  const parts: string[] = []
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${layout.viewBox}"` +
      ` width="${num(layout.widthPx)}" height="${num(layout.heightPx)}">`,
  )
  parts.push(`<rect x="0" y="0" width="${num(layout.totalWidthMm)}" height="${num(layout.totalHeightMm)}" fill="${background}"/>`)

  if (title !== '') {
    parts.push(
      `<text x="${num(layout.totalWidthMm / 2)}" y="${num(TITLE_MM * 0.8)}" text-anchor="middle"` +
        ` font-family="sans-serif" font-size="${num(TITLE_MM * 0.8)}" fill="#111111">${escapeXml(title)}</text>`,
    )
  }

  parts.push(`<g transform="translate(${num(layout.marginMm)} ${num(headMm)})">`)
  for (const cell of model.cells) {
    parts.push(
      `<rect x="${num(cell.xMm)}" y="${num(cell.yMm)}" width="${num(cell.widthMm)}" height="${num(cell.heightMm)}"` +
        ` fill="${speciesHex(cell.speciesId)}" stroke="rgba(0,0,0,0.18)" stroke-width="0.4"/>`,
    )
  }
  parts.push('</g>')

  if (hasLabels) {
    labels.forEach((band, index) => {
      const fontMm = Math.min(6, Math.max(3, band.heightMm * 0.4))
      parts.push(
        `<text x="${num(layout.marginMm / 2)}" y="${num(headMm + band.topMm + band.heightMm / 2)}"` +
          ` text-anchor="middle" dominant-baseline="middle" font-family="sans-serif"` +
          ` font-size="${num(fontMm)}" fill="#111111">${index + 1}</text>`,
      )
    })
  }

  if (caption !== '') {
    parts.push(
      `<text x="${num(layout.totalWidthMm / 2)}" y="${num(layout.totalHeightMm - CAPTION_MM * 0.25)}"` +
        ` text-anchor="middle" font-family="sans-serif" font-size="${num(CAPTION_MM * 0.7)}"` +
        ` fill="#444444">${escapeXml(caption)}</text>`,
    )
  }

  parts.push('</svg>')
  return { svg: parts.join(''), widthPx: layout.widthPx, heightPx: layout.heightPx }
}

export function boardSvgString(model: BoardModel, options: BoardSvgOptions = {}): string {
  return renderBoardSvg(model, options).svg
}
```

Note the deliberate omissions relative to the on-screen component: no `role`, no `aria-label`, no `className`, no `data-cell`, no selection or hover stroke. A file has no interaction state, and `class` attributes referencing Tailwind would be dead weight in an SVG opened outside the app.

- [ ] **6.6 Failing test and implementation for `lib/export/filename.ts`.**

```ts
// lib/export/filename.test.ts
import { describe, expect, it } from 'vitest'
import { safeFileName } from './filename'

describe('safeFileName', () => {
  it('сохраняет кириллицу и пробелы превращает в дефисы', () => {
    expect(safeFileName('Моя доска', 'png')).toBe('Моя-доска.png')
  })
  it('вычищает символы, недопустимые в имени файла', () => {
    expect(safeFileName('a/b\\c:d*e?f"g<h>i|j', 'svg')).toBe('a-b-c-d-e-f-g-h-i-j.svg')
  })
  it('схлопывает повторы и обрезает края', () => {
    expect(safeFileName('  ---доска---  ', 'csv')).toBe('доска.csv')
  })
  it('пустое имя даёт нейтральное', () => {
    expect(safeFileName('   ', 'pdf')).toBe('endgrain.pdf')
  })
  it('ограничивает длину', () => {
    expect(safeFileName('я'.repeat(200), 'pdf').length).toBeLessThanOrEqual(64 + 4)
  })
})
```

```ts
// lib/export/filename.ts
const MAX_STEM = 64

/**
 * Имя скачиваемого файла из названия проекта.
 * Кириллица остаётся: современные браузеры и файловые системы её держат,
 * а транслитерация сделала бы «Шахматка» нечитаемой в папке «Загрузки».
 */
export function safeFileName(designName: string, extension: string): string {
  const stem = designName
    // Пробел и дефис стоят последними в классе символов: иначе «[ -<]» стало бы диапазоном
    // от пробела до «<» и съело бы цифры, точки и скобки.
    .replace(/[<>:"/\\|?* -]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_STEM)
    .replace(/-+$/g, '')
  return `${stem === '' ? 'endgrain' : stem}.${extension}`
}
```

- [ ] **6.7 Implement `lib/export/download.ts`.** No unit test: jsdom has no real object URLs and asserting that `a.click()` was called would test the mock, not the behaviour. Covered by `e2e/export.spec.ts`.

```ts
/**
 * Скачивание файла из браузера. Только этот модуль во всём lib/export
 * знает про document и URL, поэтому только он не покрыт vitest (см. purity.test.ts).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Отзываем на следующем тике: Safari успевает начать загрузку только после возврата из клика.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

export function downloadText(text: string, fileName: string, mimeType: string): void {
  downloadBlob(new Blob([text], { type: mimeType }), fileName)
}
```

- [ ] **6.8 Implement `lib/export/png.ts`.**

```ts
import type { RenderedSvg } from './svg'

export interface PngOptions {
  /** Множитель разрешения поверх пиксельного размера сцены. 2 даёт «ретину», 4 годится для печати. */
  readonly scale?: number
  readonly background?: string
}

const SVG_MIME = 'image/svg+xml;charset=utf-8'

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('svg image failed to load'))
    image.src = url
  })
}

/**
 * SVG-строка -> PNG Blob через canvas. Только браузер: в jsdom нет 2D-контекста и нет toBlob,
 * поэтому модуль не покрыт unit-тестами и живёт под e2e/export.spec.ts.
 * Blob-URL, а не data:URI: у data:URI в Chromium есть предел длины, а наши доски бывают на 4000 ячеек.
 */
export async function svgToPngBlob(rendered: RenderedSvg, options: PngOptions = {}): Promise<Blob> {
  const scale = options.scale ?? 2
  const width = Math.max(1, Math.round(rendered.widthPx * scale))
  const height = Math.max(1, Math.round(rendered.heightPx * scale))

  const url = URL.createObjectURL(new Blob([rendered.svg], { type: SVG_MIME }))
  try {
    const image = await loadImage(url)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2d context unavailable')
    // Подложка обязательна: без неё PNG выходит с прозрачным фоном и в мессенджерах чернеет.
    ctx.fillStyle = options.background ?? '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))), 'image/png')
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}
```

- [ ] **6.9 Barrel and purity test.**

```ts
// lib/export/index.ts
// Только чистая половина. png/pdf/download сюда не попадают намеренно:
// статический импорт из компонента утащил бы jspdf в первый бандл страницы.
export { renderBoardSvg, boardSvgString, escapeXml, type BoardSvgOptions, type RenderedSvg } from './svg'
export { safeFileName } from './filename'
```

```ts
// lib/export/purity.test.ts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PURE_FILES = ['svg.ts', 'filename.ts', 'cutlist.ts', 'csv.ts', 'index.ts']
const FORBIDDEN = ['document.', 'window.', 'new Blob', 'URL.createObjectURL', 'canvas', 'Math.random', 'Date.now']

describe('чистая половина lib/export', () => {
  for (const file of PURE_FILES) {
    it(`${file} не трогает DOM и не зависит от окружения`, () => {
      const source = readFileSync(join(process.cwd(), 'lib/export', file), 'utf8')
      for (const needle of FORBIDDEN) expect(source, `${file} содержит ${needle}`).not.toContain(needle)
    })
  }

  it('барель не тянет браузерные модули', () => {
    const source = readFileSync(join(process.cwd(), 'lib/export/index.ts'), 'utf8')
    for (const browserOnly of ['./png', './pdf', './download', './pdfFont']) {
      expect(source).not.toContain(browserOnly)
    }
  })
})
```

`cutlist.ts` and `csv.ts` are listed before they exist, so this test fails until Task 7. Add them to `PURE_FILES` in step 7.9 instead, and start with only the three files that exist. Concretely: in this task `PURE_FILES = ['svg.ts', 'filename.ts', 'index.ts']`.

**Verification:**

```bash
pnpm test -- lib/render2d lib/export components/BoardSvg
pnpm typecheck && pnpm lint
```

**Acceptance criteria:**

- `components/BoardSvg.test.tsx` passes unchanged, proving the layout extraction is behaviour-preserving.
- `renderBoardSvg(compile(makeCheckerboard())).svg` contains exactly `cells.length + 1` `<rect>` elements and parses as XML.
- No file under `lib/export` other than `png.ts` and `download.ts` mentions `document`, `window` or `Blob`.
- `pnpm typecheck && pnpm lint && pnpm test` green.

**Commit:** `feat: экспорт доски в SVG и PNG, общая геометрия 2D-сцены`

---

## Task 7: cut map, glue-up steps, CSV

**Goal:** the shop-floor data. Given a `Design`, produce (a) per-panel strip lists with widths, species and the rip length that already includes kerf, planing allowance and end trims, (b) per-panel crosscut lists tied to numbered board rows, (c) an ordered, numbered list of glue-up steps with concrete numbers, and (d) a CSV of the whole thing. All of it pure, all of it unit tested, including a property test.

**Files:**

- `lib/export/cutlist.ts` (new, pure) + `lib/export/cutlist.test.ts` + `lib/export/cutlist.property.test.ts`.
- `lib/export/csv.ts` (new, pure) + `lib/export/csv.test.ts`.
- `lib/export/format.ts` (new, pure) + `lib/export/format.test.ts`: `bothUnits`, `speciesName`.
- `lib/i18n/ru.ts`, `lib/i18n/en.ts` (edit): the `steps.*` and `cut.*` keys.
- `lib/export/index.ts`, `lib/export/purity.test.ts` (edit).

**Interfaces:**

```ts
// lib/export/format.ts
export function speciesName(speciesId: SpeciesId, locale: Locale): string
/** «120.0 мм (4.72")» на ru, «120.0 mm (4.72")» на en. Всегда обе системы, как требует спека. */
export function bothUnits(mm: number, locale: Locale, digits?: number): string
export function oneUnit(mm: number, unit: UnitSystem, locale: Locale, digits?: number): string

// lib/export/cutlist.ts
export interface StripPiece {
  readonly kind: 'strip'
  readonly elementIndex: number
  readonly speciesId: SpeciesId
  readonly widthMm: number
}
export interface SlicePiece {
  readonly kind: 'sliceRef'
  readonly elementIndex: number
  readonly sourcePanelId: PanelId
  readonly thicknessMm: number
  readonly offsetMm: number
}
export type PanelPiece = StripPiece | SlicePiece

export interface SpeciesTally {
  readonly speciesId: SpeciesId
  readonly pieceCount: number
  readonly totalWidthMm: number
}

/** Один поперечный рез панели: либо ряд готовой доски, либо вклейка в другую панель. */
export interface Crosscut {
  readonly thicknessMm: number
  readonly trimMm: number
  /** Номер ряда доски (1-based, нумерация rowBandsMm) либо null для вклейки. */
  readonly rowNumber: number | null
  readonly consumer: PanelSlice['consumer']
}

export interface PanelCutPlan {
  readonly panelId: PanelId
  readonly pieces: readonly PanelPiece[]
  readonly bySpecies: readonly SpeciesTally[]
  /** Ширина склеенного щита, мм. */
  readonly widthMm: number
  /** Длина щита, мм. Уже включает kerf, припуск на строгание и торцевые припуски. */
  readonly lengthMm: number
  /** Толщина строгания щита: board.thicknessMm + planingAllowanceMm. */
  readonly planedThicknessMm: number
  readonly crosscuts: readonly Crosscut[]
  /** Есть ли внутри вклеенные срезы: определяет порядок шагов. */
  readonly hasInlay: boolean
}

export interface RowPlan {
  readonly number: number
  readonly rowId: RowId
  readonly panelId: PanelId
  readonly thicknessMm: number
  readonly flip: boolean
  readonly mirror: boolean
  readonly trimMm: number
  readonly topMm: number
}

export interface CutPlan {
  readonly designName: string
  /** Панели в порядке изготовления: вложенные раньше внешних. */
  readonly panels: readonly PanelCutPlan[]
  readonly rows: readonly RowPlan[]
  readonly kerfMm: number
  readonly planingAllowanceMm: number
  readonly boardWidthMm: number
  readonly boardLengthMm: number
  readonly boardThicknessMm: number
  readonly stripCount: number
  readonly crosscutCount: number
}

export function buildCutPlan(design: Design): CutPlan

export type GlueUpStepKind = 'rip' | 'inlay' | 'glue-panel' | 'plane' | 'crosscut' | 'arrange' | 'final-glue' | 'flatten'

export interface GlueUpStep {
  readonly number: number
  readonly kind: GlueUpStepKind
  readonly messageKey: MessageKey
  readonly params: Readonly<Record<string, string | number>>
  readonly panelId?: PanelId
}

export function buildGlueUpSteps(plan: CutPlan, locale: Locale): readonly GlueUpStep[]

// lib/export/csv.ts
export const CSV_BOM = '\uFEFF'
export interface CsvOptions { readonly locale: Locale; readonly delimiter?: string }
export function cutPlanToCsv(plan: CutPlan, options: CsvOptions): string
```

`buildGlueUpSteps` takes `locale` because the pieces it interpolates (species names, joined lists) are already localised strings by the time they enter `params`; per repo quirk 9 nothing dimensional may enter `t()` as a raw number.

**Steps:**

- [ ] **7.1 Failing test for `bothUnits`.** `lib/export/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bothUnits, oneUnit, speciesName } from './format'

describe('bothUnits', () => {
  it('печатает миллиметры и дюймы разом', () => {
    expect(bothUnits(25.4, 'ru')).toBe('25.4 мм (1.00")')
    expect(bothUnits(25.4, 'en')).toBe('25.4 mm (1.00")')
  })
  it('уважает число знаков', () => {
    expect(bothUnits(300, 'ru', 0)).toBe('300 мм (11.81")')
  })
  it('не содержит длинного тире', () => {
    expect(bothUnits(123.456, 'ru').includes(String.fromCharCode(0x2014))).toBe(false)
  })
})

describe('oneUnit', () => {
  it('в дюймовом режиме даёт только дюймы', () => {
    expect(oneUnit(25.4, 'in', 'ru')).toBe('1.00"')
  })
})

describe('speciesName', () => {
  it('берёт имя из справочника по локали', () => {
    expect(speciesName('walnut', 'ru')).toBe('Орех')
    expect(speciesName('walnut', 'en')).toBe('Black walnut')
  })
  it('неизвестная порода возвращает свой id, а не падает', () => {
    expect(speciesName('unobtainium', 'ru')).toBe('unobtainium')
  })
})
```

- [ ] **7.2 Implement `lib/export/format.ts`.**

```ts
import type { SpeciesId } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { SPECIES_BY_ID } from '@/lib/species'
import { formatMm, type UnitSystem } from '@/lib/units'

export function speciesName(speciesId: SpeciesId, locale: Locale): string {
  const species = SPECIES_BY_ID.get(speciesId)
  if (!species) return speciesId
  return locale === 'ru' ? species.nameRu : species.nameEn
}

export function oneUnit(mm: number, unit: UnitSystem, locale: Locale, digits = 1): string {
  return formatMm(mm, unit, t(locale, 'units.mm'), digits)
}

/**
 * Обе системы разом: печатная инструкция обязана быть читаемой и для метрического цеха,
 * и для дюймового, а листать её ради переключателя единиц человек с фуганком не будет.
 */
export function bothUnits(mm: number, locale: Locale, digits = 1): string {
  return `${formatMm(mm, 'mm', t(locale, 'units.mm'), digits)} (${formatMm(mm, 'in', '', 2)})`
}
```

`formatMm(mm, 'in', ...)` ignores its `unitLabel` argument and always appends `"`, which is why the empty string is passed. Add a comment saying so, because it looks like a bug otherwise.

- [ ] **7.3 Failing test for `buildCutPlan`.** `lib/export/cutlist.test.ts`. Use the shipped fixtures: `makeCheckerboard()` from `lib/designs/samples`, and construct a two-level design with a `sliceRef` by hand so the inlay path is covered. Read `lib/engine/fixtures.ts` for `baseDesign` / `stripsPanel` signatures before writing this and use them if they fit; do not invent a new fixture helper if one exists.

```ts
import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { panelLengthMm, panelWidthMm, rowBandsMm, slicesOfPanel, type Design } from '@/lib/engine'
import { buildCutPlan } from './cutlist'

const design = makeCheckerboard()

/** Двухуровневый проект: панель P2 состоит из полос и одного среза панели P1. */
function inlayDesign(): Design {
  const base = makeCheckerboard()
  const inner = base.panels[0]
  expect(inner).toBeDefined()
  if (!inner) throw new Error('фикстура сломана')
  const outer = {
    id: 'PX',
    elements: [
      { kind: 'strip', speciesId: 'maple', widthMm: 40 } as const,
      { kind: 'sliceRef', panelId: inner.id, thicknessMm: 20, angleDeg: 0, offsetMm: 0 } as const,
      { kind: 'strip', speciesId: 'maple', widthMm: 40 } as const,
    ],
  }
  const firstRow = base.rows[0]
  if (!firstRow) throw new Error('фикстура сломана')
  return {
    ...base,
    panels: [...base.panels, outer],
    rows: [...base.rows, { ...firstRow, id: 'rx', panelId: 'PX' }],
  }
}

describe('buildCutPlan', () => {
  it('перечисляет полосы каждой панели в порядке склейки', () => {
    const plan = buildCutPlan(design)
    const first = plan.panels[0]
    const panel = design.panels.find((p) => p.id === first?.panelId)
    expect(first?.pieces).toHaveLength(panel?.elements.length ?? -1)
    expect(first?.pieces[0]).toMatchObject({ kind: 'strip', elementIndex: 0 })
  })

  it('длина щита берётся из движка и включает kerf, припуск и торцы', () => {
    const plan = buildCutPlan(design)
    for (const p of plan.panels) {
      expect(p.lengthMm).toBeCloseTo(panelLengthMm(design, p.panelId), 9)
      expect(p.widthMm).toBeCloseTo(panelWidthMm(design.panels.find((x) => x.id === p.panelId)!), 9)
    }
  })

  it('толщина строгания щита выше готовой на припуск', () => {
    const plan = buildCutPlan(design)
    const p = plan.panels[0]
    expect(p?.planedThicknessMm).toBeCloseTo(design.board.thicknessMm + design.planingAllowanceMm, 9)
  })

  it('поперечных резов ровно столько, сколько срезов снимается с панели', () => {
    const plan = buildCutPlan(design)
    for (const p of plan.panels) {
      expect(p.crosscuts).toHaveLength(slicesOfPanel(design, p.panelId).length)
    }
  })

  it('номера рядов совпадают с нумерацией на холсте', () => {
    const plan = buildCutPlan(design)
    const bands = rowBandsMm(design)
    expect(plan.rows.map((r) => r.rowId)).toEqual(bands.map((b) => b.id))
    expect(plan.rows.map((r) => r.number)).toEqual(bands.map((_, i) => i + 1))
    const numbered = plan.panels.flatMap((p) => p.crosscuts).filter((c) => c.rowNumber !== null)
    expect(numbered.map((c) => c.rowNumber)).toEqual(expect.arrayContaining([1]))
  })

  it('сводка по породам суммирует ширины полос', () => {
    const plan = buildCutPlan(design)
    for (const p of plan.panels) {
      const sum = p.bySpecies.reduce((s, x) => s + x.totalWidthMm, 0)
      const stripWidth = p.pieces.filter((x) => x.kind === 'strip').reduce((s, x) => s + x.widthMm, 0)
      expect(sum).toBeCloseTo(stripWidth, 9)
    }
  })

  it('вложенные панели идут раньше внешних', () => {
    const plan = buildCutPlan(inlayDesign())
    const outer = plan.panels.findIndex((p) => p.panelId === 'PX')
    const inner = plan.panels.findIndex((p) => p.hasInlay === false)
    expect(inner).toBeLessThan(outer)
    expect(plan.panels[outer]?.hasInlay).toBe(true)
  })

  it('вклейка не получает номера ряда', () => {
    const plan = buildCutPlan(inlayDesign())
    const innerPlan = plan.panels.find((p) => p.crosscuts.some((c) => c.consumer.kind === 'sliceRef'))
    const inlayCut = innerPlan?.crosscuts.find((c) => c.consumer.kind === 'sliceRef')
    expect(inlayCut?.rowNumber).toBeNull()
  })

  it('итоги считают все полосы и все резы', () => {
    const plan = buildCutPlan(design)
    expect(plan.stripCount).toBe(plan.panels.reduce((s, p) => s + p.pieces.filter((x) => x.kind === 'strip').length, 0))
    expect(plan.crosscutCount).toBe(plan.panels.reduce((s, p) => s + p.crosscuts.length, 0))
  })

  it('панель без срезов не роняет расчёт', () => {
    const orphan: Design = { ...design, rows: [] }
    expect(() => buildCutPlan(orphan)).not.toThrow()
    expect(buildCutPlan(orphan).panels.every((p) => p.lengthMm === 0)).toBe(true)
  })
})
```

- [ ] **7.4 Implement `buildCutPlan`.**

```ts
import {
  isSliceRef,
  isStrip,
  panelLengthMm,
  panelWidthMm,
  rowBandsMm,
  slicesOfPanel,
  type Design,
  type Panel,
  type PanelId,
  type PanelSlice,
  type RowId,
  type SpeciesId,
} from '@/lib/engine'

// ... интерфейсы из раздела Interfaces ...

/**
 * Порядок изготовления панелей: сначала те, что ни на кого не ссылаются,
 * потом те, что вклеивают чужие срезы. Движок ограничивает вложенность двумя уровнями,
 * поэтому двух проходов достаточно и полноценная топологическая сортировка не нужна.
 */
function manufacturingOrder(design: Design): readonly Panel[] {
  const plain = design.panels.filter((p) => !p.elements.some(isSliceRef))
  const nested = design.panels.filter((p) => p.elements.some(isSliceRef))
  return [...plain, ...nested]
}

function tally(panel: Panel): SpeciesTally[] {
  const acc = new Map<SpeciesId, { pieceCount: number; totalWidthMm: number }>()
  for (const el of panel.elements) {
    if (!isStrip(el)) continue
    const prev = acc.get(el.speciesId) ?? { pieceCount: 0, totalWidthMm: 0 }
    acc.set(el.speciesId, { pieceCount: prev.pieceCount + 1, totalWidthMm: prev.totalWidthMm + el.widthMm })
  }
  return [...acc.entries()]
    .map(([speciesId, v]) => ({ speciesId, ...v }))
    .sort((a, b) => b.totalWidthMm - a.totalWidthMm || a.speciesId.localeCompare(b.speciesId))
}

function pieces(panel: Panel): PanelPiece[] {
  return panel.elements.map((el, elementIndex) =>
    isStrip(el)
      ? { kind: 'strip', elementIndex, speciesId: el.speciesId, widthMm: el.widthMm }
      : { kind: 'sliceRef', elementIndex, sourcePanelId: el.panelId, thicknessMm: el.thicknessMm, offsetMm: el.offsetMm },
  )
}

export function buildCutPlan(design: Design): CutPlan {
  // Нумерация рядов берётся у rowBandsMm, а не у design.rows: движок пропускает
  // ряды с несуществующей панелью, и на холсте пользователь видит именно эту нумерацию.
  const bands = rowBandsMm(design)
  const rowNumberById = new Map<RowId, number>(bands.map((b, index) => [b.id, index + 1]))

  const rows: RowPlan[] = bands.flatMap((band, index) => {
    const row = design.rows.find((r) => r.id === band.id)
    if (!row) return []
    return [{
      number: index + 1,
      rowId: row.id,
      panelId: row.panelId,
      thicknessMm: row.thicknessMm,
      flip: row.flip,
      mirror: row.mirror,
      trimMm: row.trimMm,
      topMm: band.topMm,
    }]
  })

  const panels: PanelCutPlan[] = manufacturingOrder(design).map((panel) => {
    const crosscuts: Crosscut[] = slicesOfPanel(design, panel.id).map((slice: PanelSlice) => ({
      thicknessMm: slice.thicknessMm,
      trimMm: slice.trimMm,
      rowNumber: slice.consumer.kind === 'row' ? rowNumberById.get(slice.consumer.rowId) ?? null : null,
      consumer: slice.consumer,
    }))
    return {
      panelId: panel.id,
      pieces: pieces(panel),
      bySpecies: tally(panel),
      widthMm: panelWidthMm(panel),
      lengthMm: panelLengthMm(design, panel.id),
      planedThicknessMm: design.board.thicknessMm + design.planingAllowanceMm,
      crosscuts,
      hasInlay: panel.elements.some(isSliceRef),
    }
  })

  return {
    designName: design.name,
    panels,
    rows,
    kerfMm: design.kerfMm,
    planingAllowanceMm: design.planingAllowanceMm,
    boardWidthMm: design.board.targetWidthMm,
    boardLengthMm: design.board.targetLengthMm,
    boardThicknessMm: design.board.thicknessMm,
    stripCount: panels.reduce((s, p) => s + p.pieces.filter((x) => x.kind === 'strip').length, 0),
    crosscutCount: panels.reduce((s, p) => s + p.crosscuts.length, 0),
  }
}
```

`rowNumberById.get(...) ?? null` is required, not defensive noise: `noUncheckedIndexedAccess` plus `Map.get` yields `number | undefined`, and `RowPlan.rowNumber` is `number | null`.

- [ ] **7.5 Property test.** `lib/export/cutlist.property.test.ts`, following the style of `lib/engine/compile.property.test.ts` and `lib/generators/families.property.test.ts`. Read one of them first and reuse its arbitraries if it exports any.

```ts
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { makeGridDesign, uniform } from '@/lib/designs/grid'
import { panelLengthMm, slicesOfPanel } from '@/lib/engine'
import { SPECIES } from '@/lib/species'
import { buildCutPlan } from './cutlist'

const speciesIds = SPECIES.map((s) => s.id)

const designArb = fc
  .record({
    cols: fc.integer({ min: 2, max: 10 }),
    rows: fc.integer({ min: 2, max: 10 }),
    colMm: fc.integer({ min: 8, max: 40 }),
    rowMm: fc.integer({ min: 10, max: 40 }),
    seed: fc.integer({ min: 0, max: 1_000_000 }),
  })
  .map(({ cols, rows, colMm, rowMm, seed }) =>
    makeGridDesign({
      id: `p-${seed}`,
      name: `prop ${seed}`,
      colWidthsMm: uniform(cols, colMm),
      rowHeightsMm: uniform(rows, rowMm),
      at: (col, row) => speciesIds[(col * 7 + row * 13 + seed) % speciesIds.length] ?? 'maple',
    }),
  )

describe('инварианты карты раскроя', () => {
  it('длина щита всегда равна движковой', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        for (const p of buildCutPlan(design).panels) {
          expect(p.lengthMm).toBeCloseTo(panelLengthMm(design, p.panelId), 9)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('число резов равно числу срезов, снимаемых с панели', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        for (const p of buildCutPlan(design).panels) {
          expect(p.crosscuts).toHaveLength(slicesOfPanel(design, p.panelId).length)
        }
      }),
      { numRuns: 100 },
    )
  })

  it('каждый ряд доски получает ровно один рез с этим номером', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        const plan = buildCutPlan(design)
        const numbers = plan.panels.flatMap((p) => p.crosscuts).map((c) => c.rowNumber).filter((n): n is number => n !== null)
        expect([...numbers].sort((a, b) => a - b)).toEqual(plan.rows.map((r) => r.number))
      }),
      { numRuns: 100 },
    )
  })

  it('карта раскроя не теряет и не выдумывает полосы', () => {
    fc.assert(
      fc.property(designArb, (design) => {
        const plan = buildCutPlan(design)
        const declared = design.panels.reduce((s, p) => s + p.elements.filter((e) => e.kind === 'strip').length, 0)
        expect(plan.stripCount).toBe(declared)
        expect(plan.panels).toHaveLength(design.panels.length)
      }),
      { numRuns: 100 },
    )
  })
})
```

- [ ] **7.6 i18n keys for the steps.** Add to `lib/i18n/ru.ts`, then the same keys to `lib/i18n/en.ts` in the same commit (`lib/i18n/index.test.ts` fails on drift). Every value is checked for U+2014 by the existing test.

```ts
// lib/i18n/ru.ts (добавить)
'steps.title': 'Схема переклеек',
'steps.rip': 'Распустить полосы для щита {panel}: {pieces}. Длина каждой полосы {length}, толщина заготовки {thickness}',
'steps.inlay': 'Нарезать щит {source} на срезы по {thickness} и вклеить их в щит {panel} со сдвигом {offset}',
'steps.gluePanel': 'Склеить щит {panel} из {count} заготовок. Ширина щита {width}',
'steps.plane': 'Отфуговать и прострогать щит {panel} в толщину {thickness}',
'steps.crosscut': 'Распустить щит {panel} поперёк на {count} срезов: {list}. Пропил {kerf}',
'steps.arrange': 'Разложить {count} рядов в порядке с 1 по {count}. Перевернуть: {flip}. Зеркалить: {mirror}',
'steps.finalGlue': 'Склеить финальную доску: {width} на {length}',
'steps.flatten': 'Выровнять доску в толщину {thickness}, снять фаски, отшлифовать',
'steps.none': 'нет',
'cut.title': 'Карта раскроя',
'cut.panel': 'Щит {panel}',
'cut.panelSummary': 'ширина {width}, длина {length}, толщина строгания {thickness}',
'cut.strip': 'Полоса {index}: {species}, ширина {width}',
'cut.sliceIn': 'Вклейка: срез щита {source}, толщина {thickness}',
'cut.crosscutRow': 'Рез {index}: толщина {thickness}, ряд {row}',
'cut.crosscutInlay': 'Рез {index}: толщина {thickness}, во вклейку щита {panel}',
'cut.totals': 'Полос: {strips}, резов: {cuts}, склеек: {glueUps}',
'cut.truncated': 'Внимание: модель обрезана по лимиту ячеек, экспорт неполный',
```

```ts
// lib/i18n/en.ts (добавить)
'steps.title': 'Glue-up sequence',
'steps.rip': 'Rip strips for panel {panel}: {pieces}. Each strip {length} long, stock thickness {thickness}',
'steps.inlay': 'Crosscut panel {source} into {thickness} slices and glue them into panel {panel} with a {offset} offset',
'steps.gluePanel': 'Glue up panel {panel} from {count} pieces. Panel width {width}',
'steps.plane': 'Joint and plane panel {panel} to {thickness}',
'steps.crosscut': 'Crosscut panel {panel} into {count} slices: {list}. Kerf {kerf}',
'steps.arrange': 'Lay out {count} rows in order 1 to {count}. Flip: {flip}. Mirror: {mirror}',
'steps.finalGlue': 'Glue the final board: {width} by {length}',
'steps.flatten': 'Flatten the board to {thickness}, chamfer the edges, sand',
'steps.none': 'none',
'cut.title': 'Cut map',
'cut.panel': 'Panel {panel}',
'cut.panelSummary': 'width {width}, length {length}, planing thickness {thickness}',
'cut.strip': 'Strip {index}: {species}, width {width}',
'cut.sliceIn': 'Inlay: slice of panel {source}, thickness {thickness}',
'cut.crosscutRow': 'Cut {index}: thickness {thickness}, row {row}',
'cut.crosscutInlay': 'Cut {index}: thickness {thickness}, into the inlay of panel {panel}',
'cut.totals': 'Strips: {strips}, cuts: {cuts}, glue-ups: {glueUps}',
'cut.truncated': 'Warning: the model was truncated by the cell budget, this export is incomplete',
```

- [ ] **7.7 Failing test for `buildGlueUpSteps`.**

```ts
import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { t } from '@/lib/i18n'
import { buildCutPlan, buildGlueUpSteps } from './cutlist'

const plan = buildCutPlan(makeCheckerboard())

describe('buildGlueUpSteps', () => {
  const steps = buildGlueUpSteps(plan, 'ru')

  it('нумерует шаги подряд с единицы', () => {
    expect(steps.map((s) => s.number)).toEqual(steps.map((_, i) => i + 1))
  })

  it('идёт от роспуска к финальной склейке', () => {
    const kinds = steps.map((s) => s.kind)
    expect(kinds[0]).toBe('rip')
    expect(kinds.at(-1)).toBe('flatten')
    expect(kinds.indexOf('crosscut')).toBeGreaterThan(kinds.indexOf('glue-panel'))
    expect(kinds.indexOf('glue-panel')).toBeGreaterThan(kinds.indexOf('rip'))
    expect(kinds.indexOf('final-glue')).toBeGreaterThan(kinds.lastIndexOf('crosscut'))
  })

  it('на каждую панель приходится роспуск, склейка, строгание и рез', () => {
    for (const p of plan.panels) {
      for (const kind of ['rip', 'glue-panel', 'plane', 'crosscut'] as const) {
        expect(steps.some((s) => s.kind === kind && s.panelId === p.panelId), `${kind} ${p.panelId}`).toBe(true)
      }
    }
  })

  it('подставляет конкретные числа, а не заглушки', () => {
    const rip = steps.find((s) => s.kind === 'rip')
    expect(rip).toBeDefined()
    if (!rip) return
    const text = t('ru', rip.messageKey, rip.params)
    expect(text).toContain('мм')
    expect(text).not.toContain('{')
    expect(text).toContain('(')  // дюймы напечатаны рядом
  })

  it('в шаге раскладки перечисляет перевёрнутые и зеркальные ряды', () => {
    const arrange = steps.find((s) => s.kind === 'arrange')
    const text = arrange ? t('ru', arrange.messageKey, arrange.params) : ''
    expect(text).toContain(String(plan.rows.length))
    expect(text.includes('{')).toBe(false)
  })

  it('любой шаг рендерится без незакрытых плейсхолдеров на обеих локалях', () => {
    for (const locale of ['ru', 'en'] as const) {
      for (const step of buildGlueUpSteps(plan, locale)) {
        expect(t(locale, step.messageKey, step.params)).not.toMatch(/\{[a-zA-Z]+\}/)
      }
    }
  })
})
```

- [ ] **7.8 Implement `buildGlueUpSteps`.** Note that `params` values are pre-formatted strings, never raw millimetre floats (repo quirk 9).

```ts
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { bothUnits, speciesName } from './format'

function describePieces(panel: PanelCutPlan, locale: Locale): string {
  return panel.bySpecies
    .map((s) => `${speciesName(s.speciesId, locale)} ${s.pieceCount} шт`)
    .join(', ')
}

/**
 * Пошаговая инструкция по проекту. Шаги идут в порядке изготовления:
 * вложенные щиты собираются раньше внешних, финальная склейка всегда последняя.
 * Все размеры уже превращены в строки (мм и дюймы), потому что t() округляет числа до сотых.
 */
export function buildGlueUpSteps(plan: CutPlan, locale: Locale): readonly GlueUpStep[] {
  const out: Array<Omit<GlueUpStep, 'number'>> = []
  const push = (kind: GlueUpStepKind, messageKey: MessageKey, params: Record<string, string | number>, panelId?: PanelId): void => {
    out.push({ kind, messageKey, params, ...(panelId === undefined ? {} : { panelId }) })
  }

  for (const panel of plan.panels) {
    push('rip', 'steps.rip', {
      panel: panel.panelId,
      pieces: describePieces(panel, locale),
      length: bothUnits(panel.lengthMm, locale),
      thickness: bothUnits(panel.planedThicknessMm, locale),
    }, panel.panelId)

    for (const piece of panel.pieces) {
      if (piece.kind !== 'sliceRef') continue
      push('inlay', 'steps.inlay', {
        source: piece.sourcePanelId,
        panel: panel.panelId,
        thickness: bothUnits(piece.thicknessMm, locale),
        offset: bothUnits(piece.offsetMm, locale),
      }, panel.panelId)
    }

    push('glue-panel', 'steps.gluePanel', {
      panel: panel.panelId,
      count: panel.pieces.length,
      width: bothUnits(panel.widthMm, locale),
    }, panel.panelId)

    push('plane', 'steps.plane', {
      panel: panel.panelId,
      thickness: bothUnits(panel.planedThicknessMm, locale),
    }, panel.panelId)

    push('crosscut', 'steps.crosscut', {
      panel: panel.panelId,
      count: panel.crosscuts.length,
      list: panel.crosscuts
        .map((c) => (c.rowNumber === null ? bothUnits(c.thicknessMm, locale) : `${bothUnits(c.thicknessMm, locale)} -> ${c.rowNumber}`))
        .join('; '),
      kerf: bothUnits(plan.kerfMm, locale),
    }, panel.panelId)
  }

  const none = t(locale, 'steps.none')
  const flipped = plan.rows.filter((r) => r.flip).map((r) => r.number)
  const mirrored = plan.rows.filter((r) => r.mirror).map((r) => r.number)
  push('arrange', 'steps.arrange', {
    count: plan.rows.length,
    flip: flipped.length === 0 ? none : flipped.join(', '),
    mirror: mirrored.length === 0 ? none : mirrored.join(', '),
  })

  push('final-glue', 'steps.finalGlue', {
    width: bothUnits(plan.boardWidthMm, locale),
    length: bothUnits(plan.boardLengthMm, locale),
  })

  push('flatten', 'steps.flatten', { thickness: bothUnits(plan.boardThicknessMm, locale) })

  return out.map((step, index) => ({ ...step, number: index + 1 }))
}
```

The `'шт'` literal inside `describePieces` is a Russian string leaking into a non-component module. Fix it properly: add `'cut.pcs': 'шт'` / `'cut.pcs': 'pcs'` to the dictionaries and call `t(locale, 'cut.pcs')`. Do not leave the literal in.

- [ ] **7.9 CSV.** Failing test first, `lib/export/csv.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'
import { buildCutPlan } from './cutlist'
import { CSV_BOM, cutPlanToCsv } from './csv'

const plan = buildCutPlan(makeCheckerboard())
const csv = cutPlanToCsv(plan, { locale: 'ru' })
const lines = csv.split('\r\n').filter((l) => l !== '')

describe('cutPlanToCsv', () => {
  it('первая строка это заголовок из восьми колонок', () => {
    expect(lines[0]?.split(';')).toHaveLength(8)
    expect(lines[0]).toContain('panel')
  })

  it('строк ровно столько, сколько полос и резов', () => {
    expect(lines).toHaveLength(1 + plan.stripCount + plan.crosscutCount + plan.panels.filter((p) => p.pieces.some((x) => x.kind === 'sliceRef')).length)
  })

  it('числа пишет с точкой и в миллиметрах', () => {
    expect(csv).toMatch(/;\d+(\.\d+)?;/)
    expect(csv).not.toContain(',')
  })

  it('экранирует разделитель и кавычки в названии', () => {
    const tricky = cutPlanToCsv({ ...plan, designName: 'до;ска "тест"' }, { locale: 'ru' })
    expect(tricky).toContain('"до;ска ""тест"""')
  })

  it('не содержит длинного тире', () => {
    expect(csv.includes(String.fromCharCode(0x2014))).toBe(false)
  })

  it('BOM не входит в строку, он добавляется при скачивании', () => {
    expect(csv.startsWith(CSV_BOM)).toBe(false)
  })
})
```

Implementation:

```ts
// lib/export/csv.ts
import type { Locale } from '@/lib/i18n'
import { speciesName } from './format'
import type { CutPlan } from './cutlist'

/** Excel на Windows без BOM читает кириллицу как кракозябры. Добавляется в момент скачивания. */
export const CSV_BOM = '\uFEFF'

export interface CsvOptions {
  readonly locale: Locale
  /** Точка с запятой: русская локаль Excel считает запятую десятичным разделителем. */
  readonly delimiter?: string
}

const HEADER = ['kind', 'panel', 'index', 'species', 'width_mm', 'length_mm', 'thickness_mm', 'row'] as const

function cell(value: string | number, delimiter: string): string {
  const text = typeof value === 'number' ? String(Number(value.toFixed(2))) : value
  return /["\r\n]/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * Плоская таблица для цеха: одна строка на полосу и одна на поперечный рез.
 * Всё в миллиметрах: CSV уезжает в Excel и в станки, а не человеку на чтение,
 * поэтому дюймовое представление здесь было бы вредным.
 */
export function cutPlanToCsv(plan: CutPlan, options: CsvOptions): string {
  const delimiter = options.delimiter ?? ';'
  const rows: Array<readonly (string | number)[]> = [HEADER]

  for (const panel of plan.panels) {
    for (const piece of panel.pieces) {
      rows.push(
        piece.kind === 'strip'
          ? ['strip', panel.panelId, piece.elementIndex + 1, speciesName(piece.speciesId, options.locale), piece.widthMm, panel.lengthMm, panel.planedThicknessMm, '']
          : ['inlay', panel.panelId, piece.elementIndex + 1, piece.sourcePanelId, piece.thicknessMm, panel.lengthMm, panel.planedThicknessMm, ''],
      )
    }
    panel.crosscuts.forEach((cut, index) => {
      rows.push(['crosscut', panel.panelId, index + 1, plan.designName, panel.widthMm, '', cut.thicknessMm, cut.rowNumber ?? 'inlay'])
    })
  }

  return rows.map((row) => row.map((v) => cell(v, delimiter)).join(delimiter)).join('\r\n')
}
```

`designName` is put in the `species` column of crosscut rows so the escaping test has something to bite on and so a merged multi-project CSV stays attributable. If that reads as a hack during implementation, add a ninth `design` column instead and update the header-length assertion to 9.

- [ ] **7.10 Extend the barrel and the purity test.** `lib/export/index.ts` gains `cutlist`, `csv` and `format` re-exports; `PURE_FILES` in `purity.test.ts` becomes `['svg.ts', 'filename.ts', 'format.ts', 'cutlist.ts', 'csv.ts', 'index.ts']`.

**Verification:**

```bash
pnpm test -- lib/export lib/i18n
pnpm typecheck && pnpm lint
```

**Acceptance criteria:**

- Every `panelLengthMm` in the plan matches the engine to 1e-9, verified over 100 generated designs.
- Row numbers in the cut plan equal the row numbers the editor prints on screen (`rowBandsMm` order), verified over 100 generated designs.
- Every `GlueUpStep` renders through `t()` in both locales with zero unresolved `{placeholder}`.
- `lib/i18n/index.test.ts` green (key parity, no em dash).

**Commit:** `feat: карта раскроя, схема переклеек и CSV для цеха`

---

## Task 8: workshop instruction PDF (jsPDF + svg2pdf, embedded Cyrillic font)

**Goal:** a three-page A4 PDF that a person with a jointer and a mitre saw can follow. Page 1: board preview as vector plus parameters plus species legend plus complexity numbers. Page 2: cut map, one strip-stack diagram per panel plus the crosscut list. Page 3: numbered glue-up steps plus a row-order diagram with flip and mirror marks. Both unit systems on every dimension. Russian text renders correctly, which is the entire risk of this task.

**Files:**

- `package.json` (edit): `jspdf`, `svg2pdf.js`.
- `public/fonts/PTSans-Regular.ttf`, `public/fonts/PTSans-Bold.ttf`, `public/fonts/OFL.txt` (new).
- `lib/export/pdfFont.ts` (new, browser only).
- `lib/export/pdf.ts` (new, browser only, no unit test).
- `e2e/export.spec.ts` (created in Task 9, but the PDF assertions are specified here).

**Interfaces:**

```ts
// lib/export/pdfFont.ts
export const PDF_FONT_FAMILY = 'PTSans'
export const PDF_FONT_URLS = {
  normal: '/fonts/PTSans-Regular.ttf',
  bold: '/fonts/PTSans-Bold.ttf',
} as const

/**
 * Регистрирует кириллический шрифт в VFS документа.
 * true - кириллица доступна, false - шрифт не загрузился и текст надо печатать по-английски.
 */
export function registerCyrillicFont(doc: jsPDF): Promise<boolean>

// lib/export/pdf.ts
export interface PdfInput {
  readonly design: Design
  readonly model: BoardModel
  readonly calc: CalcResult
  readonly locale: Locale
}
export async function buildInstructionPdf(input: PdfInput): Promise<Blob>
```

`buildInstructionPdf` takes `design`, `model` and `calc` rather than a pre-built plan because the caller (`ExportPanel`) already holds exactly those three from `useDerived()`, and building the cut plan inside keeps the call site to one line.

**Steps:**

- [ ] **8.1 Add the dependencies and pin them.**

```bash
pnpm add jspdf svg2pdf.js
```

Then record the resolved versions in the commit message and check the build cost:

```bash
pnpm build 2>&1 | grep -A 12 "First Load JS"
```

Note the current first-load number **before** this task starts, so step 8.11 has a baseline to compare against.

- [ ] **8.2 Vendor the Cyrillic font.** This is the decided approach, and the alternatives were rejected for concrete reasons.

jsPDF's fourteen built-in PDF base fonts are all WinAnsi/Latin-1. Any Cyrillic string drawn with `helvetica` comes out as mojibake or as blanks, silently, with no exception thrown. jsPDF's only supported fix is to put a TTF into its virtual file system and register it, which requires the font as **base64 of a TTF** (not woff2, which jsPDF cannot parse).

Rejected: **inlining the base64 in a TS module.** A regular plus bold pair is roughly 260 KB of TTF, which becomes roughly 350 KB of base64 string, which becomes a 350 KB JS module that webpack must parse. Even behind a dynamic import that is a large chunk, and base64 in JS is stored as UTF-16 in memory.

Rejected: **PDF in English only.** The contest jury is Russian-speaking and the primary UI locale is Russian. Shipping a Russian app whose printable output is English would be judged as unfinished, correctly.

**Chosen: serve the TTFs from `public/fonts/` and fetch them on demand.** Zero bytes in any JS bundle, HTTP-cacheable, fetched only when the user clicks "PDF", and `next start` serves `public/` in production so the e2e job exercises the real path.

```bash
mkdir -p public/fonts
curl -fSL -o public/fonts/PTSans-Regular.ttf \
  https://github.com/google/fonts/raw/main/ofl/ptsans/PT_Sans-Web-Regular.ttf
curl -fSL -o public/fonts/PTSans-Bold.ttf \
  https://github.com/google/fonts/raw/main/ofl/ptsans/PT_Sans-Web-Bold.ttf
curl -fSL -o public/fonts/OFL.txt \
  https://github.com/google/fonts/raw/main/ofl/ptsans/OFL.txt
ls -la public/fonts
```

Verify each file is a real TTF and not an HTML error page:

```bash
file public/fonts/*.ttf   # ожидается "TrueType Font data"
```

If those URLs 404 (the google/fonts repo does move files), fall back to any OFL-licensed TTF with a full Cyrillic block: Noto Sans, Open Sans, Roboto. Record which one was used in a comment at the top of `pdfFont.ts`. Do **not** substitute a Latin-only font. Expected size is roughly 100 to 200 KB each; if the pair exceeds 600 KB, subset it with `pyftsubset --unicodes=U+0000-024F,U+0400-04FF` and note the command in the commit message.

- [ ] **8.3 Implement `lib/export/pdfFont.ts`.**

```ts
import type { jsPDF } from 'jspdf'

/**
 * Кириллица в jsPDF. Встроенные шрифты PDF знают только WinAnsi, поэтому русский текст
 * без подмены шрифта выходит пустыми глифами и без единой ошибки в консоли.
 * TTF лежит в public/ и грузится по клику: в JS-бандл не попадает ни байта.
 * Шрифт: PT Sans (SIL Open Font License, public/fonts/OFL.txt).
 */
export const PDF_FONT_FAMILY = 'PTSans'

export const PDF_FONT_URLS = {
  normal: '/fonts/PTSans-Regular.ttf',
  bold: '/fonts/PTSans-Bold.ttf',
} as const

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  // Чанками: apply на 200 КБ разом кладёт стек в Safari.
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

async function addFace(doc: jsPDF, url: string, style: 'normal' | 'bold'): Promise<void> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`font ${url}: ${response.status}`)
  const fileName = url.split('/').pop() ?? 'font.ttf'
  doc.addFileToVFS(fileName, toBase64(await response.arrayBuffer()))
  doc.addFont(fileName, PDF_FONT_FAMILY, style)
}

/**
 * true - кириллица доступна и документ переключён на PT Sans.
 * false - шрифт не отдался (офлайн, 404, CSP): вызывающий код обязан печатать по-английски
 * встроенным helvetica, иначе получится PDF из пустых квадратов.
 */
export async function registerCyrillicFont(doc: jsPDF): Promise<boolean> {
  try {
    await Promise.all([addFace(doc, PDF_FONT_URLS.normal, 'normal'), addFace(doc, PDF_FONT_URLS.bold, 'bold')])
    doc.setFont(PDF_FONT_FAMILY, 'normal')
    return true
  } catch {
    doc.setFont('helvetica', 'normal')
    return false
  }
}
```

- [ ] **8.4 PDF skeleton and the locale downgrade rule.**

```ts
import type { BoardModel, Design } from '@/lib/engine'
import type { CalcResult } from '@/lib/calc'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { buildCutPlan, buildGlueUpSteps } from './cutlist'
import { PDF_FONT_FAMILY, registerCyrillicFont } from './pdfFont'
import { renderBoardSvg } from './svg'
import { bothUnits, speciesName } from './format'

const PAGE = { widthMm: 210, heightMm: 297, marginMm: 14 } as const
const LINE_MM = 5.2

export interface PdfInput {
  readonly design: Design
  readonly model: BoardModel
  readonly calc: CalcResult
  readonly locale: Locale
}

export async function buildInstructionPdf(input: PdfInput): Promise<Blob> {
  // Динамический импорт: jspdf со svg2pdf это около 350 КБ, и в первом бандле страницы им делать нечего.
  const { jsPDF } = await import('jspdf')
  await import('svg2pdf.js') // побочный эффект: добавляет doc.svg()

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const hasCyrillic = await registerCyrillicFont(doc)
  // Без кириллического шрифта русский текст вышел бы пустыми глифами.
  // Честнее отдать читаемый английский PDF, чем красивый пустой.
  const locale: Locale = hasCyrillic ? input.locale : 'en'
  const family = hasCyrillic ? PDF_FONT_FAMILY : 'helvetica'

  const plan = buildCutPlan(input.design)
  const steps = buildGlueUpSteps(plan, locale)
  const ctx = { doc, family, locale, ...input, plan, steps }

  await drawOverviewPage(ctx)
  doc.addPage()
  drawCutMapPage(ctx)
  doc.addPage()
  drawStepsPage(ctx)

  return doc.output('blob')
}
```

Define a `PdfContext` interface for `ctx` rather than relying on inference; `noImplicitAny` will not complain but the page functions need a named parameter type anyway.

- [ ] **8.5 Page 1: overview.** This is the **only** place svg2pdf is used.

```ts
async function drawOverviewPage(ctx: PdfContext): Promise<void> {
  const { doc, locale, model, calc, design } = ctx
  let y = PAGE.marginMm

  text(ctx, design.name, PAGE.marginMm, y, { size: 16, style: 'bold' })
  y += 8
  text(ctx, t(locale, 'app.tagline'), PAGE.marginMm, y, { size: 9, color: '#666666' })
  y += 8

  if (model.truncated) {
    text(ctx, t(locale, 'cut.truncated'), PAGE.marginMm, y, { size: 9, color: '#b00020' })
    y += 6
  }

  // Векторная доска: единственный вызов svg2pdf во всём документе.
  // Всё остальное рисуется примитивами jsPDF, поэтому капризность svg2pdf к трансформациям
  // может испортить максимум одну картинку, а не весь PDF.
  const maxWidthMm = PAGE.widthMm - PAGE.marginMm * 2
  const maxHeightMm = 120
  const rendered = renderBoardSvg(model, { maxPx: 1000 })
  const aspect = rendered.heightPx === 0 ? 1 : rendered.widthPx / rendered.heightPx
  const drawWidth = Math.min(maxWidthMm, maxHeightMm * aspect)
  const drawHeight = drawWidth / aspect
  await drawSvg(doc, rendered.svg, (PAGE.widthMm - drawWidth) / 2, y, drawWidth, drawHeight)
  y += drawHeight + 8

  y = drawKeyValues(ctx, y, [
    [t(locale, 'board.width'), bothUnits(model.widthMm, locale, 0)],
    [t(locale, 'board.length'), bothUnits(model.lengthMm, locale, 0)],
    [t(locale, 'board.thickness'), bothUnits(model.thicknessMm, locale, 0)],
    [t(locale, 'board.kerf'), bothUnits(design.kerfMm, locale, 1)],
    [t(locale, 'board.allowance'), bothUnits(design.planingAllowanceMm, locale, 1)],
    [t(locale, 'board.planerWidth'), bothUnits(design.planerWidthMm, locale, 0)],
    [t(locale, 'meter.glueUps'), String(calc.glueUpCount)],
    [t(locale, 'meter.cuts'), String(calc.cutCount)],
    [t(locale, 'meter.waste'), `${calc.wastePct.toFixed(1)} %`],
    [t(locale, 'meter.boardFeet'), `${calc.totalBoardFeet.toFixed(2)} bf`],
    [t(locale, 'meter.cost'), usd.format(calc.totalCostUsd)],
    [t(locale, 'meter.weight'), `${calc.totalWeightKg.toFixed(2)} ${t(locale, 'units.kg')}`],
  ])

  y += 4
  text(ctx, t(locale, 'meter.lumberBySpecies'), PAGE.marginMm, y, { style: 'bold' })
  y += LINE_MM
  for (const need of calc.bySpecies) {
    doc.setFillColor(speciesHex(need.speciesId))
    doc.rect(PAGE.marginMm, y - 3.2, 4, 4, 'F')
    text(ctx, `${speciesName(need.speciesId, locale)}: ${need.linearMeters.toFixed(2)} m, ${need.boardFeet.toFixed(2)} bf, ${usd.format(need.costUsd)}`, PAGE.marginMm + 6, y, { size: 9 })
    y += LINE_MM
  }
}

/**
 * svg2pdf требует настоящий Element, а не строку, и для getBBox узел должен быть в документе.
 * Держим его в скрытом контейнере ровно на время отрисовки.
 */
async function drawSvg(doc: jsPDF, svg: string, x: number, y: number, width: number, height: number): Promise<void> {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    const element = host.firstElementChild
    if (!(element instanceof SVGElement)) throw new Error('svg root missing')
    await doc.svg(element, { x, y, width, height })
  } finally {
    host.remove()
  }
}
```

`doc.svg()` comes from the `svg2pdf.js` side-effect import and is typed by the package's own module augmentation of jsPDF. If TypeScript does not see it, add a one-line `declare module 'jspdf'` augmentation in `lib/export/pdf.ts` rather than casting to `any`; `eslint-config-next/typescript` will flag the cast.

The `text()` helper wraps `doc.setFont(family, style)`, `doc.setFontSize`, `doc.setTextColor` and `doc.text`, so the font family is set on every single draw. That matters: jsPDF resets to helvetica more eagerly than the docs suggest, and a single missed `setFont` produces one invisible line in the middle of a Russian page.

- [ ] **8.6 Page 2: cut map, drawn with primitives.** For each panel: a header line, a horizontal strip stack (each strip a filled rectangle whose width is proportional to `widthMm`, with the width printed under it when the strip is wide enough), the panel summary line, and the crosscut list. Page-break when `y` exceeds `PAGE.heightMm - PAGE.marginMm - 30`, via a `ensureRoom(ctx, needed)` helper that calls `doc.addPage()` and resets `y`.

```ts
function drawStripStack(ctx: PdfContext, panel: PanelCutPlan, y: number): number {
  const { doc, locale } = ctx
  const usableMm = PAGE.widthMm - PAGE.marginMm * 2
  const barHeight = 12
  const scale = panel.widthMm > 0 ? usableMm / panel.widthMm : 0
  let x = PAGE.marginMm
  for (const piece of panel.pieces) {
    const extent = piece.kind === 'strip' ? piece.widthMm : piece.thicknessMm
    const w = extent * scale
    doc.setFillColor(piece.kind === 'strip' ? speciesHex(piece.speciesId) : '#dddddd')
    doc.setDrawColor('#333333')
    doc.setLineWidth(0.2)
    doc.rect(x, y, w, barHeight, 'FD')
    // Подпись влезает не всегда: узкие полосы всё равно перечислены списком ниже.
    if (w > 9) text(ctx, extent.toFixed(0), x + w / 2, y + barHeight / 2 + 1, { size: 7, align: 'center' })
    x += w
  }
  return y + barHeight + 4
}
```

Under the stack, print `cut.strip` lines for every piece (so the numbers exist even where the diagram is too narrow to label), then `cut.panelSummary`, then `cut.crosscutRow` / `cut.crosscutInlay` per crosscut. All dimensions through `bothUnits`.

- [ ] **8.7 Page 3: steps and row order.** Numbered list: `${step.number}. ${t(locale, step.messageKey, step.params)}`, wrapped with `doc.splitTextToSize(line, usableMm)` so long lines do not run off the page, with `ensureRoom` between entries. Below the list, the row-order diagram: one horizontal bar per `RowPlan` stacked top to bottom in board order, height proportional to `thicknessMm`, labelled on the left with the row number and on the right with `F` when `flip` and `M` when `mirror` (letters, not icons, because the fallback helvetica font has no glyph coverage guarantees beyond ASCII). Add a one-line legend explaining `F` and `M` through two new i18n keys, `steps.flipMark` and `steps.mirrorMark`.

- [ ] **8.8 Manual verification in a real browser.** This step cannot be automated and must not be skipped.

```bash
pnpm dev
```

Open the app, click "PDF", open the downloaded file, and check with your own eyes:

1. Russian text is readable, not blank rectangles and not Latin transliteration.
2. The board on page 1 is vector: zoom to 800 % and the cell edges stay crisp.
3. Species colours in the legend match the board and match the editor.
4. Page 2 numbers match what the sidebar shows for the same design.
5. Both millimetres and inches appear on every dimension.
6. Nothing runs off the right or bottom edge on a 40-row design.
7. Switch the app to English, export again, confirm the PDF follows the UI locale.

- [ ] **8.9 Offline degradation check.** In devtools, block `/fonts/*` (Network conditions, or a request-blocking rule) and export again. Expected: a PDF is still produced, its text is English, and the console shows no unhandled rejection. If it produces blank glyphs instead, the `hasCyrillic` downgrade in step 8.4 is wired wrong.

- [ ] **8.10 Go / no-go on the fallback.** If steps 8.8 and 8.9 both pass, the print-HTML fallback is **not** built and Appendix A stays a contingency. If either fails in a way that is not fixable inside two hours, stop, report to Stanislav, and execute Appendix A instead of continuing to fight jsPDF.

- [ ] **8.11 Bundle budget check.**

```bash
pnpm build 2>&1 | grep -A 12 "First Load JS"
```

The first-load JS for `/` must not have grown by more than 2 KB against the baseline from step 8.1. If it grew by 100 KB or more, a static `jspdf` import leaked in; find it with `pnpm build && grep -rl "jspdf" .next/static/chunks | head`.

**Acceptance criteria:**

- Three-page A4 PDF, Cyrillic renders correctly, verified visually by a human.
- Blocking the font files produces an English PDF, not a broken one.
- First-load JS for `/` grew by less than 2 KB.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` green.

**Commit:** `feat: PDF-инструкция для цеха с кириллическим шрифтом`

---

## Task 9: ExportPanel, i18n, end-to-end download tests

**Goal:** four buttons in the editor sidebar that produce four real files, with honest busy and error states, in both locales, proven by Playwright reading the bytes off disk.

**Files:**

- `components/ExportPanel.tsx` (new) + `components/ExportPanel.test.tsx` (new).
- `components/StudioShell.tsx` (edit): mount `ExportPanel` in the sidebar.
- `lib/i18n/ru.ts`, `lib/i18n/en.ts` (edit): `export.*` keys.
- `e2e/export.spec.ts` (new).

**Interfaces:**

```ts
// components/ExportPanel.tsx
export type ExportFormat = 'png' | 'svg' | 'csv' | 'pdf'
export function ExportPanel(): JSX.Element
```

**Steps:**

- [ ] **9.1 i18n keys.** Both dictionaries, same commit.

```ts
// ru.ts
'export.title': 'Экспорт',
'export.hint': 'PNG и SVG для показа, CSV и PDF для цеха',
'export.png': 'PNG',
'export.svg': 'SVG',
'export.csv': 'CSV',
'export.pdf': 'PDF',
'export.busy': 'Готовим',
'export.error': 'Не получилось собрать файл. Попробуйте ещё раз',
'export.caption': '{name}: {width} на {length}, толщина {thickness}',
'aria.exportPanel': 'экспорт проекта',
```

```ts
// en.ts
'export.title': 'Export',
'export.hint': 'PNG and SVG to show, CSV and PDF for the shop',
'export.png': 'PNG',
'export.svg': 'SVG',
'export.csv': 'CSV',
'export.pdf': 'PDF',
'export.busy': 'Working',
'export.error': 'Could not build the file. Please try again',
'export.caption': '{name}: {width} by {length}, thickness {thickness}',
'aria.exportPanel': 'project export',
```

- [ ] **9.2 Failing component test.** `components/ExportPanel.test.tsx`. Mock the browser-only modules, because jsdom cannot run them (repo quirk 5).

```tsx
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExportPanel } from './ExportPanel'
import { useStudio } from '@/lib/store/studio'

const downloadBlob = vi.fn()
const downloadText = vi.fn()
const svgToPngBlob = vi.fn(async () => new Blob(['png'], { type: 'image/png' }))
const buildInstructionPdf = vi.fn(async () => new Blob(['%PDF-1.3'], { type: 'application/pdf' }))

vi.mock('@/lib/export/download', () => ({ downloadBlob: (...a: unknown[]) => downloadBlob(...a), downloadText: (...a: unknown[]) => downloadText(...a) }))
vi.mock('@/lib/export/png', () => ({ svgToPngBlob: (...a: unknown[]) => svgToPngBlob(...a) }))
vi.mock('@/lib/export/pdf', () => ({ buildInstructionPdf: (...a: unknown[]) => buildInstructionPdf(...a) }))

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStudio.getState().resetStudio()
  })

  it('показывает четыре кнопки', () => {
    render(<ExportPanel />)
    for (const id of ['export-png', 'export-svg', 'export-csv', 'export-pdf']) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }
  })

  it('SVG скачивается синхронно и с расширением .svg', () => {
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-svg'))
    expect(downloadText).toHaveBeenCalledTimes(1)
    expect(downloadText.mock.calls[0]?.[1]).toMatch(/\.svg$/)
    expect(String(downloadText.mock.calls[0]?.[0])).toContain('<svg')
  })

  it('CSV уходит с BOM и с точкой с запятой', () => {
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-csv'))
    const [content, name, mime] = downloadText.mock.calls[0] ?? []
    expect(String(content).charCodeAt(0)).toBe(0xfeff)
    expect(String(content)).toContain(';')
    expect(String(name)).toMatch(/\.csv$/)
    expect(String(mime)).toContain('text/csv')
  })

  it('PNG проходит через растеризатор и отдаёт blob', async () => {
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-png'))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(svgToPngBlob).toHaveBeenCalledTimes(1)
    expect(downloadBlob.mock.calls[0]?.[1]).toMatch(/\.png$/)
  })

  it('во время долгой сборки кнопки заблокированы', async () => {
    let release = (): void => {}
    buildInstructionPdf.mockImplementationOnce(
      () => new Promise<Blob>((resolve) => { release = () => resolve(new Blob(['%PDF'])) }),
    )
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-pdf'))
    await waitFor(() => expect(screen.getByTestId('export-pdf')).toBeDisabled())
    expect(screen.getByTestId('export-png')).toBeDisabled()
    await act(async () => { release() })
    await waitFor(() => expect(screen.getByTestId('export-pdf')).toBeEnabled())
  })

  it('падение экспорта показывает сообщение и разблокирует кнопки', async () => {
    buildInstructionPdf.mockRejectedValueOnce(new Error('boom'))
    render(<ExportPanel />)
    fireEvent.click(screen.getByTestId('export-pdf'))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByTestId('export-pdf')).toBeEnabled()
    expect(downloadBlob).not.toHaveBeenCalled()
  })

  it('следует локали интерфейса', () => {
    render(<ExportPanel />)
    expect(screen.getByText('Экспорт')).toBeInTheDocument()
    act(() => { useStudio.getState().setLocale('en') })
    expect(screen.getByText('Export')).toBeInTheDocument()
  })
})
```

- [ ] **9.3 Implement `components/ExportPanel.tsx`.** Zero `useEffect` (repo quirk 1).

```tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t, type MessageKey } from '@/lib/i18n'
import { buildCutPlan, renderBoardSvg, safeFileName } from '@/lib/export'
import { CSV_BOM, cutPlanToCsv } from '@/lib/export/csv'
import { bothUnits } from '@/lib/export/format'
import { rowBandsMm } from '@/lib/engine'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

export type ExportFormat = 'png' | 'svg' | 'csv' | 'pdf'

const BUTTONS: readonly { readonly format: ExportFormat; readonly labelKey: MessageKey }[] = [
  { format: 'png', labelKey: 'export.png' },
  { format: 'svg', labelKey: 'export.svg' },
  { format: 'csv', labelKey: 'export.csv' },
  { format: 'pdf', labelKey: 'export.pdf' },
]

export function ExportPanel() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { model, calc } = useDerived()
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [failed, setFailed] = useState(false)

  const caption = t(locale, 'export.caption', {
    name: design.name,
    width: bothUnits(model.widthMm, locale, 0),
    length: bothUnits(model.lengthMm, locale, 0),
    thickness: bothUnits(model.thicknessMm, locale, 0),
  })

  const run = async (format: ExportFormat): Promise<void> => {
    setBusy(format)
    setFailed(false)
    try {
      // Браузерные модули грузятся по клику: jspdf в первом бандле страницы делать нечего.
      if (format === 'svg') {
        const { downloadText } = await import('@/lib/export/download')
        const svg = renderBoardSvg(model, { title: design.name, caption, maxPx: 1600, rowLabels: rowBandsMm(design) }).svg
        downloadText(svg, safeFileName(design.name, 'svg'), 'image/svg+xml;charset=utf-8')
      } else if (format === 'csv') {
        const { downloadText } = await import('@/lib/export/download')
        const csv = cutPlanToCsv(buildCutPlan(design), { locale })
        downloadText(CSV_BOM + csv, safeFileName(design.name, 'csv'), 'text/csv;charset=utf-8')
      } else if (format === 'png') {
        const [{ downloadBlob }, { svgToPngBlob }] = await Promise.all([import('@/lib/export/download'), import('@/lib/export/png')])
        const rendered = renderBoardSvg(model, { title: design.name, caption, maxPx: 1200 })
        downloadBlob(await svgToPngBlob(rendered, { scale: 2 }), safeFileName(design.name, 'png'))
      } else {
        const [{ downloadBlob }, { buildInstructionPdf }] = await Promise.all([import('@/lib/export/download'), import('@/lib/export/pdf')])
        downloadBlob(await buildInstructionPdf({ design, model, calc, locale }), safeFileName(design.name, 'pdf'))
      }
    } catch {
      // Причина уходит в консоль браузера, пользователю показываем одну человеческую строку.
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card aria-label={t(locale, 'aria.exportPanel')}>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'export.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t(locale, 'export.hint')}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {BUTTONS.map(({ format, labelKey }) => (
            <Button
              key={format}
              size="sm"
              variant="outline"
              data-testid={`export-${format}`}
              disabled={busy !== null}
              onClick={() => { void run(format) }}
            >
              {busy === format ? t(locale, 'export.busy') : t(locale, labelKey)}
            </Button>
          ))}
        </div>
        {failed ? <p role="alert" className="text-sm text-red-600">{t(locale, 'export.error')}</p> : null}
      </CardContent>
    </Card>
  )
}
```

`import('@/lib/export/download')` is dynamic even though `download.ts` is tiny, for one reason: it touches `document` at call time only, but a static import would put it in the server-rendered module graph of a `'use client'` component, and Next would evaluate it during SSR. Keeping every browser module behind the same barrier makes the rule memorable ("browser modules are imported in the handler, always") instead of case-by-case.

- [ ] **9.4 Mount it in the shell.** `components/StudioShell.tsx`, sidebar, after `ComplexityMeter` and before `DiagnosticsPanel`: the export is the natural next action after reading the complexity numbers, and diagnostics stay closest to the bottom where they are scanned last.

```diff
 import { ComplexityMeter } from '@/components/ComplexityMeter'
 import { DiagnosticsPanel } from '@/components/DiagnosticsPanel'
+import { ExportPanel } from '@/components/ExportPanel'
@@
             <ComplexityMeter locale={locale} calc={calc} diagnostics={diagnostics} unit={unit} model={model} />
+            <ExportPanel />
             <DiagnosticsPanel />
```

The sidebar renders for the `editor` and `view3d` views only (`FULL_WIDTH` covers the other three), which is correct: templates, generator and photo import are choosers, and nothing there is worth exporting until it has been applied to the editor. `components/StudioShell.test.tsx` may assert on sidebar contents; run it and update only if it enumerates children exhaustively.

- [ ] **9.5 End-to-end download test.** `e2e/export.spec.ts`.

```ts
import { readFileSync, statSync } from 'node:fs'
import { expect, test, type Download, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

async function download(page: Page, testId: string): Promise<Download> {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByTestId(testId).click()])
  return file
}

async function bytesOf(file: Download): Promise<Buffer> {
  const path = await file.path()
  expect(path).not.toBeNull()
  if (path === null) throw new Error('файл не сохранился')
  expect(statSync(path).size).toBeGreaterThan(0)
  return readFileSync(path)
}

test('SVG скачивается и содержит прямоугольники доски', async ({ page }) => {
  await openStudio(page)
  const file = await download(page, 'export-svg')
  expect(file.suggestedFilename()).toMatch(/\.svg$/)
  const svg = (await bytesOf(file)).toString('utf8')
  expect(svg.startsWith('<svg')).toBe(true)
  // Стартовая шахматка это заведомо больше двадцати ячеек.
  expect(svg.split('<rect').length - 1).toBeGreaterThan(20)
  expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
  expect(svg.includes(String.fromCharCode(0x2014))).toBe(false)
})

test('PNG скачивается непустым и с правильной сигнатурой', async ({ page }) => {
  await openStudio(page)
  const file = await download(page, 'export-png')
  expect(file.suggestedFilename()).toMatch(/\.png$/)
  const bytes = await bytesOf(file)
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  // Одноцветная заглушка весила бы сотни байт: доска с узором заведомо тяжелее.
  expect(bytes.length).toBeGreaterThan(5000)
})

test('CSV скачивается с заголовком и строками на каждую полосу', async ({ page }) => {
  await openStudio(page)
  const file = await download(page, 'export-csv')
  expect(file.suggestedFilename()).toMatch(/\.csv$/)
  const text = (await bytesOf(file)).toString('utf8')
  expect(text.charCodeAt(0)).toBe(0xfeff)
  const lines = text.replace(/^\uFEFF/, '').split('\r\n').filter((l) => l !== '')
  expect(lines[0]).toContain('panel')
  expect(lines.length).toBeGreaterThan(5)
  expect(lines[1]?.split(';').length).toBe(lines[0]?.split(';').length)
})

test('PDF скачивается и это настоящий PDF', async ({ page }) => {
  await openStudio(page)
  const file = await download(page, 'export-pdf')
  expect(file.suggestedFilename()).toMatch(/\.pdf$/)
  const bytes = await bytesOf(file)
  expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-')
  expect(bytes.subarray(-1024).toString('latin1')).toContain('%%EOF')
  // Пустой одностраничный PDF весит около 1 КБ. Три страницы со встроенным шрифтом это десятки КБ.
  expect(bytes.length).toBeGreaterThan(20000)
})

test('во время экспорта кнопки заблокированы и потом снова активны', async ({ page }) => {
  await openStudio(page)
  const pdf = page.getByTestId('export-pdf')
  const [file] = await Promise.all([page.waitForEvent('download'), pdf.click()])
  await file.path()
  await expect(pdf).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('экспорт следует локали интерфейса', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('locale-en').click()
  await expect(page.getByTestId('export-pdf')).toBeVisible()
  const file = await download(page, 'export-csv')
  expect((await bytesOf(file)).toString('utf8')).toContain('Black walnut')
})
```

The `locale-en` test id must be verified against `components/LocaleToggle.tsx` before writing this test; use whatever that component actually exposes.

The PDF weight assertion of 20000 bytes is the single most valuable line in this file: it is what catches "the font silently failed to embed", because a PDF without the embedded TTF is roughly 5 KB.

- [ ] **9.6 Full gate.**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
```

- [ ] **9.7 README.** Tick `экспорт изображения` in the MVP list and add the four bonus items this phase delivered (карта раскроя, схема переклеек, PDF-инструкция, мм и дюймы в экспорте). Keep it to the existing list format, do not restructure the file.

**Acceptance criteria:**

- Four buttons produce four files in Chromium, and the bytes are verified: PNG magic, `%PDF-` plus `%%EOF`, SVG rect count above 20, CSV header plus matching column counts.
- The PDF weighs more than 20 KB, which proves the Cyrillic font actually embedded.
- Buttons disable during work and re-enable after, in both the happy and the failing path.
- Switching to English changes both the UI and the exported content.
- The whole gate is green, including `pnpm build` and `pnpm test:e2e`.

**Commit:** `feat: панель экспорта PNG, SVG, CSV и PDF в редакторе`

---

## Appendix A: contingency, the print-styled HTML fallback

Execute this **only** if step 8.10 says no-go. Roughly three hours.

`components/PrintSheet.tsx`, rendered by `StudioShell` inside a `<div className="hidden print:block">`, gets the same three sections as the PDF: the board (reuse `BoardSvg` directly, it is already a React component), the cut map (an HTML table per panel plus the same strip-stack diagram as an inline SVG), and the numbered steps (an `<ol>`). A `@media print` block in `app/globals.css` hides `main > *:not(.print-sheet)` and sets `@page { size: A4; margin: 14mm }`. The "PDF" button then calls `window.print()` instead of `buildInstructionPdf`.

What is gained: zero dependency risk, perfect Cyrillic (the browser's own fonts), and the user can "Save as PDF" from the print dialog on every desktop OS.

What is lost, and must be said out loud to Stanislav rather than glossed over: the user has to take one extra manual step, page breaks are at the browser's mercy, and the e2e test can no longer assert on file bytes because there is no download event. In that case the e2e coverage degrades to asserting the print sheet is in the DOM with the right number of sections, and the PDF-magic-bytes test is deleted rather than left failing.

If the fallback ships, `jspdf` and `svg2pdf.js` are removed from `package.json` in the same commit. Carrying a 350 KB unused dependency because "we might come back to it" is exactly the kind of debt that makes the day-7 buffer disappear.

## Self-review

**Coverage against the phase brief.** All seven brief items are placed: (1) standalone SVG is Task 6 step 6.5, with the title and caption optional as asked; (2) PNG through canvas with a scale factor and download helpers is 6.7 and 6.8; (3) the cut map, glue-up steps and CSV are Task 7, and the cut map carries strips with widths and species, `panelLengthMm` including kerf, allowance and trims, and crosscuts with thickness, count and row numbers, exactly as specified; (4) the PDF is Task 8 with the three pages described, both unit systems and the Cyrillic font handled concretely rather than waved at; (5) the ExportPanel with four buttons, busy states and locale-following is Task 9; (6) the fallback is decided, deferred with a written justification, and carried as an executable appendix with a named go / no-go step; (7) the e2e assertions are byte-level for all four formats.

**Type consistency against the real shipped API.** Every signature quoted in the "Phase 1-4 API" block was read out of the source in this session, not recalled. Three places where a plausible-looking mistake was avoided and is worth flagging to the implementer: `formatMm` ignores its `unitLabel` in inch mode and always appends `"`, so `bothUnits` passes an empty string on purpose; `PanelSlice.consumer` is a discriminated union whose `row` arm carries `rowId` and whose `sliceRef` arm carries `panelId` plus `elementIndex`, so `Crosscut.rowNumber` must be `number | null` and cannot be derived from the consumer alone; and `rowBandsMm` silently skips rows with a missing panel, which is why row numbering goes through it rather than through `design.rows`. `BoardModel` has no `rows` field and no species list, so the exporters take `Design` and `BoardModel` together, never the model alone.

**Placeholders.** There are none in the sense of "TODO, fill this in later". Two things are deliberately left to the implementer with a stated decision rule rather than a fixed answer, and both are named as such: the exact font URL in step 8.2 (with a fallback list and a `file` check to prove the download is a real TTF), and the `locale-en` test id in step 9.5 (verify against the shipped `LocaleToggle` before writing the assertion). Step 6.9 knowingly lists files that do not exist yet and immediately says what to use instead in that task; that is sequencing, not a gap.

**Weakest points, honestly.** First, the strip-stack diagram on PDF page 2 has no explicit design for the pathological case of a 40-strip panel where each bar is 4 mm wide on paper; the numeric list underneath is the mitigation, but the diagram will look cramped and nobody will notice until a user builds a fine-line pattern. Second, `cutPlanToCsv` reusing the `species` column for the design name on crosscut rows is a compromise that the test locks in; if it feels wrong in the editor it should become a ninth column, and the plan says so rather than pretending the first choice is obviously right. Third, the 20 KB PDF weight threshold is empirical and will need adjusting if the font is subsetted aggressively.
