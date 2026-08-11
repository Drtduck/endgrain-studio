# Phase 3: 3D preview and template library

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Day 3 of the 7-day plan. Two user-visible additions on top of the shipped editor. First, a real 3D preview of the board: the same `BoardModel` that feeds the SVG is turned into one `InstancedMesh` per species, with true proportions in millimetres, an end-grain look (species colour plus deterministic per-cell tone jitter), orbit controls, soft lighting and a contact shadow, loaded as a lazy chunk so the first screen stays light. Second, a library of 16 parametric templates that are provably buildable with today's engine, shown as a gallery of mini SVG previews, one click away from becoming the current design.

**Architecture:** The data flow of phases 1-2 does not change: `Design -> compile -> BoardModel -> {render2d, render3d, calc, validate}`. The 3D layer adds exactly one pure module, `lib/render3d`, which converts a `BoardModel` into per-species arrays of `{position, scale, jitter}` in scene units. That module is plain TypeScript with no React, no three.js and no DOM, so it is unit-tested like the engine. The R3F component on top of it is a thin imperative shell: it writes matrices and colours into `InstancedMesh` and owns no logic worth testing in jsdom. Templates work the same way: one pure builder (`makeGridDesign`) turns a grid function `(col, row) => SpeciesId` into a `Design` with deduplicated panels, and every template is a thin call to it. Nothing in the template layer knows about React, so "does this template validate" is a unit test, not a click.

The studio grows a third dimension of UI state: `view: 'editor' | 'templates' | 'view3d'`, stored next to `locale` and `unit` in the Zustand store. Tabs switch the main column; the editor aside stays visible in `editor` and `view3d` and steps aside for the full-width gallery in `templates`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Zustand 5, immer, Tailwind CSS 4, shadcn/ui (`components/ui/*`), three + @react-three/fiber + @react-three/drei, vitest + @testing-library/react, Playwright, pnpm, Vercel.

## Global Constraints

Copied verbatim from `CLAUDE.md` and carried over from the phase-1 and phase-2 plans. Every task's requirements implicitly include this section.

- Em dash U+2014 is forbidden everywhere: source code, comments, commit messages, UI strings, this plan. Use a hyphen, a colon or parentheses instead. Any occurrence is a defect.
- All user-facing text and all git commit messages are in Russian. Technical terms stay in English.
- All internal dimensions are stored in millimetres as floating point numbers. Inches are presentation only, converted in exactly one place (`lib/units.ts`). Scene units in `lib/render3d` are a rendering detail derived from millimetres at a single constant (`SCENE_SCALE`) and never leak back into the document.
- Domain vocabulary is fixed: the board is made of strips (first glue-up), crosscuts, and a final re-glue. Kerf and allowances are always accounted for.
- `lib/engine` must have zero imports outside itself and the TypeScript standard library. **Phase 3 does not modify a single file under `lib/engine/`.** If an engine change looks necessary, stop and report instead of editing.
- Panel recursion depth is capped at 2 and the only supported cut angle is 0. **No chevron and no herringbone templates in this phase**: angled geometry does not exist yet, and `validate` rejects any non-zero `angleDeg` with an `ANGLE_UNSUPPORTED` error.
- Schema version at rest is `1`. `parseDesign` is the only reader used by web, CLI and OG route.
- No UI literals in components: every user-visible string goes through `t(locale, key)` with the key present in both `lib/i18n/ru.ts` and `lib/i18n/en.ts`.
- Russian is the default locale (`'ru'`); the English dictionary must be updated in the same commit as every new key (`en.ts` is typed `Record<keyof typeof ru, string>`, so `pnpm typecheck` fails on drift, and `lib/i18n/index.test.ts` fails on both drift and em dashes).
- TypeScript is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. Array indexing yields `T | undefined` and must be narrowed, never asserted with `!`.
- Node >= 20.11, pnpm >= 9. CI runs Node 22 and executes `pnpm typecheck && pnpm lint && pnpm test && pnpm build` plus a separate `e2e` job.
- Every task ends with a commit. Small commits, Russian messages, conventional prefix (`feat:`, `test:`, `chore:`, `fix:`).

## Repo quirks to respect (learned in phases 1-2, not negotiable)

1. **`react-hooks/set-state-in-effect`** is an error in this ESLint config. Never mirror props or store values into `useState` from a `useEffect`. If a component must react to a changed input, compute during render or key the subtree. The one legal effect pattern already in the tree is a side effect on the document (`LocaleToggle` setting `document.documentElement.lang`) and the subscription in `useStudioPersistence`.
2. **`exactOptionalPropertyTypes: true`.** `{ foo: undefined }` is not assignable to `{ foo?: string }`. Build optional fields with a conditional spread: `...(value === undefined ? {} : { foo: value })`. This is exactly how `lib/engine/validate.ts` builds `Diagnostic.target`.
3. **`act()` around out-of-band store mutations in tests.** Calling `useStudio.getState().setView('templates')` while a component is mounted must be wrapped: `act(() => { useStudio.getState().setView('templates') })`. Calls in `beforeEach` before any `render` do not need it (see `StudioShell.test.tsx`).
4. **Vitest include globs** are `['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx', 'app/**/*.test.tsx']`. `lib/render3d/*.test.ts` is already matched by the first glob: **no change to `vitest.config.ts` is required**, and adding a redundant glob is a defect, not a safety net. Verify by running the new test file and seeing it collected.
5. **three.js and R3F in jsdom.** There is no WebGL in jsdom. `components/Board3D.tsx` is therefore deliberately excluded from unit tests: rendering a `<Canvas>` would need a mocked WebGL context and would test three.js, not our code. The logic worth testing was extracted into `lib/render3d/*` on purpose. The lazy wrapper is tested with `vi.mock` on the heavy module, so no three.js code ever loads in jsdom.
6. **`data-testid` on shadcn `Button`.** `components/ui/button.tsx` wraps `@base-ui/react/button` and forwards unknown props; the phase-2 test ids (`species-padauk`, `unit-in`, `undo`) prove it. If a new button ever swallows the attribute, wrap it in a `<span data-testid>` rather than changing the UI primitive.
7. **`resetStudio` resets UI defaults.** It spreads `UI_DEFAULTS`, so any new UI field added to that object is reset by `resetStudio` and preserved by `loadDesign`. That is the behaviour we want for `view`.

## Phase 1-2 API this plan builds on (verified against the shipped source, not memory)

```ts
// lib/engine/types.ts
export interface Strip { readonly kind: 'strip'; readonly speciesId: SpeciesId; readonly widthMm: number }
export interface SliceRef { readonly kind: 'sliceRef'; readonly panelId: PanelId; readonly thicknessMm: number; readonly angleDeg: number; readonly offsetMm: number }
export type PanelElement = Strip | SliceRef
export interface Panel { readonly id: PanelId; readonly elements: readonly PanelElement[] }
export interface Row { readonly id: RowId; readonly panelId: PanelId; readonly thicknessMm: number; readonly angleDeg: number; readonly flip: boolean; readonly mirror: boolean; readonly trimMm: number }
export interface BoardSpec { readonly targetWidthMm: number; readonly targetLengthMm: number; readonly thicknessMm: number }
export interface Design { readonly schemaVersion: 1; readonly id: string; readonly name: string; readonly species: readonly SpeciesId[]; readonly panels: readonly Panel[]; readonly rows: readonly Row[]; readonly board: BoardSpec; readonly kerfMm: number; readonly planingAllowanceMm: number; readonly planerWidthMm: number }
export interface Cell { readonly id: string; readonly xMm: number; readonly yMm: number; readonly widthMm: number; readonly heightMm: number; readonly speciesId: SpeciesId; readonly grain: 'end'; readonly origin: CellOrigin }
export interface BoardModel { readonly widthMm: number; readonly lengthMm: number; readonly thicknessMm: number; readonly cells: readonly Cell[]; readonly panelLengthsMm: Readonly<Record<PanelId, number>>; readonly glueUpCount: number; readonly cutCount: number; readonly truncated: boolean }
export const MIN_STRIP_WIDTH_MM = 4; export const DEFAULT_PLANER_WIDTH_MM = 330
export const BOARD_MIN_MM = 50; export const BOARD_MAX_MM = 1200
export const THICKNESS_MIN_MM = 10; export const THICKNESS_MAX_MM = 80
export const MAX_CELLS = 4000; export const WARN_CELLS = 2000

// lib/engine/index.ts (public surface)
export function compile(design: Design): BoardModel
export function validate(design: Design, opts?: ValidateOptions): Diagnostic[]
export interface ValidateOptions { readonly shrinkageByPct?: Readonly<Record<SpeciesId, number>>; readonly knownSpeciesIds?: readonly SpeciesId[] }
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean
export function isStrip(el: PanelElement): el is Strip
export function elementExtentMm(el: PanelElement): number
export function panelWidthMm(panel: Panel): number

// lib/species/index.ts
export const SPECIES: readonly Species[]                      // 16 entries, ordered light to dark
export function speciesHex(id: SpeciesId): string             // '#cccccc' for an unknown id, never throws
export function shrinkageMap(): Record<SpeciesId, number>

// lib/i18n/index.ts
export type Locale = 'ru' | 'en'; export type MessageKey = keyof typeof ru
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string

// lib/designs/samples.ts
export function makeCheckerboard(opts?: CheckerboardOptions): Design   // cellMm=30, cols=8, rows=8, walnut/maple

// lib/store/studio.ts
export interface StudioState {
  readonly history: HistoryState<Design>; readonly locale: Locale; readonly unit: UnitSystem
  readonly activeSpeciesId: SpeciesId; readonly selectedCellId: string | null
  readonly selectedPanelId: PanelId | null; readonly selectedRowId: RowId | null
  readonly hoveredCellId: string | null; readonly pendingFork: PendingFork | null
  setLocale(locale: Locale): void; setUnit(unit: UnitSystem): void
  loadDesign(design: Design): void; resetStudio(design?: Design): void
  undo(): void; redo(): void
  /* plus paint, panel, row and board actions */
}
export function selectDesign(s: StudioState): Design
export function selectCanUndo(s: StudioState): boolean
export function selectCanRedo(s: StudioState): boolean
export function createStudioStore(initialDesign?: Design): StudioStore
export const useStudio: StudioStore

// lib/store/derived.ts
export interface Derived { readonly model: BoardModel; readonly calc: CalcResult; readonly diagnostics: readonly Diagnostic[] }
export function derive(design: Design): Derived        // one-entry memo keyed by document identity
export function useDerived(): Derived

// components/BoardSvg.tsx
export function BoardSvg(props: { model: BoardModel; locale: Locale; maxPx?: number; highlightCellId?: string | null; selectedCellId?: string | null }): JSX.Element
```

Two engine facts that shape every template in this plan:

- `validate` raises **`RAGGED_BOARD` as an `error`** when the panels referenced by rows differ in width by more than 0.01 mm. Every panel used by a row in a template must therefore have exactly the same total width.
- `validate` raises **`PLANER_WIDTH` as an `error`** when `panelWidthMm(panel) > design.planerWidthMm` (default 330). Every template keeps total panel width at or below 330 mm.

## File Structure

New:

- `lib/render3d/instances.ts` - pure conversion `BoardModel -> per-species instance arrays` in scene units, plus `cellJitter` and `cameraDistance`.
- `lib/render3d/instances.test.ts`
- `lib/render3d/color.ts` - hex parsing and deterministic tone shading for the end-grain look.
- `lib/render3d/color.test.ts`
- `components/Board3D.tsx` - the R3F scene. Never imported eagerly, never unit-tested (see quirk 5).
- `components/Board3DPanel.tsx` - lazy loader (`next/dynamic`, `ssr: false`), loading skeleton, WebGL error boundary, cell-budget notice.
- `components/Board3DPanel.test.tsx`
- `components/StudioTabs.tsx` - the three-way view switch.
- `components/StudioTabs.test.tsx`
- `lib/designs/grid.ts` - `makeGridDesign`, `uniform`, `hash2`, `pick`: the parametric core every template is built from.
- `lib/designs/grid.test.ts`
- `lib/designs/templates.ts` - `TEMPLATES` (16 entries), `templateById`, the bespoke `makeInlayBand`.
- `lib/designs/templates.test.ts`
- `components/TemplateGallery.tsx` - card grid with `BoardSvg` thumbnails and the overwrite confirmation.
- `components/TemplateGallery.test.tsx`
- `e2e/view3d.spec.ts`, `e2e/templates.spec.ts`

Modified:

- `package.json` - three, @react-three/fiber, @react-three/drei, @types/three.
- `lib/flags.ts` - `threeD` goes true (the feature ships).
- `lib/store/studio.ts` - `StudioView`, `view`, `setView`, added to `UI_DEFAULTS`.
- `lib/store/studio.test.ts` - one test for the new field.
- `components/StudioShell.tsx` - tabs and the three view bodies.
- `components/StudioShell.test.tsx` - tab switching.
- `lib/i18n/ru.ts`, `lib/i18n/en.ts` - new keys, added by the task that first uses them.
- `playwright.config.ts` - Chromium launch args for software WebGL.

Untouched: everything under `lib/engine/`, `lib/calc/`, `lib/species/`, `lib/persist/`, `lib/units.ts`, `lib/designs/samples.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`.

---

### Task 1: 3D dependencies and the pure instance module

**Files:**
- Modify: `package.json`
- Create: `lib/render3d/color.ts`
- Test: `lib/render3d/color.test.ts`
- Create: `lib/render3d/instances.ts`
- Test: `lib/render3d/instances.test.ts`

**Interfaces:**
- Consumes: `BoardModel`, `Cell`, `SpeciesId` from `@/lib/engine`; `speciesHex` from `@/lib/species`.
- Produces:
```ts
// lib/render3d/color.ts
export interface Rgb { readonly r: number; readonly g: number; readonly b: number }   // 0..1
export function parseHex(hex: string): Rgb | null
export function toHex(rgb: Rgb): string
export function shadeHex(hex: string, amount: number): string          // amount -1..1, -1 -> black, +1 -> white
export function jitteredHex(hex: string, jitter: number, amplitude?: number): string  // amplitude default 0.07

// lib/render3d/instances.ts
export const SCENE_SCALE = 0.005          // 1 мм -> 0.005 сцены
export const CELL_GAP_MM = 0.6
export const MIN_VISIBLE_MM = 0.5
export const MAX_INSTANCES = 4000
export interface InstanceTransform {
  readonly position: readonly [number, number, number]
  readonly scale: readonly [number, number, number]
  readonly jitter: number
}
export interface SpeciesGroup { readonly speciesId: SpeciesId; readonly hex: string; readonly items: readonly InstanceTransform[] }
export interface BoardInstances {
  readonly groups: readonly SpeciesGroup[]
  readonly total: number
  readonly sizeUnits: readonly [number, number, number]
  readonly truncated: boolean
}
export interface BuildOptions { readonly gapMm?: number; readonly maxInstances?: number }
export function cellJitter(cellId: string): number                      // detereministic, -1..1
export function buildInstances(model: BoardModel, opts?: BuildOptions): BoardInstances
export function cameraDistance(instances: BoardInstances): number
```

The whole point of this task is that everything worth asserting about the 3D view lives here, in a module with no React and no three.js. The board is centred on the origin, its underside sits on `y = 0` (so a contact shadow lands under it), and `+y` is the end grain that faces the camera. Cells are shrunk by a fixed gap so glue lines read as geometry instead of as a flat texture.

- [ ] **Step 1: Install the 3D stack**

```bash
pnpm add three @react-three/fiber @react-three/drei
pnpm add -D @types/three
```

Expected: install succeeds with no unmet peer warning about React. `@react-three/fiber` must resolve to a version whose peer range includes `react@19`; if pnpm prints an unmet peer for React, stop and report rather than forcing `--force`.

Verify the versions landed:

```bash
pnpm ls three @react-three/fiber @react-three/drei @types/three
```

- [ ] **Step 2: Write the failing colour test**

Create `lib/render3d/color.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { jitteredHex, parseHex, shadeHex, toHex } from './color'

describe('parseHex', () => {
  it('читает шестизначный hex в доли единицы', () => {
    expect(parseHex('#ffffff')).toEqual({ r: 1, g: 1, b: 1 })
    expect(parseHex('#000000')).toEqual({ r: 0, g: 0, b: 0 })
    const walnut = parseHex('#5b3a24')
    expect(walnut?.r).toBeCloseTo(0x5b / 255, 6)
    expect(walnut?.g).toBeCloseTo(0x3a / 255, 6)
    expect(walnut?.b).toBeCloseTo(0x24 / 255, 6)
  })

  it('возвращает null на мусоре', () => {
    expect(parseHex('')).toBe(null)
    expect(parseHex('#fff')).toBe(null)
    expect(parseHex('walnut')).toBe(null)
    expect(parseHex('#gggggg')).toBe(null)
  })

  it('round-trip не теряет цвет', () => {
    for (const hex of ['#5b3a24', '#e3caa1', '#a8422a', '#000000', '#ffffff']) {
      const rgb = parseHex(hex)
      expect(rgb).not.toBe(null)
      if (rgb) expect(toHex(rgb)).toBe(hex)
    }
  })
})

describe('shadeHex', () => {
  it('нулевой сдвиг оставляет цвет как есть', () => {
    expect(shadeHex('#5b3a24', 0)).toBe('#5b3a24')
  })

  it('положительный сдвиг светлеет, отрицательный темнеет', () => {
    const base = parseHex('#5b3a24')
    const lighter = parseHex(shadeHex('#5b3a24', 0.3))
    const darker = parseHex(shadeHex('#5b3a24', -0.3))
    expect(base).not.toBe(null)
    if (!base || !lighter || !darker) throw new Error('цвет не разобран')
    expect(lighter.r).toBeGreaterThan(base.r)
    expect(darker.r).toBeLessThan(base.r)
  })

  it('упирается в чёрный и белый без переполнения', () => {
    expect(shadeHex('#5b3a24', 5)).toBe('#ffffff')
    expect(shadeHex('#5b3a24', -5)).toBe('#000000')
  })

  it('неизвестный цвет возвращается без изменений', () => {
    expect(shadeHex('нет-такого-цвета', 0.5)).toBe('нет-такого-цвета')
  })
})

describe('jitteredHex', () => {
  it('детерминирован по значению отклонения', () => {
    expect(jitteredHex('#5b3a24', 0.42)).toBe(jitteredHex('#5b3a24', 0.42))
  })

  it('остаётся в пределах амплитуды: соседние ячейки одной породы всё ещё одна порода', () => {
    const base = parseHex('#5b3a24')
    const shifted = parseHex(jitteredHex('#5b3a24', 1))
    if (!base || !shifted) throw new Error('цвет не разобран')
    expect(Math.abs(shifted.r - base.r)).toBeLessThan(0.1)
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run lib/render3d/color.test.ts`
Expected: FAIL, `Failed to resolve import "./color"`.

- [ ] **Step 4: Implement `lib/render3d/color.ts`**

```ts
export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

const HEX_RE = /^#([0-9a-f]{6})$/i

export function parseHex(hex: string): Rgb | null {
  const match = HEX_RE.exec(hex.trim())
  const digits = match?.[1]
  if (digits === undefined) return null
  const value = Number.parseInt(digits, 16)
  return {
    r: ((value >> 16) & 0xff) / 255,
    g: ((value >> 8) & 0xff) / 255,
    b: (value & 0xff) / 255,
  }
}

function channel(value: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, value)) * 255)
  return byte.toString(16).padStart(2, '0')
}

export function toHex(rgb: Rgb): string {
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`
}

/**
 * Сдвиг тона к белому (amount > 0) или к чёрному (amount < 0).
 * Сдвиг линейный по каналу: для мелкой вариации торца этого достаточно,
 * а переход в LAB стоил бы дороже без видимой разницы на 6 процентах.
 */
export function shadeHex(hex: string, amount: number): string {
  const rgb = parseHex(hex)
  if (!rgb) return hex
  const k = Math.min(1, Math.max(-1, amount))
  const mix = (v: number): number => (k >= 0 ? v + (1 - v) * k : v * (1 + k))
  return toHex({ r: mix(rgb.r), g: mix(rgb.g), b: mix(rgb.b) })
}

/** Процедурная вариация торца: та же порода, но каждая ячейка чуть своего тона. */
export function jitteredHex(hex: string, jitter: number, amplitude = 0.07): string {
  return shadeHex(hex, Math.min(1, Math.max(-1, jitter)) * amplitude)
}
```

- [ ] **Step 5: Run and watch it pass**

Run: `pnpm exec vitest run lib/render3d/color.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 6: Write the failing instance test**

Create `lib/render3d/instances.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compile } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { SCENE_SCALE, buildInstances, cameraDistance, cellJitter } from './instances'

const model = compile(makeCheckerboard({ cols: 2, rows: 2, cellMm: 30, thicknessMm: 40 }))

describe('cellJitter', () => {
  it('детерминирован и лежит в диапазоне -1..1', () => {
    for (const id of ['r0:0', 'r0:1', 'r1:0', 'r7:11', 'r0:2:3']) {
      const value = cellJitter(id)
      expect(value).toBe(cellJitter(id))
      expect(value).toBeGreaterThanOrEqual(-1)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('разные ячейки получают разные отклонения', () => {
    expect(cellJitter('r0:0')).not.toBe(cellJitter('r0:1'))
  })
})

describe('buildInstances', () => {
  it('раскладывает ячейки по породам и считает общее число', () => {
    const instances = buildInstances(model)
    expect(instances.total).toBe(4)
    expect(instances.groups.map((g) => g.speciesId).sort()).toEqual(['maple', 'walnut'])
    for (const group of instances.groups) {
      expect(group.items).toHaveLength(2)
      expect(group.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('центрирует доску по X и Z и ставит её на нулевую плоскость', () => {
    const instances = buildInstances(model)
    const all = instances.groups.flatMap((g) => g.items)
    const xs = all.map((i) => i.position[0])
    const zs = all.map((i) => i.position[2])
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9)
    expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 9)
    for (const item of all) {
      expect(item.position[1]).toBeCloseTo((40 / 2) * SCENE_SCALE, 9)
      expect(item.scale[1]).toBeCloseTo(40 * SCENE_SCALE, 9)
    }
  })

  it('ужимает ячейку на клеевой зазор, но не в ноль', () => {
    const wide = buildInstances(model, { gapMm: 0 }).groups[0]?.items[0]
    const gapped = buildInstances(model, { gapMm: 4 }).groups[0]?.items[0]
    if (!wide || !gapped) throw new Error('инстансы не построены')
    expect(wide.scale[0]).toBeCloseTo(30 * SCENE_SCALE, 9)
    expect(gapped.scale[0]).toBeCloseTo(26 * SCENE_SCALE, 9)
    const crushed = buildInstances(model, { gapMm: 100 }).groups[0]?.items[0]
    if (!crushed) throw new Error('инстансы не построены')
    expect(crushed.scale[0]).toBeGreaterThan(0)
  })

  it('отдаёт габарит сцены в тех же единицах', () => {
    const instances = buildInstances(model)
    expect(instances.sizeUnits).toEqual([60 * SCENE_SCALE, 40 * SCENE_SCALE, 60 * SCENE_SCALE])
  })

  it('режет по бюджету инстансов и честно об этом сообщает', () => {
    const big = compile(makeCheckerboard({ cols: 8, rows: 8 }))
    const capped = buildInstances(big, { maxInstances: 10 })
    expect(capped.total).toBe(10)
    expect(capped.truncated).toBe(true)
    expect(buildInstances(big).truncated).toBe(false)
  })

  it('пустая модель не ломает сборку', () => {
    const empty = buildInstances({
      widthMm: 0, lengthMm: 0, thicknessMm: 0, cells: [],
      panelLengthsMm: {}, glueUpCount: 0, cutCount: 0, truncated: false,
    })
    expect(empty.groups).toEqual([])
    expect(empty.total).toBe(0)
    expect(cameraDistance(empty)).toBeGreaterThan(0)
  })
})

describe('cameraDistance', () => {
  it('растёт вместе с доской', () => {
    const small = cameraDistance(buildInstances(compile(makeCheckerboard({ cols: 2, rows: 2 }))))
    const large = cameraDistance(buildInstances(compile(makeCheckerboard({ cols: 10, rows: 10 }))))
    expect(large).toBeGreaterThan(small)
  })
})
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm exec vitest run lib/render3d/instances.test.ts`
Expected: FAIL, `Failed to resolve import "./instances"`.

- [ ] **Step 8: Implement `lib/render3d/instances.ts`**

```ts
import type { BoardModel, SpeciesId } from '@/lib/engine'
import { speciesHex } from '@/lib/species'

/** 1 мм = 0.005 юнита сцены: типовая доска 300 мм ложится в полтора юнита, что удобно камере по умолчанию. */
export const SCENE_SCALE = 0.005
/** Клеевой шов между ячейками, мм: без него узор читается плоским пятном, а не набором брусков. */
export const CELL_GAP_MM = 0.6
/** Ячейка уже этого размера всё равно рисуется: лучше тонкая полоска, чем дыра в доске. */
export const MIN_VISIBLE_MM = 0.5
/** Тот же потолок, что и MAX_CELLS движка: модель физически не может дать больше. */
export const MAX_INSTANCES = 4000

export interface InstanceTransform {
  readonly position: readonly [number, number, number]
  readonly scale: readonly [number, number, number]
  /** Детерминированное отклонение тона по id ячейки, -1..1. */
  readonly jitter: number
}

export interface SpeciesGroup {
  readonly speciesId: SpeciesId
  readonly hex: string
  readonly items: readonly InstanceTransform[]
}

export interface BoardInstances {
  readonly groups: readonly SpeciesGroup[]
  readonly total: number
  /** Габарит доски в юнитах сцены: ширина, толщина, длина. */
  readonly sizeUnits: readonly [number, number, number]
  readonly truncated: boolean
}

export interface BuildOptions {
  readonly gapMm?: number
  readonly maxInstances?: number
}

/** FNV-1a по id ячейки: одна и та же ячейка всегда получает один и тот же оттенок. */
export function cellJitter(cellId: string): number {
  let hash = 2166136261
  for (let i = 0; i < cellId.length; i += 1) {
    hash ^= cellId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 0xffffffff) * 2 - 1
}

/**
 * Модель доски в инстансы: по одному массиву на породу, чтобы сцена рисовалась
 * одним InstancedMesh на породу (16 draw call в худшем случае вместо 4000).
 * Доска центрирована по X и Z и стоит на плоскости y = 0.
 */
export function buildInstances(model: BoardModel, opts: BuildOptions = {}): BoardInstances {
  const gapMm = opts.gapMm ?? CELL_GAP_MM
  const maxInstances = opts.maxInstances ?? MAX_INSTANCES
  const halfWidthMm = model.widthMm / 2
  const halfLengthMm = model.lengthMm / 2
  const thicknessMm = model.thicknessMm

  const buckets = new Map<SpeciesId, InstanceTransform[]>()
  let total = 0
  let truncated = false

  for (const cell of model.cells) {
    if (total >= maxInstances) {
      truncated = true
      break
    }
    const widthMm = Math.max(cell.widthMm - gapMm, MIN_VISIBLE_MM)
    const depthMm = Math.max(cell.heightMm - gapMm, MIN_VISIBLE_MM)
    const item: InstanceTransform = {
      position: [
        (cell.xMm + cell.widthMm / 2 - halfWidthMm) * SCENE_SCALE,
        (thicknessMm / 2) * SCENE_SCALE,
        (cell.yMm + cell.heightMm / 2 - halfLengthMm) * SCENE_SCALE,
      ],
      scale: [widthMm * SCENE_SCALE, thicknessMm * SCENE_SCALE, depthMm * SCENE_SCALE],
      jitter: cellJitter(cell.id),
    }
    const bucket = buckets.get(cell.speciesId)
    if (bucket) bucket.push(item)
    else buckets.set(cell.speciesId, [item])
    total += 1
  }

  const groups: SpeciesGroup[] = []
  for (const [speciesId, items] of buckets) {
    groups.push({ speciesId, hex: speciesHex(speciesId), items })
  }

  return {
    groups,
    total,
    sizeUnits: [model.widthMm * SCENE_SCALE, thicknessMm * SCENE_SCALE, model.lengthMm * SCENE_SCALE],
    truncated: truncated || model.truncated,
  }
}

/** Дистанция камеры, при которой доска любого размера попадает в кадр целиком. */
export function cameraDistance(instances: BoardInstances): number {
  const [widthUnits, , lengthUnits] = instances.sizeUnits
  return Math.max(widthUnits, lengthUnits, 0.2) * 1.9 + 0.3
}
```

- [ ] **Step 9: Run and watch it pass**

Run: `pnpm exec vitest run lib/render3d`
Expected: PASS, 16 tests across two files. Confirm the runner collected `lib/render3d/*.test.ts` without any change to `vitest.config.ts` (quirk 4).

- [ ] **Step 10: Full gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: чистый модуль lib/render3d для инстансов и тона торца"
```

---

### Task 2: The R3F scene and its lazy loader

**Files:**
- Create: `components/Board3D.tsx`
- Create: `components/Board3DPanel.tsx`
- Test: `components/Board3DPanel.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`
- Modify: `lib/flags.ts`

**Interfaces:**
- Consumes: `buildInstances`, `cameraDistance`, `SpeciesGroup` from `@/lib/render3d/instances`; `jitteredHex` from `@/lib/render3d/color`; `useDerived`, `useStudio`, `t`.
- Produces:
```ts
// components/Board3D.tsx
export function Board3D({ model, label }: { model: BoardModel; label: string }): JSX.Element

// components/Board3DPanel.tsx
export function Board3DPanel(): JSX.Element          // data-testid="view3d"
export function Board3DSkeleton(): JSX.Element       // data-testid="view3d-loading"
```

New i18n keys: `view3d.title`, `view3d.loading`, `view3d.hint`, `view3d.unsupported`, `view3d.truncated`, `aria.board3d`.

Two deliberate omissions with reasons, so nobody "fixes" them later:

- **No drei `<Environment preset>`.** Every preset downloads an HDRI from a CDN at runtime. That is a network dependency on the critical path of a wow feature and it breaks behind a strict CSP. Three lights plus `ContactShadows` give a soft studio look with zero fetches.
- **No bevelled geometry.** A shared `RoundedBox` cannot be bevelled uniformly when each instance carries a different non-uniform scale: the fillet would stretch with the cell. The 0.6 mm glue gap already reads as a chamfer at any sane zoom. If a bevel is wanted later it belongs in a custom geometry, not in this task.

- [ ] **Step 1: Add the i18n keys**

In `lib/i18n/ru.ts`, before the closing `} as const`:

```ts
  'view3d.title': '3D-превью',
  'view3d.loading': 'Собираем сцену',
  'view3d.hint': 'Крутите мышью, колесо приближает, правая кнопка двигает',
  'view3d.unsupported': 'Браузер не отдал WebGL, поэтому 3D недоступно. Узор целиком виден во вкладке «Редактор».',
  'view3d.truncated': 'Показаны первые {shown} ячеек из {total}: сцена ограничена бюджетом',
  'aria.board3d': 'трёхмерное превью доски',
```

In `lib/i18n/en.ts`, at the same place:

```ts
  'view3d.title': '3D preview',
  'view3d.loading': 'Building the scene',
  'view3d.hint': 'Drag to orbit, scroll to zoom, right button to pan',
  'view3d.unsupported': 'This browser did not provide WebGL, so 3D is unavailable. The full pattern is on the Editor tab.',
  'view3d.truncated': 'Showing the first {shown} cells out of {total}: the scene is capped by budget',
  'aria.board3d': '3D preview of the board',
```

- [ ] **Step 2: Write `components/Board3D.tsx`**

```tsx
'use client'

import { useLayoutEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import {
  Color,
  InstancedBufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
} from 'three'
import type { BoardModel } from '@/lib/engine'
import { jitteredHex } from '@/lib/render3d/color'
import { buildInstances, cameraDistance, type SpeciesGroup } from '@/lib/render3d/instances'

const NO_ROTATION = new Quaternion()

/**
 * Одна порода = один InstancedMesh. Матрицы и цвета пишутся императивно:
 * React-элемент на каждую ячейку стоил бы 4000 узлов дерева ради данных,
 * которые всё равно уезжают в один буфер.
 */
function SpeciesInstances({ group }: { group: SpeciesGroup }) {
  const meshRef = useRef<InstancedMesh>(null)

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const matrix = new Matrix4()
    const position = new Vector3()
    const scale = new Vector3()
    const color = new Color()
    const colors = new Float32Array(group.items.length * 3)

    group.items.forEach((item, index) => {
      position.set(item.position[0], item.position[1], item.position[2])
      scale.set(item.scale[0], item.scale[1], item.scale[2])
      matrix.compose(position, NO_ROTATION, scale)
      mesh.setMatrixAt(index, matrix)
      color.set(jitteredHex(group.hex, item.jitter))
      colors[index * 3] = color.r
      colors[index * 3 + 1] = color.g
      colors[index * 3 + 2] = color.b
    })

    mesh.instanceMatrix.needsUpdate = true
    mesh.instanceColor = new InstancedBufferAttribute(colors, 3)
    mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [group])

  return (
    <instancedMesh
      ref={meshRef}
      // Геометрия и материал приходят детьми, поэтому первые два аргумента конструктора пустые.
      args={[undefined as unknown as BufferGeometry, undefined as unknown as Material, group.items.length]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={0.72} metalness={0.02} />
    </instancedMesh>
  )
}

export function Board3D({ model, label }: { model: BoardModel; label: string }) {
  const instances = useMemo(() => buildInstances(model), [model])
  const distance = cameraDistance(instances)
  const shadowScale = Math.max(instances.sizeUnits[0], instances.sizeUnits[2]) * 2.4

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [distance * 0.7, distance * 0.8, distance * 0.9], fov: 40 }}
      aria-label={label}
      className="h-full w-full"
    >
      <color attach="background" args={['#f3efe9']} />
      <ambientLight intensity={0.55} />
      <hemisphereLight intensity={0.35} groundColor="#b9a893" />
      <directionalLight
        position={[distance, distance * 1.5, distance * 0.6]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {instances.groups.map((group) => (
        // Число инстансов - аргумент конструктора, поэтому смена размера доски пересоздаёт меш.
        <SpeciesInstances key={`${group.speciesId}:${group.items.length}`} group={group} />
      ))}
      <ContactShadows position={[0, -0.002, 0]} opacity={0.42} scale={shadowScale} blur={2.2} far={1.5} />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        target={[0, 0, 0]}
        minDistance={distance * 0.3}
        maxDistance={distance * 3}
      />
    </Canvas>
  )
}
```

- [ ] **Step 3: Write the failing wrapper test**

Create `components/Board3DPanel.test.tsx`. It mocks the heavy module so three.js never loads in jsdom (quirk 5):

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { Board3DPanel } from './Board3DPanel'

vi.mock('@/components/Board3D', () => ({
  Board3D: ({ label }: { label: string }) => <div data-testid="board3d-stub">{label}</div>,
}))

describe('Board3DPanel', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
  })

  it('подгружает сцену и подписывает её для скринридера', async () => {
    render(<Board3DPanel />)
    await waitFor(() => expect(screen.getByTestId('board3d-stub')).toBeDefined())
    expect(screen.getByTestId('board3d-stub').textContent).toBe('трёхмерное превью доски')
    expect(screen.getByTestId('view3d')).toBeDefined()
  })

  it('показывает подсказку по управлению на языке интерфейса', async () => {
    render(<Board3DPanel />)
    await waitFor(() => expect(screen.getByTestId('board3d-stub')).toBeDefined())
    expect(screen.getByText(/Крутите мышью/)).toBeDefined()
    act(() => { useStudio.getState().setLocale('en') })
    expect(screen.getByText(/Drag to orbit/)).toBeDefined()
  })
})
```

Note the `act()` wrapper on the out-of-band store call (quirk 3).

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm exec vitest run components/Board3DPanel.test.tsx`
Expected: FAIL, `Failed to resolve import "./Board3DPanel"`.

- [ ] **Step 5: Implement `components/Board3DPanel.tsx`**

```tsx
'use client'

import dynamic from 'next/dynamic'
import { Component, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { MAX_INSTANCES } from '@/lib/render3d/instances'
import { useStudio } from '@/lib/store/studio'

export function Board3DSkeleton() {
  const locale = useStudio((s) => s.locale)
  return (
    <div
      data-testid="view3d-loading"
      className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground"
    >
      {t(locale, 'view3d.loading')}
    </div>
  )
}

// three и R3F весят сотни килобайт: первый экран редактора не должен их тянуть.
const Board3D = dynamic(() => import('@/components/Board3D').then((m) => m.Board3D), {
  ssr: false,
  loading: () => <Board3DSkeleton />,
})

/** Класс, а не хук: границы ошибок в React 19 всё ещё только классовые. */
class WebglBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

export function Board3DPanel() {
  const locale = useStudio((s) => s.locale)
  const { model } = useDerived()
  const shown = Math.min(model.cells.length, MAX_INSTANCES)

  return (
    <section data-testid="view3d" aria-label={t(locale, 'view3d.title')} className="flex flex-col gap-2">
      <div className="h-[26rem] w-full overflow-hidden rounded-lg border sm:h-[32rem]">
        <WebglBoundary
          fallback={
            <div
              data-testid="view3d-unsupported"
              className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
            >
              {t(locale, 'view3d.unsupported')}
            </div>
          }
        >
          <Board3D model={model} label={t(locale, 'aria.board3d')} />
        </WebglBoundary>
      </div>
      <p className="text-xs text-muted-foreground">{t(locale, 'view3d.hint')}</p>
      {shown < model.cells.length ? (
        <p className="text-xs text-amber-700">
          {t(locale, 'view3d.truncated', { shown, total: model.cells.length })}
        </p>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 6: Run and watch it pass**

Run: `pnpm exec vitest run components/Board3DPanel.test.tsx`
Expected: PASS, 2 tests.

If `next/dynamic` misbehaves under vitest (the loader never resolves), do **not** add a jsdom shim for WebGL. Replace the two assertions on the stub with a direct render of the same subtree using a plain `import { Board3D }` mock, keep the skeleton and boundary assertions, and note the reason in a comment. The wrapper's job is proven either way, and the real lazy path is covered by the Playwright test in Task 7.

- [ ] **Step 7: Turn the flag on**

In `lib/flags.ts`:

```ts
  threeD: true,
```

The flag stays in the file as documentation of what shipped; it is not consumed by any branch in this phase, because the 3D tab is core UX from now on.

- [ ] **Step 8: Full gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "feat: 3D-сцена доски на react-three-fiber с ленивой загрузкой"
```

In the `pnpm build` output, check that the route's First Load JS did not jump by hundreds of kilobytes. three and drei must appear only as a separate lazily loaded chunk. If they landed in the page chunk, the `dynamic` import was hoisted into a server component or into a top-level `import` somewhere: find it before moving on.

---

### Task 3: View state in the store and the tab bar

**Files:**
- Modify: `lib/store/studio.ts`
- Modify: `lib/store/studio.test.ts`
- Create: `components/StudioTabs.tsx`
- Test: `components/StudioTabs.test.tsx`
- Modify: `components/StudioShell.tsx`
- Modify: `components/StudioShell.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Produces:
```ts
// lib/store/studio.ts
export type StudioView = 'editor' | 'templates' | 'view3d'
// added to StudioState:
//   readonly view: StudioView
//   setView(view: StudioView): void

// components/StudioTabs.tsx
export function StudioTabs(): JSX.Element      // role="tablist", data-testid="tab-editor" | "tab-templates" | "tab-view3d"
```

New i18n keys: `tabs.editor`, `tabs.templates`, `tabs.view3d`, `aria.tabs`.

The `templates` tab renders a placeholder-free stub in this task? No: the tab is added here **without** the templates entry. `StudioTabs` ships with `editor` and `view3d` only, and Task 6 adds the third entry together with the gallery it opens. That keeps every commit shippable and keeps the plan free of placeholder UI.

- [ ] **Step 1: Add the i18n keys**

`lib/i18n/ru.ts`:

```ts
  'tabs.editor': 'Редактор',
  'tabs.templates': 'Шаблоны',
  'tabs.view3d': '3D',
  'aria.tabs': 'разделы студии',
```

`lib/i18n/en.ts`:

```ts
  'tabs.editor': 'Editor',
  'tabs.templates': 'Templates',
  'tabs.view3d': '3D',
  'aria.tabs': 'studio sections',
```

`tabs.templates` is added now even though its tab appears in Task 6: the dictionaries stay in lockstep and Task 6 touches only components.

- [ ] **Step 2: Write the failing store test**

Append to `lib/store/studio.test.ts`:

```ts
describe('вкладки студии', () => {
  it('стартует в редакторе и переключается', () => {
    const store = createStudioStore(baseDesign())
    expect(store.getState().view).toBe('editor')
    store.getState().setView('view3d')
    expect(store.getState().view).toBe('view3d')
  })

  it('загрузка документа не сбрасывает вкладку, а сброс студии сбрасывает', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setView('view3d')
    store.getState().loadDesign(makeCheckerboard({ cols: 2, rows: 2 }))
    expect(store.getState().view).toBe('view3d')
    store.getState().resetStudio()
    expect(store.getState().view).toBe('editor')
  })
})
```

Add `import { makeCheckerboard } from '@/lib/designs/samples'` at the top of the file if it is not already imported.

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run lib/store/studio.test.ts`
Expected: FAIL, `expected undefined to be 'editor'`.

- [ ] **Step 4: Extend the store**

In `lib/store/studio.ts`, next to the other UI types:

```ts
export type StudioView = 'editor' | 'templates' | 'view3d'
```

In `StudioState`, next to `unit`:

```ts
  readonly view: StudioView
```

and next to `setUnit`:

```ts
  setView(view: StudioView): void
```

In `UI_DEFAULTS`:

```ts
  view: 'editor' as StudioView,
```

In the store body, next to `setUnit`:

```ts
      setView: (view) => set({ view }),
```

`loadDesign` is untouched, so opening a template keeps whatever tab the user is on until the gallery explicitly switches it (Task 6). `resetStudio` already spreads `UI_DEFAULTS`, so it resets the tab for free (quirk 7).

- [ ] **Step 5: Run and watch it pass**

Run: `pnpm exec vitest run lib/store/studio.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing tab-bar test**

Create `components/StudioTabs.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { StudioTabs } from './StudioTabs'

describe('StudioTabs', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 2 }))
  })

  it('помечает активную вкладку для скринридера', () => {
    render(<StudioTabs />)
    expect(screen.getByTestId('tab-editor').getAttribute('aria-selected')).toBe('true')
    expect(screen.getByTestId('tab-view3d').getAttribute('aria-selected')).toBe('false')
  })

  it('клик переключает вкладку в сторе', () => {
    render(<StudioTabs />)
    fireEvent.click(screen.getByTestId('tab-view3d'))
    expect(useStudio.getState().view).toBe('view3d')
    expect(screen.getByTestId('tab-view3d').getAttribute('aria-selected')).toBe('true')
  })

  it('переводится вместе с интерфейсом', () => {
    render(<StudioTabs />)
    expect(screen.getByText('Редактор')).toBeDefined()
    fireEvent.click(screen.getByTestId('tab-view3d'))
    useStudio.getState().setLocale('en')
    expect(screen.getByTestId('tab-editor').textContent).toBe('Editor')
  })
})
```

The third test's `setLocale` is triggered from inside a `fireEvent`-free path but the component is subscribed to the store, so wrap it in `act` if React warns: `act(() => { useStudio.getState().setLocale('en') })`.

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm exec vitest run components/StudioTabs.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 8: Implement `components/StudioTabs.tsx`**

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { t, type MessageKey } from '@/lib/i18n'
import { useStudio, type StudioView } from '@/lib/store/studio'

const TABS: readonly { readonly view: StudioView; readonly labelKey: MessageKey }[] = [
  { view: 'editor', labelKey: 'tabs.editor' },
  { view: 'view3d', labelKey: 'tabs.view3d' },
]

export function StudioTabs() {
  const locale = useStudio((s) => s.locale)
  const view = useStudio((s) => s.view)
  const setView = useStudio((s) => s.setView)

  return (
    <div role="tablist" aria-label={t(locale, 'aria.tabs')} className="flex flex-wrap gap-1">
      {TABS.map((tab) => (
        <Button
          key={tab.view}
          role="tab"
          data-testid={`tab-${tab.view}`}
          aria-selected={view === tab.view}
          size="sm"
          variant={view === tab.view ? 'default' : 'outline'}
          onClick={() => setView(tab.view)}
        >
          {t(locale, tab.labelKey)}
        </Button>
      ))}
    </div>
  )
}
```

- [ ] **Step 9: Wire the shell**

Rewrite the body of `components/StudioShell.tsx` (imports plus the returned tree):

```tsx
'use client'

import { Board3DPanel } from '@/components/Board3DPanel'
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
import { StudioTabs } from '@/components/StudioTabs'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { useStudioPersistence } from '@/lib/store/persist'
import { useStudio } from '@/lib/store/studio'

export function StudioShell() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const view = useStudio((s) => s.view)
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

      <StudioTabs />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          {view === 'view3d' ? (
            <Board3DPanel />
          ) : (
            <>
              <section aria-label={t(locale, 'board.title')} className="overflow-x-auto">
                <BoardCanvas />
              </section>
              <PanelInspector />
              <RowInspector />
            </>
          )}
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

The aside stays visible in 3D on purpose: the complexity meter and the diagnostics are exactly what a person wants to watch while turning the board around.

- [ ] **Step 10: Add the shell test**

Append to `components/StudioShell.test.tsx`. It must mock the heavy module the same way Task 2 did, because the shell now imports `Board3DPanel`:

```tsx
vi.mock('@/components/Board3D', () => ({
  Board3D: ({ label }: { label: string }) => <div data-testid="board3d-stub">{label}</div>,
}))

it('вкладка 3D заменяет холст сценой и сохраняет боковую колонку', async () => {
  render(<StudioShell />)
  fireEvent.click(screen.getByTestId('tab-view3d'))
  expect(screen.getByTestId('view3d')).toBeDefined()
  expect(screen.queryByTestId('board-canvas')).toBe(null)
  expect(screen.getByText('Сложность проекта')).toBeDefined()
  fireEvent.click(screen.getByTestId('tab-editor'))
  expect(screen.getByTestId('board-canvas')).toBeDefined()
})
```

Add `vi` to the vitest import at the top of the file.

- [ ] **Step 11: Run the full unit suite**

Run: `pnpm test`
Expected: PASS. Every phase-2 test still passes because the default view is `editor` and the editor tree is unchanged.

- [ ] **Step 12: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: вкладки студии и 3D-раздел в оболочке"
```

---

### Task 4: The parametric grid core for templates

**Files:**
- Create: `lib/designs/grid.ts`
- Test: `lib/designs/grid.test.ts`

**Interfaces:**
- Consumes: `Design`, `Panel`, `Row`, `SpeciesId`, `Strip`, `DEFAULT_PLANER_WIDTH_MM` from `@/lib/engine`; `SPECIES` from `@/lib/species`.
- Produces:
```ts
// lib/designs/grid.ts
export const GRID_THICKNESS_MM = 40
export const GRID_KERF_MM = 3
export const GRID_TRIM_MM = 5
export const GRID_ALLOWANCE_MM = 3
export interface GridSpec {
  readonly id: string
  readonly name: string
  readonly colWidthsMm: readonly number[]
  readonly rowHeightsMm: readonly number[]
  readonly at: (col: number, row: number) => SpeciesId
  readonly thicknessMm?: number
}
export function uniform(count: number, mm: number): number[]
export function hash2(col: number, row: number, seed: number): number
export function pick<T>(list: readonly T[], index: number): T
export function makeGridDesign(spec: GridSpec): Design
```

`makeGridDesign` is the whole template engine. It takes a rectangular grid described by column widths, row heights and a pure `(col, row) => SpeciesId` function, and produces a `Design` in which identical rows share one panel. Panel deduplication is the point: a checkerboard collapses to two panels, a running bond to two, a plain stripe pattern to one, and the complexity meter tells the truth about how many glue-ups the pattern really costs.

Two invariants fall out of the construction and are what make every template pass `validate` without errors: all rows reference panels built from the same `colWidthsMm`, so no `RAGGED_BOARD`; and every element is a `strip` with `angleDeg` irrelevant, so no `ANGLE_UNSUPPORTED`. The caller is responsible for keeping the total width under the planer limit and the strips above 4 mm; Task 5 tests that for all 16 templates.

- [ ] **Step 1: Write the failing test**

Create `lib/designs/grid.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compile, hasErrors, panelWidthMm, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { hash2, makeGridDesign, pick, uniform } from './grid'

const OPTS = { shrinkageByPct: shrinkageMap(), knownSpeciesIds: SPECIES.map((s) => s.id) }

describe('uniform', () => {
  it('делает ровный ряд одинаковых размеров', () => {
    expect(uniform(3, 25)).toEqual([25, 25, 25])
    expect(uniform(0, 25)).toEqual([])
  })
})

describe('hash2 и pick', () => {
  it('хэш детерминирован и зависит от всех трёх аргументов', () => {
    expect(hash2(1, 2, 7)).toBe(hash2(1, 2, 7))
    expect(hash2(1, 2, 7)).not.toBe(hash2(2, 1, 7))
    expect(hash2(1, 2, 7)).not.toBe(hash2(1, 2, 8))
  })

  it('выбор по индексу закольцован', () => {
    expect(pick(['a', 'b'], 0)).toBe('a')
    expect(pick(['a', 'b'], 3)).toBe('b')
  })

  it('пустой список - это ошибка вызова, а не тихий undefined', () => {
    expect(() => pick([], 0)).toThrow()
  })
})

describe('makeGridDesign', () => {
  const checker = makeGridDesign({
    id: 'test-checker',
    name: 'Тест',
    colWidthsMm: uniform(4, 30),
    rowHeightsMm: uniform(4, 30),
    at: (col, row) => ((col + row) % 2 === 0 ? 'walnut' : 'maple'),
  })

  it('схлопывает одинаковые ряды в одну панель', () => {
    expect(checker.panels).toHaveLength(2)
    expect(checker.rows).toHaveLength(4)
    expect(checker.rows.map((r) => r.panelId)).toEqual(['P1', 'P2', 'P1', 'P2'])
  })

  it('все панели рядов одной ширины, поэтому доска не рваная', () => {
    const widths = checker.panels.map(panelWidthMm)
    expect(new Set(widths).size).toBe(1)
    expect(widths[0]).toBe(120)
  })

  it('габарит доски выводится из сетки', () => {
    expect(checker.board).toEqual({ targetWidthMm: 120, targetLengthMm: 120, thicknessMm: 40 })
  })

  it('палитра содержит только использованные породы в порядке справочника', () => {
    expect(checker.species).toEqual(['maple', 'walnut'])
  })

  it('проходит validate без ошибок и компилируется в ожидаемое число ячеек', () => {
    expect(hasErrors(validate(checker, OPTS))).toBe(false)
    expect(compile(checker).cells).toHaveLength(16)
  })

  it('поддерживает разную ширину колонок и разную высоту рядов', () => {
    const design = makeGridDesign({
      id: 'test-pinstripe',
      name: 'Тест',
      colWidthsMm: [46, 8, 46],
      rowHeightsMm: [30, 8, 30],
      at: (col) => (col === 1 ? 'wenge' : 'maple'),
    })
    expect(design.panels).toHaveLength(1)
    expect(design.board.targetWidthMm).toBe(100)
    expect(design.board.targetLengthMm).toBe(68)
    expect(design.rows.map((r) => r.thicknessMm)).toEqual([30, 8, 30])
    expect(hasErrors(validate(design, OPTS))).toBe(false)
  })

  it('уважает заданную толщину доски', () => {
    const design = makeGridDesign({
      id: 'test-thick', name: 'Тест',
      colWidthsMm: uniform(2, 30), rowHeightsMm: uniform(2, 30),
      at: () => 'maple', thicknessMm: 50,
    })
    expect(design.board.thicknessMm).toBe(50)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm exec vitest run lib/designs/grid.test.ts`
Expected: FAIL, `Failed to resolve import "./grid"`.

- [ ] **Step 3: Implement `lib/designs/grid.ts`**

```ts
import { DEFAULT_PLANER_WIDTH_MM, type Design, type Panel, type Row, type SpeciesId, type Strip } from '@/lib/engine'
import { SPECIES } from '@/lib/species'

export const GRID_THICKNESS_MM = 40
export const GRID_KERF_MM = 3
export const GRID_TRIM_MM = 5
export const GRID_ALLOWANCE_MM = 3

/** Порядок справочника пород: палитра проекта печатается от светлого к тёмному, а не как повезло. */
const SPECIES_ORDER = new Map(SPECIES.map((s, index) => [s.id, index]))

export interface GridSpec {
  readonly id: string
  readonly name: string
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
    schemaVersion: 1,
    id: spec.id,
    name: spec.name,
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
```

- [ ] **Step 4: Run and watch it pass**

Run: `pnpm exec vitest run lib/designs/grid.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: параметрическая сетка как основа библиотеки шаблонов"
```

---

### Task 5: Sixteen templates and their names

**Files:**
- Create: `lib/designs/templates.ts`
- Test: `lib/designs/templates.test.ts`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Consumes: `makeGridDesign`, `uniform`, `hash2`, `pick` from `./grid`; `Design`, `SpeciesId` from `@/lib/engine`; `MessageKey` from `@/lib/i18n`.
- Produces:
```ts
// lib/designs/templates.ts
export type TemplateGroup = 'checkerboard' | 'brick' | 'stripes' | 'chess' | 'special'
export interface BoardTemplate {
  readonly id: string
  readonly group: TemplateGroup
  readonly nameKey: MessageKey        // 'tpl.<id>'
  readonly build: () => Design
}
export const TEMPLATES: readonly BoardTemplate[]     // 16 entries
export const TEMPLATE_GROUPS: readonly TemplateGroup[]
export function templateById(id: string): BoardTemplate | undefined
export function groupNameKey(group: TemplateGroup): MessageKey
export function makeInlayBand(): Design
```

Every template obeys the engine as it exists today: depth at most 2, cut angle strictly 0, every panel used by a row exactly 330 mm wide or narrower, every strip at least 4 mm, board dimensions inside 50..1200 mm and thickness inside 10..80 mm. **No chevron, no herringbone, no diagonal cuts**: those need angled geometry, which does not exist and which `validate` rejects outright. The "diagonal" templates here are diagonals of colour on a square grid, which is a real end-grain pattern and is buildable with square blocks.

Fifteen templates are grid functions. The sixteenth, `inlay-band`, is the only one that uses a `SliceRef`, and it exists to prove that depth-2 panels work end to end: a central band whose cells are half the height of the surrounding rows.

- [ ] **Step 1: Add the sixteen names and five group names**

`lib/i18n/ru.ts`:

```ts
  'tplGroup.checkerboard': 'Шахматки',
  'tplGroup.brick': 'Кирпич',
  'tplGroup.stripes': 'Полосы',
  'tplGroup.chess': 'Доски с рамкой',
  'tplGroup.special': 'Особые',
  'tpl.checkerboard-classic': 'Классическая шахматка',
  'tpl.checkerboard-fine': 'Мелкая шахматка',
  'tpl.checkerboard-three': 'Шахматка на три породы',
  'tpl.blocks-2x2': 'Крупные блоки',
  'tpl.brick-half': 'Кирпич вполовину',
  'tpl.brick-third': 'Кирпич в треть',
  'tpl.stripes-wide': 'Широкие полосы',
  'tpl.pinstripe': 'Тонкий кант',
  'tpl.gradient-stripes': 'Градиент по светлоте',
  'tpl.diagonal-ladder': 'Диагональ',
  'tpl.diagonal-fine': 'Мелкая диагональ',
  'tpl.accent-rows': 'Поперечный акцент',
  'tpl.frame-border': 'Шахматка в рамке',
  'tpl.chess-8x8': 'Шахматная доска 8 на 8',
  'tpl.mosaic-random': 'Мозаика',
  'tpl.inlay-band': 'Вставка мелким срезом',
```

`lib/i18n/en.ts`:

```ts
  'tplGroup.checkerboard': 'Checkerboards',
  'tplGroup.brick': 'Brick',
  'tplGroup.stripes': 'Stripes',
  'tplGroup.chess': 'Framed boards',
  'tplGroup.special': 'Special',
  'tpl.checkerboard-classic': 'Classic checkerboard',
  'tpl.checkerboard-fine': 'Fine checkerboard',
  'tpl.checkerboard-three': 'Three species checkerboard',
  'tpl.blocks-2x2': 'Two by two blocks',
  'tpl.brick-half': 'Running bond',
  'tpl.brick-third': 'Third bond brick',
  'tpl.stripes-wide': 'Wide stripes',
  'tpl.pinstripe': 'Pinstripe',
  'tpl.gradient-stripes': 'Tonal gradient',
  'tpl.diagonal-ladder': 'Diagonal ladder',
  'tpl.diagonal-fine': 'Fine diagonal',
  'tpl.accent-rows': 'Accent rows',
  'tpl.frame-border': 'Framed checkerboard',
  'tpl.chess-8x8': 'Chessboard 8 by 8',
  'tpl.mosaic-random': 'Mosaic',
  'tpl.inlay-band': 'Inlay band',
```

- [ ] **Step 2: Write the failing template test**

Create `lib/designs/templates.test.ts`. The first test is the one that matters: every template must be buildable.

```ts
import { describe, it, expect } from 'vitest'
import { compile, panelWidthMm, validate, MIN_STRIP_WIDTH_MM, WARN_CELLS } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import ru from '@/lib/i18n/ru'
import en from '@/lib/i18n/en'
import { TEMPLATES, groupNameKey, templateById } from './templates'

const OPTS = { shrinkageByPct: shrinkageMap(), knownSpeciesIds: SPECIES.map((s) => s.id) }

describe('библиотека шаблонов', () => {
  it('содержит не меньше 16 шаблонов с уникальными id', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(16)
    expect(new Set(TEMPLATES.map((tpl) => tpl.id)).size).toBe(TEMPLATES.length)
  })

  it('у каждого шаблона есть имя в обеих локалях', () => {
    for (const tpl of TEMPLATES) {
      expect(tpl.nameKey).toBe(`tpl.${tpl.id}`)
      expect(ru).toHaveProperty(tpl.nameKey)
      expect(en).toHaveProperty(tpl.nameKey)
      expect(ru).toHaveProperty(groupNameKey(tpl.group))
      expect(en).toHaveProperty(groupNameKey(tpl.group))
    }
  })

  it('поиск по id работает и не врёт на неизвестном', () => {
    expect(templateById('checkerboard-classic')?.id).toBe('checkerboard-classic')
    expect(templateById('нет-такого')).toBe(undefined)
  })
})

describe.each(TEMPLATES.map((tpl) => [tpl.id, tpl] as const))('шаблон %s', (id, tpl) => {
  const design = tpl.build()

  it('проходит validate без единой ошибки', () => {
    const errors = validate(design, OPTS).filter((d) => d.level === 'error')
    expect(errors.map((d) => `${d.code} ${JSON.stringify(d.params)}`)).toEqual([])
  })

  it('строит непустую доску в пределах бюджета ячеек', () => {
    const model = compile(design)
    expect(model.cells.length).toBeGreaterThan(0)
    expect(model.cells.length).toBeLessThanOrEqual(WARN_CELLS)
    expect(model.truncated).toBe(false)
    expect(model.widthMm).toBeGreaterThan(0)
    expect(model.lengthMm).toBeGreaterThan(0)
  })

  it('панели помещаются в рейсмус, а полосы не тоньше минимума', () => {
    for (const panel of design.panels) {
      expect(panelWidthMm(panel)).toBeLessThanOrEqual(design.planerWidthMm)
      for (const el of panel.elements) {
        const extent = el.kind === 'strip' ? el.widthMm : el.thicknessMm
        expect(extent).toBeGreaterThanOrEqual(MIN_STRIP_WIDTH_MM)
        if (el.kind === 'sliceRef') expect(el.angleDeg).toBe(0)
      }
    }
    for (const row of design.rows) expect(row.angleDeg).toBe(0)
  })

  it('детерминирован: два вызова build дают один и тот же документ', () => {
    expect(tpl.build()).toEqual(design)
    expect(id).toBe(design.id)
  })

  it('объявляет ровно те породы, которые использует', () => {
    const used = new Set(compile(design).cells.map((c) => c.speciesId))
    expect([...design.species].sort()).toEqual([...used].sort())
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run lib/designs/templates.test.ts`
Expected: FAIL, `Failed to resolve import "./templates"`.

- [ ] **Step 4: Implement `lib/designs/templates.ts`**

```ts
import type { Design, Panel, Row, SpeciesId } from '@/lib/engine'
import type { MessageKey } from '@/lib/i18n'
import { GRID_ALLOWANCE_MM, GRID_KERF_MM, GRID_THICKNESS_MM, GRID_TRIM_MM, hash2, makeGridDesign, pick, uniform } from './grid'
import { DEFAULT_PLANER_WIDTH_MM } from '@/lib/engine'

export type TemplateGroup = 'checkerboard' | 'brick' | 'stripes' | 'chess' | 'special'

export interface BoardTemplate {
  readonly id: string
  readonly group: TemplateGroup
  readonly nameKey: MessageKey
  readonly build: () => Design
}

export const TEMPLATE_GROUPS: readonly TemplateGroup[] = ['checkerboard', 'brick', 'stripes', 'chess', 'special']

export function groupNameKey(group: TemplateGroup): MessageKey {
  return `tplGroup.${group}` as MessageKey
}

const DARK: SpeciesId = 'walnut'
const LIGHT: SpeciesId = 'maple'
const WARM: SpeciesId = 'cherry'
const ACCENT: SpeciesId = 'padauk'
const BLACK: SpeciesId = 'wenge'

/**
 * Все шаблоны строятся на прямом угле: движок сегодня умеет только angleDeg = 0,
 * поэтому chevron и ёлочки сюда сознательно не попали (validate отбил бы их с ANGLE_UNSUPPORTED).
 * «Диагонали» ниже - диагонали цвета по квадратной сетке, а не косые резы.
 */
function checkerboardClassic(): Design {
  return makeGridDesign({
    id: 'checkerboard-classic',
    name: 'Классическая шахматка',
    colWidthsMm: uniform(8, 30),
    rowHeightsMm: uniform(8, 30),
    at: (col, row) => ((col + row) % 2 === 0 ? DARK : LIGHT),
  })
}

function checkerboardFine(): Design {
  return makeGridDesign({
    id: 'checkerboard-fine',
    name: 'Мелкая шахматка',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => ((col + row) % 2 === 0 ? DARK : LIGHT),
  })
}

function checkerboardThree(): Design {
  return makeGridDesign({
    id: 'checkerboard-three',
    name: 'Шахматка на три породы',
    colWidthsMm: uniform(9, 30),
    rowHeightsMm: uniform(9, 30),
    at: (col, row) => ((col + row) % 2 === 0 ? LIGHT : row % 4 < 2 ? DARK : ACCENT),
  })
}

function blocks2x2(): Design {
  return makeGridDesign({
    id: 'blocks-2x2',
    name: 'Крупные блоки',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => ((Math.floor(col / 2) + Math.floor(row / 2)) % 2 === 0 ? LIGHT : DARK),
  })
}

function brickHalf(): Design {
  return makeGridDesign({
    id: 'brick-half',
    name: 'Кирпич вполовину',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: uniform(10, 30),
    // Кирпич в два блока со сдвигом на половину: нечётный ряд начинается с половинки.
    at: (col, row) => (Math.floor((col + (row % 2)) / 2) % 2 === 0 ? LIGHT : DARK),
  })
}

function brickThird(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, DARK, WARM]
  return makeGridDesign({
    id: 'brick-third',
    name: 'Кирпич в треть',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => pick(palette, Math.floor((col + (row % 3)) / 3) + row),
  })
}

function stripesWide(): Design {
  return makeGridDesign({
    id: 'stripes-wide',
    name: 'Широкие полосы',
    colWidthsMm: uniform(6, 50),
    rowHeightsMm: uniform(8, 30),
    at: (col) => (col % 2 === 0 ? LIGHT : DARK),
  })
}

function pinstripe(): Design {
  // Шесть пар «широкая полоса плюс кант»: 6 * (46 + 8) = 324 мм, впритык под рейсмус 330.
  const cols: number[] = []
  for (let i = 0; i < 6; i += 1) cols.push(46, 8)
  return makeGridDesign({
    id: 'pinstripe',
    name: 'Тонкий кант',
    colWidthsMm: cols,
    rowHeightsMm: uniform(8, 35),
    at: (col) => (col % 2 === 1 ? BLACK : LIGHT),
  })
}

function gradientStripes(): Design {
  const ramp: readonly SpeciesId[] = ['maple', 'ash', 'red-oak', 'cherry', 'walnut', 'wenge']
  return makeGridDesign({
    id: 'gradient-stripes',
    name: 'Градиент по светлоте',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(8, 30),
    // Зеркальная лесенка: светлое по краям, тёмное в середине.
    at: (col) => pick(ramp, col < 6 ? col : 11 - col),
  })
}

function diagonalLadder(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, WARM, DARK, BLACK]
  return makeGridDesign({
    id: 'diagonal-ladder',
    name: 'Диагональ',
    colWidthsMm: uniform(8, 35),
    rowHeightsMm: uniform(12, 30),
    at: (col, row) => pick(palette, col + row),
  })
}

function diagonalFine(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, ACCENT, DARK]
  return makeGridDesign({
    id: 'diagonal-fine',
    name: 'Мелкая диагональ',
    colWidthsMm: uniform(12, 25),
    rowHeightsMm: uniform(12, 25),
    at: (col, row) => pick(palette, col + row * 2),
  })
}

function accentRows(): Design {
  // Каждый третий ряд - тонкий поперечный акцент 8 мм.
  const rowsMm: number[] = []
  for (let i = 0; i < 4; i += 1) rowsMm.push(30, 30, 8)
  return makeGridDesign({
    id: 'accent-rows',
    name: 'Поперечный акцент',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: rowsMm,
    at: (col, row) => (row % 3 === 2 ? ACCENT : (col + row) % 2 === 0 ? LIGHT : DARK),
  })
}

function frameBorder(): Design {
  const size = 10
  return makeGridDesign({
    id: 'frame-border',
    name: 'Шахматка в рамке',
    colWidthsMm: uniform(size, 30),
    rowHeightsMm: uniform(size, 30),
    at: (col, row) => {
      const onBorder = col === 0 || row === 0 || col === size - 1 || row === size - 1
      if (onBorder) return BLACK
      return (col + row) % 2 === 0 ? LIGHT : DARK
    },
  })
}

function chess8x8(): Design {
  // Настоящее игровое поле: 8 клеток по 32 мм плюс бортик 20 мм с каждой стороны.
  const cols = [20, ...uniform(8, 32), 20]
  return makeGridDesign({
    id: 'chess-8x8',
    name: 'Шахматная доска 8 на 8',
    colWidthsMm: cols,
    rowHeightsMm: cols,
    at: (col, row) => {
      const onBorder = col === 0 || row === 0 || col === cols.length - 1 || row === cols.length - 1
      if (onBorder) return WARM
      return (col + row) % 2 === 0 ? LIGHT : DARK
    },
  })
}

function mosaicRandom(): Design {
  const palette: readonly SpeciesId[] = [LIGHT, WARM, DARK, ACCENT]
  return makeGridDesign({
    id: 'mosaic-random',
    name: 'Мозаика',
    colWidthsMm: uniform(10, 30),
    rowHeightsMm: uniform(10, 30),
    // Сид зашит: «случайный» узор обязан быть одинаковым у всех, иначе ссылка покажет другую доску.
    at: (col, row) => pick(palette, hash2(col, row, 1337)),
  })
}

/**
 * Единственный шаблон с SliceRef: центральная вставка - срез отдельной панели,
 * поэтому в середине доски ячейки вдвое мельче рядов. Глубина ровно 2, угол 0.
 */
export function makeInlayBand(): Design {
  const inner: Panel = {
    id: 'INNER',
    elements: Array.from({ length: 12 }, (_, i) => ({
      kind: 'strip' as const,
      speciesId: i % 2 === 0 ? ACCENT : LIGHT,
      widthMm: 15,
    })),
  }
  const main: Panel = {
    id: 'MAIN',
    elements: [
      { kind: 'strip', speciesId: LIGHT, widthMm: 60 },
      { kind: 'strip', speciesId: DARK, widthMm: 30 },
      { kind: 'sliceRef', panelId: 'INNER', thicknessMm: 90, angleDeg: 0, offsetMm: 0 },
      { kind: 'strip', speciesId: DARK, widthMm: 30 },
      { kind: 'strip', speciesId: LIGHT, widthMm: 60 },
    ],
  }
  const rows: Row[] = Array.from({ length: 8 }, (_, i) => ({
    id: `r${i}`,
    panelId: 'MAIN',
    thicknessMm: 30,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))

  return {
    schemaVersion: 1,
    id: 'inlay-band',
    name: 'Вставка мелким срезом',
    species: [LIGHT, ACCENT, DARK],
    panels: [main, inner],
    rows,
    board: { targetWidthMm: 270, targetLengthMm: 240, thicknessMm: GRID_THICKNESS_MM },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}

function template(id: string, group: TemplateGroup, build: () => Design): BoardTemplate {
  return { id, group, nameKey: `tpl.${id}` as MessageKey, build }
}

export const TEMPLATES: readonly BoardTemplate[] = [
  template('checkerboard-classic', 'checkerboard', checkerboardClassic),
  template('checkerboard-fine', 'checkerboard', checkerboardFine),
  template('checkerboard-three', 'checkerboard', checkerboardThree),
  template('blocks-2x2', 'checkerboard', blocks2x2),
  template('brick-half', 'brick', brickHalf),
  template('brick-third', 'brick', brickThird),
  template('stripes-wide', 'stripes', stripesWide),
  template('pinstripe', 'stripes', pinstripe),
  template('gradient-stripes', 'stripes', gradientStripes),
  template('diagonal-ladder', 'stripes', diagonalLadder),
  template('diagonal-fine', 'stripes', diagonalFine),
  template('accent-rows', 'stripes', accentRows),
  template('frame-border', 'chess', frameBorder),
  template('chess-8x8', 'chess', chess8x8),
  template('mosaic-random', 'special', mosaicRandom),
  template('inlay-band', 'special', makeInlayBand),
]

export function templateById(id: string): BoardTemplate | undefined {
  return TEMPLATES.find((tpl) => tpl.id === id)
}
```

`MessageKey` is `keyof typeof ru`, a union of literals, so `` `tpl.${id}` as MessageKey `` is a cast. The test in Step 2 is what makes that cast safe: it asserts every `nameKey` really exists in both dictionaries and fails the build otherwise.

- [ ] **Step 5: Run and fix what the engine complains about**

Run: `pnpm exec vitest run lib/designs/templates.test.ts`
Expected: PASS, 3 + 16 * 5 = 83 tests.

If a template reports an error diagnostic, the message names the cause and the fix is arithmetic, not architecture:

- `PLANER_WIDTH`: total column width exceeds 330 mm. Reduce a column count or a cell size.
- `RAGGED_BOARD`: impossible through `makeGridDesign`; if it appears, a bespoke builder (only `inlay-band` is one) has panels of unequal width in rows.
- `MIN_STRIP_WIDTH`: a column narrower than 4 mm.
- `DIMENSION_SANITY`: board width or length outside 50..1200 mm, or thickness outside 10..80 mm.
- `CELL_BUDGET` at error level: more than 4000 cells. No template here comes near it.
- `UNKNOWN_SPECIES`: a species id that is not in `lib/species`. The valid ids are exactly the sixteen in `SPECIES`.

Do not silence a diagnostic by loosening `planerWidthMm` in a template: the planer limit is a real machine, and a template that needs a wider one is a template a woodworker cannot build.

- [ ] **Step 6: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: библиотека из 16 изготовимых шаблонов доски"
```

---

### Task 6: The template gallery and its tab

**Files:**
- Create: `components/TemplateGallery.tsx`
- Test: `components/TemplateGallery.test.tsx`
- Modify: `components/StudioTabs.tsx`
- Modify: `components/StudioShell.tsx`
- Modify: `components/StudioShell.test.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`

**Interfaces:**
- Consumes: `TEMPLATES`, `TEMPLATE_GROUPS`, `groupNameKey`, `BoardTemplate`; `compile` from `@/lib/engine`; `BoardSvg`; `useStudio`, `selectCanUndo`, `selectCanRedo`.
- Produces:
```ts
// components/TemplateGallery.tsx
export function TemplateGallery(): JSX.Element   // data-testid="template-gallery"
                                                 // cards: data-testid={`template-${id}`}
                                                 // confirm: data-testid="template-confirm" | "template-cancel" | "template-confirm-dialog"
```

New i18n keys: `templates.title`, `templates.subtitle`, `templates.size`, `templates.glueUps`, `templates.confirmTitle`, `templates.confirmBody`, `templates.confirmApply`, `templates.confirmCancel`, `aria.templateGallery`.

Applying a template calls `loadDesign`, which calls `resetHistory`: the undo stack is dropped. That is why a design with edit history gets a confirmation, and a fresh one does not. The check is `selectCanUndo(state) || selectCanRedo(state)`, which is precisely "the user has changed something in this session".

Thumbnails are compiled once at module scope, not per render. Sixteen `compile` calls over roughly 1600 cells total is well under a millisecond, and the resulting `BoardModel`s are immutable, so hoisting them out of React costs nothing and keeps tab switching instant.

- [ ] **Step 1: Add the i18n keys**

`lib/i18n/ru.ts`:

```ts
  'templates.title': 'Библиотека шаблонов',
  'templates.subtitle': 'Выберите узор, дальше его можно править руками',
  'templates.size': '{widthMm} × {lengthMm} мм',
  'templates.glueUps': 'склеек: {count}',
  'templates.confirmTitle': 'Заменить текущий проект?',
  'templates.confirmBody': 'Шаблон «{name}» заменит доску целиком, а история правок обнулится.',
  'templates.confirmApply': 'Заменить',
  'templates.confirmCancel': 'Отмена',
  'aria.templateGallery': 'галерея шаблонов доски',
```

`lib/i18n/en.ts`:

```ts
  'templates.title': 'Template library',
  'templates.subtitle': 'Pick a pattern, then edit it by hand',
  'templates.size': '{widthMm} × {lengthMm} mm',
  'templates.glueUps': 'glue-ups: {count}',
  'templates.confirmTitle': 'Replace the current project?',
  'templates.confirmBody': 'Template "{name}" replaces the whole board and clears the edit history.',
  'templates.confirmApply': 'Replace',
  'templates.confirmCancel': 'Cancel',
  'aria.templateGallery': 'board template gallery',
```

- [ ] **Step 2: Write the failing gallery test**

Create `components/TemplateGallery.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { TEMPLATES } from '@/lib/designs/templates'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { TemplateGallery } from './TemplateGallery'

describe('TemplateGallery', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard({ cols: 2, rows: 4 }))
  })

  it('показывает карточку с превью на каждый шаблон', () => {
    const { container } = render(<TemplateGallery />)
    expect(screen.getByTestId('template-gallery')).toBeDefined()
    for (const tpl of TEMPLATES) expect(screen.getByTestId(`template-${tpl.id}`)).toBeDefined()
    expect(container.querySelectorAll('[data-testid^="template-"] svg').length).toBe(TEMPLATES.length)
  })

  it('на чистом проекте применяет шаблон сразу и уводит в редактор', () => {
    render(<TemplateGallery />)
    fireEvent.click(screen.getByTestId('template-stripes-wide'))
    expect(screen.queryByTestId('template-confirm-dialog')).toBe(null)
    expect(selectDesign(useStudio.getState()).id).toBe('stripes-wide')
    expect(useStudio.getState().view).toBe('editor')
  })

  it('на изменённом проекте сначала спрашивает подтверждение', () => {
    act(() => { useStudio.getState().setBoardThicknessMm(50) })
    render(<TemplateGallery />)
    fireEvent.click(screen.getByTestId('template-pinstripe'))
    expect(screen.getByTestId('template-confirm-dialog')).toBeDefined()
    expect(selectDesign(useStudio.getState()).id).not.toBe('pinstripe')

    fireEvent.click(screen.getByTestId('template-confirm'))
    expect(selectDesign(useStudio.getState()).id).toBe('pinstripe')
    expect(useStudio.getState().view).toBe('editor')
  })

  it('отмена оставляет доску нетронутой', () => {
    act(() => { useStudio.getState().setBoardThicknessMm(50) })
    render(<TemplateGallery />)
    const before = selectDesign(useStudio.getState())
    fireEvent.click(screen.getByTestId('template-mosaic-random'))
    fireEvent.click(screen.getByTestId('template-cancel'))
    expect(screen.queryByTestId('template-confirm-dialog')).toBe(null)
    expect(selectDesign(useStudio.getState())).toBe(before)
  })

  it('названия шаблонов переводятся', () => {
    render(<TemplateGallery />)
    expect(screen.getByText('Классическая шахматка')).toBeDefined()
    act(() => { useStudio.getState().setLocale('en') })
    expect(screen.getByText('Classic checkerboard')).toBeDefined()
  })
})
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm exec vitest run components/TemplateGallery.test.tsx`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `components/TemplateGallery.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { Button } from '@/components/ui/button'
import { compile, type BoardModel } from '@/lib/engine'
import { TEMPLATES, TEMPLATE_GROUPS, groupNameKey, type BoardTemplate } from '@/lib/designs/templates'
import { t } from '@/lib/i18n'
import { selectCanRedo, selectCanUndo, useStudio } from '@/lib/store/studio'

/**
 * Превью считаются один раз на модуль: документы шаблонов неизменяемы,
 * поэтому переключение вкладки не должно каждый раз перекомпилировать 16 досок.
 */
const PREVIEWS: ReadonlyMap<string, BoardModel> = new Map(
  TEMPLATES.map((tpl) => [tpl.id, compile(tpl.build())]),
)

export function TemplateGallery() {
  const locale = useStudio((s) => s.locale)
  const loadDesign = useStudio((s) => s.loadDesign)
  const setView = useStudio((s) => s.setView)
  const dirty = useStudio((s) => selectCanUndo(s) || selectCanRedo(s))
  const [pending, setPending] = useState<BoardTemplate | null>(null)

  const apply = (tpl: BoardTemplate): void => {
    loadDesign(tpl.build())
    setPending(null)
    setView('editor')
  }

  const onPick = (tpl: BoardTemplate): void => {
    // Загрузка шаблона обнуляет историю правок, поэтому спрашиваем, только если правки были.
    if (dirty) setPending(tpl)
    else apply(tpl)
  }

  return (
    <section
      data-testid="template-gallery"
      aria-label={t(locale, 'aria.templateGallery')}
      className="flex flex-col gap-4"
    >
      <div>
        <h2 className="text-lg font-semibold">{t(locale, 'templates.title')}</h2>
        <p className="text-sm text-muted-foreground">{t(locale, 'templates.subtitle')}</p>
      </div>

      {TEMPLATE_GROUPS.map((group) => {
        const items = TEMPLATES.filter((tpl) => tpl.group === group)
        if (items.length === 0) return null
        return (
          <div key={group} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{t(locale, groupNameKey(group))}</h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((tpl) => {
                const model = PREVIEWS.get(tpl.id)
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      data-testid={`template-${tpl.id}`}
                      onClick={() => onPick(tpl)}
                      className="flex w-full cursor-pointer flex-col items-center gap-2 rounded-lg border p-2 text-center transition-colors hover:bg-muted"
                    >
                      {model ? <BoardSvg model={model} locale={locale} maxPx={140} /> : null}
                      <span className="text-sm font-medium">{t(locale, tpl.nameKey)}</span>
                      {model ? (
                        <span className="text-xs text-muted-foreground">
                          {t(locale, 'templates.size', {
                            widthMm: Math.round(model.widthMm),
                            lengthMm: Math.round(model.lengthMm),
                          })}
                          {', '}
                          {t(locale, 'templates.glueUps', { count: model.glueUpCount })}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}

      {pending ? (
        <div
          data-testid="template-confirm-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={t(locale, 'templates.confirmTitle')}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border bg-background p-4 shadow-lg"
        >
          <h3 className="font-semibold">{t(locale, 'templates.confirmTitle')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(locale, 'templates.confirmBody', { name: t(locale, pending.nameKey) })}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <Button data-testid="template-cancel" size="sm" variant="outline" onClick={() => setPending(null)}>
              {t(locale, 'templates.confirmCancel')}
            </Button>
            <Button data-testid="template-confirm" size="sm" onClick={() => apply(pending)}>
              {t(locale, 'templates.confirmApply')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}
```

`pending` is component state set from an event handler, never from an effect: quirk 1 is satisfied by construction.

- [ ] **Step 5: Run and watch it pass**

Run: `pnpm exec vitest run components/TemplateGallery.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Add the tab**

In `components/StudioTabs.tsx`, extend the `TABS` array so the order reads editor, templates, 3D:

```ts
const TABS: readonly { readonly view: StudioView; readonly labelKey: MessageKey }[] = [
  { view: 'editor', labelKey: 'tabs.editor' },
  { view: 'templates', labelKey: 'tabs.templates' },
  { view: 'view3d', labelKey: 'tabs.view3d' },
]
```

- [ ] **Step 7: Render the gallery in the shell**

In `components/StudioShell.tsx`, add the import and give `templates` the full width by returning early from the grid:

```tsx
import { TemplateGallery } from '@/components/TemplateGallery'
```

Replace the grid block with:

```tsx
      {view === 'templates' ? (
        <TemplateGallery />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-4">
            {view === 'view3d' ? (
              <Board3DPanel />
            ) : (
              <>
                <section aria-label={t(locale, 'board.title')} className="overflow-x-auto">
                  <BoardCanvas />
                </section>
                <PanelInspector />
                <RowInspector />
              </>
            )}
          </div>

          <aside className="flex flex-col gap-4">
            <SpeciesPalette />
            <BoardSettings />
            <ComplexityMeter locale={locale} calc={calc} diagnostics={diagnostics} unit={unit} model={model} />
            <DiagnosticsPanel />
          </aside>
        </div>
      )}
```

- [ ] **Step 8: Extend the shell test**

Append to `components/StudioShell.test.tsx`:

```tsx
it('вкладка шаблонов отдаёт всю ширину галерее и возвращает в редактор после выбора', () => {
  render(<StudioShell />)
  fireEvent.click(screen.getByTestId('tab-templates'))
  expect(screen.getByTestId('template-gallery')).toBeDefined()
  expect(screen.queryByTestId('board-canvas')).toBe(null)

  fireEvent.click(screen.getByTestId('template-chess-8x8'))
  expect(useStudio.getState().view).toBe('editor')
  expect(screen.getByTestId('board-canvas')).toBeDefined()
})
```

The starting design in this file's `beforeEach` comes from `resetStudio`, so there is no undo history and no confirmation appears.

- [ ] **Step 9: Full unit suite**

Run: `pnpm test`
Expected: PASS, all phase-1, phase-2 and phase-3 tests.

- [ ] **Step 10: Gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
git add -A
git commit -m "feat: галерея шаблонов и вкладка выбора узора"
```

---

### Task 7: Playwright coverage for both features

**Files:**
- Modify: `playwright.config.ts`
- Create: `e2e/view3d.spec.ts`
- Create: `e2e/templates.spec.ts`

**Interfaces:**
- Consumes: the test-id contract from Tasks 2, 3 and 6: `tab-editor`, `tab-templates`, `tab-view3d`, `view3d`, `view3d-loading`, `view3d-unsupported`, `template-gallery`, `template-<id>`, `template-confirm`, `template-cancel`, plus `board-canvas`, `board-thickness` and `rect[data-cell="<id>"]` from phase 2.
- Produces: `pnpm test:e2e` covering 6 scenarios and a green `e2e` job in CI. `.github/workflows/ci.yml` needs no change: it already runs `pnpm test:e2e` against the whole `e2e` directory.

Headless Chromium has no GPU. Without an explicit flag it may refuse a WebGL context, and then the boundary would render the unsupported fallback and the test would be green for the wrong reason. The launch args force the software rasteriser, and the assertion is on a real `<canvas>` element inside the 3D section.

- [ ] **Step 1: Force software WebGL in the Chromium project**

In `playwright.config.ts`, replace the `projects` entry:

```ts
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // В headless нет GPU: без программного растеризатора Chromium не отдаёт WebGL-контекст,
        // и 3D-вкладка честно показала бы заглушку вместо сцены.
        launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
```

- [ ] **Step 2: Write the 3D spec**

Create `e2e/view3d.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('вкладка 3D рисует канвас и не грузится на первом экране', async ({ page }) => {
  await openStudio(page)
  // До клика тяжёлый чанк не нужен: на первом экране канваса нет.
  await expect(page.locator('canvas')).toHaveCount(0)

  await page.getByTestId('tab-view3d').click()
  await expect(page.getByTestId('view3d')).toBeVisible()

  const canvas = page.locator('[data-testid="view3d"] canvas')
  await expect(canvas).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('view3d-unsupported')).toHaveCount(0)

  const box = await canvas.boundingBox()
  expect(box?.width ?? 0).toBeGreaterThan(200)
  expect(box?.height ?? 0).toBeGreaterThan(200)
})

test('возврат в редактор возвращает холст, счётчик виден в обеих вкладках', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-view3d').click()
  await expect(page.locator('[data-testid="view3d"] canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Габарит:/)).toBeVisible()

  await page.getByTestId('tab-editor').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
})

test('сцена переживает правку доски', async ({ page }) => {
  await openStudio(page)
  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('60')
  await thickness.blur()

  await page.getByTestId('tab-view3d').click()
  await expect(page.locator('[data-testid="view3d"] canvas')).toBeVisible({ timeout: 30_000 })
  // Ошибка в сцене подняла бы границу ошибок и подменила канвас заглушкой.
  await expect(page.getByTestId('view3d-unsupported')).toHaveCount(0)
})
```

- [ ] **Step 3: Write the templates spec**

Create `e2e/templates.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test'

async function openStudio(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
}

test('выбор шаблона меняет доску', async ({ page }) => {
  await openStudio(page)
  await page.getByTestId('tab-templates').click()
  await expect(page.getByTestId('template-gallery')).toBeVisible()

  await page.getByTestId('template-chess-8x8').click()

  // Шаблон применён: мы снова в редакторе, а угловая ячейка стала бортиком из вишни.
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.locator('rect[data-cell="r0:0"]')).toHaveAttribute('fill', '#a5613b')
  await expect(page.getByText(/Габарит: 296/)).toBeVisible()
})

test('шаблон поверх правок сначала спрашивает', async ({ page }) => {
  await openStudio(page)
  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('60')
  await thickness.blur()

  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-stripes-wide').click()
  await expect(page.getByTestId('template-confirm-dialog')).toBeVisible()

  await page.getByTestId('template-cancel').click()
  await expect(page.getByTestId('template-confirm-dialog')).toBeHidden()

  await page.getByTestId('template-stripes-wide').click()
  await page.getByTestId('template-confirm').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.locator('rect[data-cell="r0:0"]')).toHaveAttribute('fill', '#e3caa1')
})

test('шаблон переживает перезагрузку страницы', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => window.localStorage.clear())
  await page.reload()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  await page.getByTestId('tab-templates').click()
  await page.getByTestId('template-pinstripe').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()

  await page.waitForFunction(() => window.localStorage.getItem('endgrain.current.v1') !== null)
  await page.reload()
  await expect(page.locator('rect[data-cell="r0:1"]')).toHaveAttribute('fill', '#3a2a20')
})
```

The two hex values are load-bearing and come from `lib/species/index.ts`: cherry is `#a5613b` (the chessboard border), maple is `#e3caa1` (the first wide stripe), wenge is `#3a2a20` (the pinstripe in column 1).

- [ ] **Step 4: Run the e2e suite**

Run: `pnpm test:e2e`
Expected: PASS, 4 phase-2 tests plus 6 new ones, 10 total.

If the 3D canvas assertion fails with a WebGL error in the console, read the console output before changing anything: `page.on('console', ...)`. A missing `--enable-unsafe-swiftshader` shows up as "WebGL is not supported"; a real bug in the scene shows up as a three.js exception and the `view3d-unsupported` fallback. Only the second case is our defect.

- [ ] **Step 5: Full gate and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e
git add -A
git commit -m "test: e2e на 3D-вкладку и выбор шаблона"
```

- [ ] **Step 6: Verify on the deploy**

Push to `main`, wait for CI (`check` and `e2e` jobs) and for the Vercel deployment, then open the production URL and check by hand:

1. The first screen still loads without the 3D chunk (Network tab: no three.js request until the 3D tab is clicked).
2. The 3D tab renders the board with visible depth, orbit and zoom respond, the shadow sits under the board.
3. The templates tab shows 16 thumbnails, all readable at card size.
4. Picking a template updates the complexity meter and leaves no diagnostics errors.
5. On a phone-width viewport, the tabs wrap and the gallery goes two columns.

---

## Self-Review

Run by the plan author against the phase-3 brief and the shipped phase-1 and phase-2 source.

**1. Scope coverage.** Every item of the brief maps to at least one task:

| Scope item | Tasks |
|---|---|
| react-three-fiber + drei + three added | 1 |
| Lazy chunk via `next/dynamic`, `ssr: false`, loading skeleton | 2 (`Board3DPanel`), verified in 7 (no canvas before the click) |
| Mesh from `BoardModel` cells, `InstancedMesh` per species | 1 (grouping), 2 (`SpeciesInstances`) |
| Real proportions in mm, scaled | 1 (`SCENE_SCALE`, positions and scales derived from mm only) |
| End-grain look: species hex plus procedural variation | 1 (`cellJitter`, `jitteredHex`), 2 (per-instance colour buffer) |
| Bevelled edge optional | 2, deliberately skipped with a written reason (non-uniform instance scale would stretch a shared fillet); the 0.6 mm glue gap does the job |
| OrbitControls rotate, zoom, pan | 2 |
| Soft lighting, environment optional | 2 (ambient + hemisphere + directional; drei `Environment` rejected because presets fetch an HDRI from a CDN) |
| Ground shadow via drei `ContactShadows` | 2 |
| 2D/3D switch in `StudioShell`, i18n ru and en | 3 |
| Cap at `MAX_CELLS` = 4000 instances | 1 (`MAX_INSTANCES`, `truncated`), 2 (the `view3d.truncated` notice) |
| Vitest on pure mesh-building logic in `lib/render3d/` | 1 (16 tests) |
| R3F components smoke-tested only if cheap, else excluded with a rationale | 2 (`Board3D` excluded, reason in quirk 5; the wrapper is tested with `vi.mock`) |
| e2e: toggling 3D renders a canvas | 7 |
| `lib/designs/templates.ts` with 12-16 parametric templates | 5 (16) |
| Only what the engine can build: depth <= 2, angle 0, no chevron | 5 (explicit statement plus a per-template assertion on `angleDeg`) |
| `validate()` returns no errors for every template | 5 (`describe.each` over all 16) |
| Each template: id, i18n name key ru and en, thumbnail from the same SVG renderer, baked params | 5 (id, `nameKey`, `build`), 6 (`BoardSvg` thumbnails) |
| `TemplateGallery`: card grid, click loads the design, confirm when history exists | 6 |
| i18n in both locales, tests | 5 and 6 (names, group names, gallery strings; `lib/i18n/index.test.ts` fails on drift) |
| e2e: picking a template changes the board | 7 |
| Sensible tab layout in `StudioShell` | 3 and 6 |

**2. Placeholder scan.** No "TBD", no "similar to the task above", no test mentioned without its code, no component described without its implementation. The three places where the implementer is allowed to deviate are explicit and bounded: the vitest fallback if `next/dynamic` will not resolve under jsdom (Task 2, Step 6), the arithmetic fix list if a template trips a diagnostic (Task 5, Step 5), and the console-first diagnosis if headless WebGL fails (Task 7, Step 4). `StudioTabs` deliberately ships with two tabs in Task 3 and grows the third in Task 6 rather than rendering a placeholder body.

**3. Type consistency against the real shipped API.** Checked against the files, not memory:

- `BoardModel` is read for `widthMm`, `lengthMm`, `thicknessMm`, `cells`, `glueUpCount`, `truncated`: all present in `lib/engine/types.ts`. `buildInstances` ORs the model's own `truncated` into its result, so a board that was already cut short by `MAX_CELLS` in `compile` is reported as truncated in 3D too.
- `Cell` gives `xMm`, `yMm`, `widthMm`, `heightMm`, `speciesId`, `id`. `heightMm` is the extent along the board length, which becomes the Z axis in the scene, and `thicknessMm` comes from the model, not from the cell: `Cell` has no thickness field.
- `speciesHex(id)` returns `'#cccccc'` for an unknown id and never throws, so `buildInstances` needs no species guard.
- `BoardSvg` props are `{ model, locale, maxPx?, highlightCellId?, selectedCellId? }`. The gallery passes only `model`, `locale` and `maxPx`, so `exactOptionalPropertyTypes` is not an issue there (quirk 2 stays relevant for `GridSpec.thicknessMm`, which is read with `??` and never assigned `undefined`).
- `Design` requires `schemaVersion: 1` as a literal; `makeGridDesign` and `makeInlayBand` return an object literal with `schemaVersion: 1` in a return position typed `Design`, exactly like the shipped `makeCheckerboard`.
- `Row` requires `angleDeg`, `flip`, `mirror`, `trimMm`: all set explicitly in both builders. `SliceRef` requires `panelId`, `thicknessMm`, `angleDeg`, `offsetMm`: all set in `makeInlayBand`.
- `validate(design, { shrinkageByPct, knownSpeciesIds })` matches `ValidateOptions`; the template test passes both, so `UNKNOWN_SPECIES` really fires if a template names a species that does not exist.
- `selectCanUndo` and `selectCanRedo` take `StudioState` and are already exported; the gallery composes them in one selector to avoid two subscriptions.
- `loadDesign(design)` calls `resetHistory` and clears `pendingFork` and `selectedCellId` but does not touch `view`; the gallery sets `view` itself. `resetStudio` spreads `UI_DEFAULTS` and therefore resets `view`, which is asserted in Task 3.
- `MessageKey` is `keyof typeof ru`. Template name keys are built by template literal and cast; the Task 5 test asserts each one exists in both dictionaries, which is what keeps the cast honest.
- `t(locale, key, params)` interpolates `{name}` style placeholders, which is what `templates.size`, `templates.glueUps`, `templates.confirmBody` and `view3d.truncated` rely on.
- `lib/engine` is imported everywhere and edited nowhere. The only phase-1 and phase-2 files modified are `lib/flags.ts`, `lib/store/studio.ts`, `components/StudioShell.tsx`, `playwright.config.ts`, the two dictionaries and three test files.

**4. Buildability of the sixteen templates, checked by hand before the test runs.** Widths: checkerboard-classic 240, checkerboard-fine 300, checkerboard-three 270, blocks-2x2 300, brick-half 300, brick-third 300, stripes-wide 300, pinstripe 324, gradient-stripes 300, diagonal-ladder 280, diagonal-fine 300, accent-rows 300, frame-border 300, chess-8x8 296, mosaic-random 300, inlay-band 270. All at or below the 330 mm planer limit and all at or above the 50 mm board minimum. Lengths run 240 to 360 mm, inside 50..1200. Thickness is 40 everywhere, inside 10..80. The narrowest element is the 8 mm pinstripe and the 8 mm accent row, both above the 4 mm strip minimum. Cell counts run 48 to 144, far below the 2000-cell warning. Every element is a strip except the single `sliceRef` in `inlay-band`, whose inner panel contains strips only, so depth is exactly 2.

**5. Known risks carried into execution.**

- **Peer versions.** `@react-three/fiber` must be a React 19 compatible major. If pnpm reports an unmet React peer, the correct move is to report and pick the right major, never `--force`: a mismatched reconciler fails at runtime, not at install.
- **three.js bundling under Next 16.** If `pnpm build` fails on an ESM export inside `three/examples` pulled in by drei, add `transpilePackages: ['three']` to `next.config.ts`. Try nothing else first: the failure mode is specific and the fix is one line.
- **Headless WebGL in CI.** The launch args are the mitigation. If SwiftShader still refuses on the CI runner, the fallback is to keep the three functional 3D assertions locally and reduce the CI assertion to "the 3D section renders and does not show the unsupported fallback within 30 seconds", with the reason written next to it. Do not delete the test.
- **Instance count changes.** `InstancedMesh` takes its count in the constructor, so the `key` on `SpeciesInstances` includes the item count. Forgetting that would silently keep an old mesh with a stale count after an edit that adds cells.
- **Thumbnail cost.** Sixteen compiled previews are roughly 1600 `<rect>` nodes when the templates tab is open. That is fine on a laptop and acceptable on a phone, but it is the reason the previews are hoisted to module scope. If the gallery ever grows past about 30 templates, the next move is a static thumbnail per template, not a bigger DOM.
- **`view` is not persisted.** The active tab lives only in memory: a reload lands back in the editor. That is deliberate, because the URL hash carries the document and adding UI state to it would change the share format for no user benefit.
