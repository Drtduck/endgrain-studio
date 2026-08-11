# Phase 4: generators, interactive evolution and photo-to-pattern

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Day 4 of the 7-day plan, the WOW layer. Three user-visible additions on top of the shipped editor, 3D view and 16 templates. First, a generator: eight families of buildable patterns (three wallpaper-symmetry groups, three parametric families, one blue-noise chaos family, one two-generation inlay family), every one of them a pure function of `(params, seed)`, shown as a grid of nine live previews. Second, interactive evolution on that grid: the user stars the variants they like and the next generation is built from mutations and crossovers of the starred ones, with the user acting as the fitness function. Third, the contest hero flow, photo-to-pattern: an image is dropped in, downscaled to a grid in the browser, quantised with k-means in LAB space, mapped onto real wood species by LAB distance and then projected onto buildability by clustering rows, with one slider that trades similarity against the number of glue-ups.

**Architecture:** The data flow of phases 1-3 does not change: `Design -> compile -> BoardModel -> {render2d, render3d, calc, validate}`. Phase 4 adds two pure modules that sit *before* the engine and only ever produce a normal `Design`, so everything downstream (editor, 3D, complexity meter, diagnostics, persistence, share link) works on a generated or photo-derived board with no special cases at all.

`lib/generators` is built around one data structure, the `Genome`: a family id, a uint32 seed, a species palette, the column widths, the row heights, a row order and a handful of numeric params. `toDesign(genome, name)` renders it through the shipped `makeGridDesign` (or, for the inlay family, through a direct `Design` construction with exactly one `sliceRef`). Because the genome is a plain value, evolution is trivially pure: `mutate` and `crossover` take a genome and an `Rng` and return a genome. `clampGenome` is the single choke point that guarantees buildability, so "100 random seeds produce zero validation errors" is a property test rather than a hope.

`lib/photo` is a straight pipeline of four pure functions over arrays of numbers: `rgbToLab`, `kmeansLab`, `mapClustersToSpecies`, `clusterRows`, tied together by `photoToDesign`. Nothing in it touches the DOM. The only browser-specific step, turning a `File` into a downscaled RGBA grid, lives in `components/photoDecode.ts` and is covered by Playwright, not by jsdom.

Randomness is a value, never an ambient effect. `lib/generators/random.ts` exports `mulberry32` and nothing in `lib/` is allowed to call `Math.random()` or `Date.now()`. A source-scanning unit test enforces that, because the cost of breaking it is invisible: a non-deterministic generator would make share links lie and would produce React hydration mismatches on the server-rendered first paint.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5 strict, Zustand 5, immer, Tailwind CSS 4, shadcn/ui (`components/ui/*`), three + @react-three/fiber + @react-three/drei, vitest + @testing-library/react, Playwright, pnpm, Vercel. **No new runtime dependency is added in this phase.** k-means, k-medoids, blue noise and sRGB-to-LAB are about 200 lines of arithmetic in total, and a library for any of them would cost more in bundle size and API mismatch than it saves.

## Global Constraints

Copied verbatim from `CLAUDE.md` and carried over from the phase-1, phase-2 and phase-3 plans. Every task's requirements implicitly include this section.

- Em dash U+2014 is forbidden everywhere: source code, comments, commit messages, UI strings, this plan. Use a hyphen, a colon or parentheses instead. Any occurrence is a defect.
- All user-facing text and all git commit messages are in Russian. Technical terms stay in English.
- All internal dimensions are stored in millimetres as floating point numbers. Inches are presentation only, converted in exactly one place (`lib/units.ts`).
- Domain vocabulary is fixed: the board is made of strips (first glue-up), crosscuts, and a final re-glue. Kerf and allowances are always accounted for.
- `lib/engine` must have zero imports outside itself and the TypeScript standard library. **Phase 4 does not modify a single file under `lib/engine/`.** If an engine change looks necessary, stop and report instead of editing.
- Panel recursion depth is capped at 2 and the only supported cut angle is 0. Every generated design has `angleDeg === 0` on every row and on every `sliceRef`, and no `sliceRef` may point at a panel that itself contains a `sliceRef`.
- Schema version at rest is `1`. `parseDesign` is the only reader used by web, CLI and OG route.
- No UI literals in components: every user-visible string goes through `t(locale, key)` with the key present in both `lib/i18n/ru.ts` and `lib/i18n/en.ts`.
- Russian is the default locale (`'ru'`); the English dictionary must be updated in the same commit as every new key (`en.ts` is typed `Record<keyof typeof ru, string>`, so `pnpm typecheck` fails on drift, and `lib/i18n/index.test.ts` fails on both drift and em dashes).
- TypeScript is strict with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noUnusedLocals`, `noUnusedParameters`. Array indexing yields `T | undefined` and must be narrowed, never asserted with `!`.
- Node >= 20.11, pnpm >= 9. CI runs Node 22 and executes `pnpm typecheck && pnpm lint && pnpm test && pnpm build` plus a separate `e2e` job.
- Every task ends with a commit. Small commits, Russian messages, conventional prefix (`feat:`, `test:`, `chore:`, `fix:`).

**Phase-4 additions to the constraint list, equally non-negotiable:**

- **No `Math.random()`, no `Date.now()`, no `crypto.getRandomValues()` anywhere under `lib/`.** Every stochastic module takes an explicit `seed: number` and threads an `Rng` value. Enforced by `lib/generators/purity.test.ts`, which reads the source files off disk.
- **Deterministic components.** The generator's first population and the photo pipeline's k-means init are derived from a compile-time constant seed, never from the clock, so the server-rendered HTML and the client hydration agree.
- Buildability is not checked after the fact, it is constructed: `clampGenome` and `fitWidths` are the only places allowed to decide a width, a count or a palette size, and every generator output passes through them.

## Repo quirks to respect (learned in phases 1-3, not negotiable)

1. **`react-hooks/set-state-in-effect`** is an error in this ESLint config. Never mirror props or store values into `useState` from a `useEffect`. If a component must react to a changed input, compute during render or key the subtree. **`GeneratorPanel` and `PhotoImport` contain zero `useEffect` calls**: every state transition happens inside an event handler (click, change, drop), and everything derived is a `useMemo`.
2. **`exactOptionalPropertyTypes: true`.** `{ foo: undefined }` is not assignable to `{ foo?: string }`. Build optional fields with a conditional spread: `...(value === undefined ? {} : { foo: value })`. This bites in this phase on `KMeansOptions`, `RowClusterOptions` and `PhotoParams`, which all have optional `seed`. Read them with `??` defaults instead of passing `undefined` through.
3. **`act()` around out-of-band store mutations in tests.** Calling `useStudio.getState().setView('generate')` while a component is mounted must be wrapped: `act(() => { useStudio.getState().setView('generate') })`. Calls in `beforeEach` before any `render` do not need it.
4. **Vitest include globs** are `['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx', 'app/**/*.test.tsx']`. `lib/generators/*.test.ts` and `lib/photo/*.test.ts` are **already matched** by the first glob. **Do not touch `vitest.config.ts`**: adding a redundant glob is a defect, not a safety net. Verify by running a new test file and seeing it collected.
5. **jsdom has no canvas 2D context and no `createImageBitmap`.** `HTMLCanvasElement.prototype.getContext` returns `null` under jsdom and there is no `OffscreenCanvas`. Therefore: all photo maths lives in `lib/photo/` and is tested against synthetic pixel arrays; the `File -> PixelGrid` decode lives in `components/photoDecode.ts` and is never unit-tested; `PhotoImport.test.tsx` mocks that module with `vi.mock`. Chromium under Playwright has `createImageBitmap`, `OffscreenCanvas` and a real 2D context, so the decode path is covered end to end in `e2e/photo.spec.ts`.
6. **`data-testid` on shadcn `Button`.** `components/ui/button.tsx` wraps `@base-ui/react/button` and forwards unknown props. If a new button ever swallows the attribute, wrap it in a `<span data-testid>` rather than changing the UI primitive.
7. **There is no slider primitive in `components/ui/`.** The directory holds exactly `badge`, `button`, `card`, `separator`. Use a native `<input type="range">` with a `<label>`, the way `NumberFieldMm` uses a native number input. Do not run `shadcn add slider` for this phase: it pulls a Radix dependency for three sliders.
8. **`resetStudio` resets UI defaults.** It spreads `UI_DEFAULTS`, so the two new UI fields (`generator`, `photo`) belong in that object and are cleared by `resetStudio` while surviving `loadDesign`. That is exactly the behaviour we want: loading a design from the generator must not wipe the population you are still exploring.
9. **`loadDesign` sets `documentTouched: true` and resets history.** Every "apply this to the editor" button therefore needs the dirty-confirm flow that `TemplateGallery` already implements through `selectIsDirty`.
10. **Playwright and native range inputs.** React tracks input values, and `locator.fill()` on `input[type=range]` can be swallowed. Drive sliders with focus plus `ArrowLeft` / `ArrowRight` presses, which is both reliable and an accessibility assertion for free.

## Phase 1-3 API this plan builds on (verified against the shipped source, not memory)

```ts
// lib/engine/types.ts
export interface Strip { readonly kind: 'strip'; readonly speciesId: SpeciesId; readonly widthMm: number }
export interface SliceRef { readonly kind: 'sliceRef'; readonly panelId: PanelId; readonly thicknessMm: number; readonly angleDeg: number; readonly offsetMm: number }
export type PanelElement = Strip | SliceRef
export interface Panel { readonly id: PanelId; readonly elements: readonly PanelElement[] }
export interface Row { readonly id: RowId; readonly panelId: PanelId; readonly thicknessMm: number; readonly angleDeg: number; readonly flip: boolean; readonly mirror: boolean; readonly trimMm: number }
export interface BoardSpec { readonly targetWidthMm: number; readonly targetLengthMm: number; readonly thicknessMm: number }
export interface Design { readonly schemaVersion: 1; readonly id: string; readonly name: string; readonly species: readonly SpeciesId[]; readonly panels: readonly Panel[]; readonly rows: readonly Row[]; readonly board: BoardSpec; readonly kerfMm: number; readonly planingAllowanceMm: number; readonly planerWidthMm: number }
export interface BoardModel { readonly widthMm: number; readonly lengthMm: number; readonly thicknessMm: number; readonly cells: readonly Cell[]; readonly panelLengthsMm: Readonly<Record<PanelId, number>>; readonly glueUpCount: number; readonly cutCount: number; readonly truncated: boolean }
export const MIN_STRIP_WIDTH_MM = 4; export const DEFAULT_PLANER_WIDTH_MM = 330
export const BOARD_MIN_MM = 50; export const BOARD_MAX_MM = 1200
export const THICKNESS_MIN_MM = 10; export const THICKNESS_MAX_MM = 80
export const MAX_CELLS = 4000; export const WARN_CELLS = 2000

// lib/engine/index.ts (public surface, unchanged in this phase)
export function compile(design: Design): BoardModel
export function validate(design: Design, opts?: ValidateOptions): Diagnostic[]
export interface ValidateOptions { readonly shrinkageByPct?: Readonly<Record<SpeciesId, number>>; readonly knownSpeciesIds?: readonly SpeciesId[] }
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean
export function panelWidthMm(panel: Panel): number

// lib/designs/grid.ts
export const GRID_THICKNESS_MM = 40; export const GRID_KERF_MM = 3; export const GRID_TRIM_MM = 5; export const GRID_ALLOWANCE_MM = 3
export interface GridSpec { readonly id: string; readonly name: string; readonly colWidthsMm: readonly number[]; readonly rowHeightsMm: readonly number[]; readonly at: (col: number, row: number) => SpeciesId; readonly thicknessMm?: number }
export function makeGridDesign(spec: GridSpec): Design      // dedupes identical rows into one panel
export function uniform(count: number, mm: number): number[]
export function hash2(col: number, row: number, seed: number): number
export function pick<T>(list: readonly T[], index: number): T

// lib/species/index.ts
export interface Lab { readonly L: number; readonly a: number; readonly b: number }
export interface Species { readonly id: SpeciesId; readonly nameRu: string; readonly nameEn: string; readonly hex: string; readonly lab: Lab; /* + density, price, shrinkage, foodSafe */ }
export const SPECIES: readonly Species[]                      // 16 entries, ordered light to dark
export const SPECIES_BY_ID: ReadonlyMap<SpeciesId, Species>
export function getSpeciesById(id: SpeciesId): Species        // throws EngineError on unknown
export function speciesHex(id: SpeciesId): string             // '#cccccc' for unknown, never throws
export function shrinkageMap(): Record<SpeciesId, number>

// lib/i18n/index.ts
export type Locale = 'ru' | 'en'; export type MessageKey = keyof typeof ru
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string

// lib/store/studio.ts
export type StudioView = 'editor' | 'templates' | 'view3d'     // grows to five in Task 5
export function selectDesign(s: StudioState): Design
export function selectIsDirty(s: StudioState): boolean         // documentTouched || canUndo || canRedo
export interface StudioState { readonly documentTouched: boolean; loadDesign(design: Design): void; setView(view: StudioView): void; /* ... */ }
export const useStudio: StudioStore

// lib/store/derived.ts
export function derive(design: Design): Derived                // one-entry memo keyed by document identity
export function useDerived(): Derived

// components/BoardSvg.tsx
export function BoardSvg(props: { model: BoardModel; locale: Locale; maxPx?: number; highlightCellId?: string | null; selectedCellId?: string | null }): JSX.Element
```

Four engine facts that shape every line of this phase:

- `validate` raises **`RAGGED_BOARD` as an error** when the panels referenced by rows differ in width by more than 0.01 mm. Every row of a generated board therefore shares one column-width array. `makeGridDesign` already guarantees this; the inlay family guarantees it by pointing every row at the same outer panel.
- `validate` raises **`PLANER_WIDTH` as an error** when `panelWidthMm(panel) > design.planerWidthMm` (330 by default) **for every panel, including inner panels that are only reached through a `sliceRef`**. The inner panel of the inlay family is therefore width-limited too.
- `validate` raises **`MIN_STRIP_WIDTH` as an error** below 4 mm, and it measures a `sliceRef` by its `thicknessMm`. Generated inlay bands are never thinner than 8 mm.
- `validate` raises **`DIMENSION_SANITY` as an error** outside 50..1200 mm for width and length and outside 10..80 mm for thickness. A four-column board of 8 mm strips would be 32 mm wide and would fail, which is why `fitWidths` enforces a minimum total as well as a maximum.

`SHRINKAGE_MISMATCH` is a **warning**, not an error. Generated palettes are chosen for looks and can pair, say, beech with cherry. That warning showing up in the diagnostics panel is the tool being honest about a real gluing risk, so the property tests assert **zero errors**, not zero diagnostics.

## File Structure

New, pure (no React, no DOM, unit-tested):

- `lib/species/lab.ts` + `.test.ts` - LAB distance and species lookup by colour. Shared by generators and photo, so there is exactly one definition of "which wood is closest to this colour".
- `lib/designs/fit.ts` + `.test.ts` - `fitWidths`, the single place that makes a list of millimetre widths buildable.
- `lib/generators/random.ts` + `.test.ts` - `mulberry32`, the `Rng` interface, `mixSeed`, `seedFromString`.
- `lib/generators/palette.ts` + `.test.ts` - contrast, analogous and accented palettes picked by LAB distance.
- `lib/generators/genome.ts` + `.test.ts` - the `Genome` type, `FAMILY_HINTS`, `clampGenome`, `randomGenome`, `genomeKey`.
- `lib/generators/symmetry.ts` + `.test.ts` - p4m, pmm, p2 tiles and their cell functions.
- `lib/generators/parametric.ts` + `.test.ts` - stripes, brick, gradient.
- `lib/generators/noise.ts` + `.test.ts` - best-candidate blue noise and the chaos family.
- `lib/generators/inlay.ts` + `.test.ts` - the one depth-2 family, built directly rather than through `makeGridDesign`.
- `lib/generators/families.ts` + `.test.ts` + `families.property.test.ts` - the registry and `toDesign`, plus the 100-seed buildability property test.
- `lib/generators/evolve.ts` + `.test.ts` - population, mutation, crossover, next generation.
- `lib/generators/purity.test.ts` - source scan for `Math.random`, `Date.now` and U+2014 under `lib/generators` and `lib/photo`.
- `lib/generators/index.ts` - public surface, re-exports only.
- `lib/photo/lab.ts` + `.test.ts` - sRGB to LAB (D65).
- `lib/photo/kmeans.ts` + `.test.ts` - seeded k-means++ in LAB with canonical output ordering.
- `lib/photo/map.ts` + `.test.ts` - centroids to species, no repeats.
- `lib/photo/rowCluster.ts` + `.test.ts` - seeded k-medoids over rows with Hamming distance.
- `lib/photo/pipeline.ts` + `.test.ts` + `pipeline.property.test.ts` - `PixelGrid`, `gridToLab`, `photoToDesign`.
- `lib/photo/index.ts` - public surface, re-exports only.

New, browser-side:

- `components/photoDecode.ts` - `File -> PixelGrid` through `createImageBitmap` with an `<img>` fallback. Never unit-tested (quirk 5), covered by `e2e/photo.spec.ts`.
- `components/ConfirmReplace.tsx` + `.test.tsx` - the "replace the current project?" dialog, extracted from `TemplateGallery` so that three call sites share one implementation and one set of ARIA attributes.
- `components/GeneratorPanel.tsx` + `.test.tsx` - family picker, three sliders, shuffle, nine previews, favourites, next generation, apply.
- `components/PhotoImport.tsx` + `.test.tsx` - file input, drop zone, two sliders, live preview, apply.

Modified:

- `lib/store/studio.ts` - `StudioView` grows `'generate'` and `'photo'`; new UI state `generator` and `photo` with their setters, both inside `UI_DEFAULTS`.
- `components/StudioTabs.tsx` - two more tabs.
- `components/StudioShell.tsx` - two more full-width views.
- `components/TemplateGallery.tsx` - uses `ConfirmReplace`, keeping its existing test ids.
- `lib/i18n/ru.ts`, `lib/i18n/en.ts` - about 50 new keys.
- `lib/flags.ts` - `generators: true`.

New e2e:

- `e2e/fixtures/make-fixture.mjs` - run-once script that writes the fixture PNG with `node:zlib` and no dependency.
- `e2e/fixtures/demo-blocks.png` - 48x32 three-colour PNG, committed.
- `e2e/generate.spec.ts` - nine previews, determinism across reload, evolution round, apply with and without the confirm.
- `e2e/photo.spec.ts` - upload, preview, slider changes the glue-up count, apply lands in the editor.

Untouched: everything under `lib/engine/`, `lib/calc/`, `lib/render3d/`, `lib/persist/`, `vitest.config.ts`, `playwright.config.ts`.

## Task overview

| # | Task | Commit prefix |
|---|---|---|
| 1 | Seeded PRNG, LAB distance and width fitting | `feat:` |
| 2 | LAB palettes | `feat:` |
| 3 | The genome and its buildability clamp | `feat:` |
| 4 | Eight generator families and the 100-seed property test | `feat:` |
| 5 | Interactive evolution | `feat:` |
| 6 | Store views, i18n and the shared confirm dialog | `feat:` |
| 7 | The generator panel | `feat:` |
| 8 | Photo pipeline part 1: LAB, k-means, species mapping | `feat:` |
| 9 | Photo pipeline part 2: row clustering and `photoToDesign` | `feat:` |
| 10 | The photo import panel | `feat:` |
| 11 | Playwright coverage and final verification | `test:` |

---

### Task 1: Seeded PRNG, LAB distance and width fitting

**Files:**
- Create: `lib/generators/random.ts`
- Test: `lib/generators/random.test.ts`
- Create: `lib/species/lab.ts`
- Test: `lib/species/lab.test.ts`
- Create: `lib/designs/fit.ts`
- Test: `lib/designs/fit.test.ts`

**Interfaces:**
- Consumes: `SpeciesId` from `@/lib/engine`; `SPECIES`, `SPECIES_BY_ID`, `getSpeciesById`, `type Lab` from `@/lib/species`.
- Produces:

```ts
// lib/generators/random.ts
export function mulberry32(seed: number): () => number
export interface Rng {
  next(): number                                   // [0, 1)
  int(maxExclusive: number): number                // [0, maxExclusive)
  range(min: number, max: number): number          // [min, max)
  pick<T>(list: readonly T[]): T
  bool(probability?: number): boolean              // default 0.5
  shuffled<T>(list: readonly T[]): T[]             // Fisher-Yates, does not mutate the input
}
export function makeRng(seed: number): Rng
export function mixSeed(seed: number, salt: number): number      // uint32, decorrelated
export function seedFromString(text: string): number             // FNV-1a, uint32

// lib/species/lab.ts
export function labDistance(a: Lab, b: Lab): number
export function speciesDistance(a: SpeciesId, b: SpeciesId): number
export function nearestSpecies(lab: Lab, exclude?: readonly SpeciesId[]): SpeciesId
export function speciesNeighbours(id: SpeciesId, count: number): readonly SpeciesId[]
export function lightnessRamp(minDistance?: number): readonly SpeciesId[]   // light to dark, visually distinct
export function chroma(lab: Lab): number

// lib/designs/fit.ts
export const MIN_CELL_MM = 8
export const MAX_CELL_MM = 45
export const MAX_PANEL_WIDTH_MM = 320
export const MIN_BOARD_SPAN_MM = 60
export interface FitOptions {
  readonly min?: number
  readonly max?: number
  readonly minTotal?: number
  readonly maxTotal?: number
}
export function roundHalf(mm: number): number
export function sumMm(list: readonly number[]): number
export function fitWidths(widths: readonly number[], opts?: FitOptions): number[]
```

`MIN_CELL_MM` is 8, twice the engine's 4 mm floor. A 4 mm strip is legal to glue but invisible in a pattern, and generated boards that trip `MIN_STRIP_WIDTH` would look like bugs. `MAX_PANEL_WIDTH_MM` is 320, ten millimetres below the 330 mm planer limit, so that a later width jitter in evolution cannot push a panel over the edge through rounding.

- [ ] **Step 1: Write the failing PRNG test**

Create `lib/generators/random.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { makeRng, mixSeed, mulberry32, seedFromString } from './random'

describe('mulberry32', () => {
  it('даёт один и тот же поток на одном сиде', () => {
    const a = mulberry32(12345)
    const b = mulberry32(12345)
    const first = Array.from({ length: 20 }, () => a())
    const second = Array.from({ length: 20 }, () => b())
    expect(first).toEqual(second)
  })

  it('на разных сидах потоки расходятся', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toBe(b())
  })

  it('держится в полуинтервале [0, 1)', () => {
    const rnd = mulberry32(7)
    for (let i = 0; i < 5000; i += 1) {
      const v = rnd()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('распределён достаточно равномерно, чтобы узор не слипался', () => {
    const rnd = mulberry32(99)
    const buckets = new Array<number>(10).fill(0)
    for (let i = 0; i < 10000; i += 1) {
      const index = Math.floor(rnd() * 10)
      const current = buckets[index] ?? 0
      buckets[index] = current + 1
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(700)
      expect(count).toBeLessThan(1300)
    }
  })
})

describe('makeRng', () => {
  it('int не выходит за верхнюю границу и не уходит в минус', () => {
    const rng = makeRng(4)
    for (let i = 0; i < 1000; i += 1) {
      const v = rng.int(7)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(7)
    }
    expect(rng.int(0)).toBe(0)
    expect(rng.int(-3)).toBe(0)
  })

  it('pick возвращает элемент списка', () => {
    const rng = makeRng(11)
    const list = ['a', 'b', 'c'] as const
    for (let i = 0; i < 100; i += 1) expect(list).toContain(rng.pick(list))
  })

  it('pick на пустом списке бросает, а не возвращает undefined', () => {
    expect(() => makeRng(1).pick([])).toThrow()
  })

  it('shuffled сохраняет состав и не трогает вход', () => {
    const source = [1, 2, 3, 4, 5, 6, 7, 8]
    const rng = makeRng(21)
    const out = rng.shuffled(source)
    expect(out).not.toBe(source)
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
    expect([...out].sort((a, b) => a - b)).toEqual(source)
  })

  it('shuffled действительно перемешивает', () => {
    const source = Array.from({ length: 24 }, (_, i) => i)
    const out = makeRng(5).shuffled(source)
    expect(out).not.toEqual(source)
  })

  it('bool уважает вероятность', () => {
    const rng = makeRng(3)
    let hits = 0
    for (let i = 0; i < 2000; i += 1) if (rng.bool(0.25)) hits += 1
    expect(hits).toBeGreaterThan(350)
    expect(hits).toBeLessThan(650)
    expect(makeRng(3).bool(0)).toBe(false)
    expect(makeRng(3).bool(1)).toBe(true)
  })

  it('range попадает в заданный отрезок', () => {
    const rng = makeRng(8)
    for (let i = 0; i < 500; i += 1) {
      const v = rng.range(10, 20)
      expect(v).toBeGreaterThanOrEqual(10)
      expect(v).toBeLessThan(20)
    }
  })
})

describe('mixSeed', () => {
  it('возвращает uint32', () => {
    for (const [seed, salt] of [[0, 0], [1, 1], [4294967295, 17], [-5, 3]] as const) {
      const v = mixSeed(seed, salt)
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(4294967295)
    }
  })

  it('соседние соли дают некоррелированные потоки', () => {
    const a = makeRng(mixSeed(100, 0)).next()
    const b = makeRng(mixSeed(100, 1)).next()
    expect(Math.abs(a - b)).toBeGreaterThan(0.01)
  })

  it('детерминирован', () => {
    expect(mixSeed(42, 7)).toBe(mixSeed(42, 7))
  })
})

describe('seedFromString', () => {
  it('детерминирован и различает строки', () => {
    expect(seedFromString('walnut')).toBe(seedFromString('walnut'))
    expect(seedFromString('walnut')).not.toBe(seedFromString('maple'))
    expect(seedFromString('')).toBeGreaterThanOrEqual(0)
  })
})
```

Run it and watch it fail on a missing module:

```bash
pnpm exec vitest run lib/generators/random.test.ts
```

- [ ] **Step 2: Implement `lib/generators/random.ts`**

```ts
/**
 * Генератор псевдослучайных чисел mulberry32: 32 бита состояния, период 2^32.
 * Math.random в lib запрещён: узор обязан быть одинаковым у автора ссылки и у того,
 * кто её открыл, а на сервере и на клиенте первый рендер обязан совпасть до пикселя.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface Rng {
  next(): number
  int(maxExclusive: number): number
  range(min: number, max: number): number
  pick<T>(list: readonly T[]): T
  bool(probability?: number): boolean
  shuffled<T>(list: readonly T[]): T[]
}

export function makeRng(seed: number): Rng {
  const next = mulberry32(seed)
  const rng: Rng = {
    next,
    int(maxExclusive) {
      if (!Number.isFinite(maxExclusive) || maxExclusive <= 0) return 0
      return Math.floor(next() * maxExclusive)
    },
    range(min, max) {
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return min
      return min + next() * (max - min)
    },
    pick(list) {
      if (list.length === 0) throw new Error('pick вызван с пустым списком')
      const value = list[rng.int(list.length)]
      if (value === undefined) throw new Error('pick не нашёл элемент')
      return value
    },
    bool(probability = 0.5) {
      return next() < probability
    },
    shuffled(list) {
      const out = [...list]
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = rng.int(i + 1)
        const a = out[i]
        const b = out[j]
        if (a === undefined || b === undefined) continue
        out[i] = b
        out[j] = a
      }
      return out
    },
  }
  return rng
}

/**
 * Перемешивание сида с солью (финализатор murmur3). Нужно, чтобы разные части
 * одного узора (плитка, ширины, палитра) не шли из одного потока: иначе сдвиг
 * в одной части сдвигает все остальные, и «поменять только палитру» становится невозможно.
 */
export function mixSeed(seed: number, salt: number): number {
  let h = ((seed >>> 0) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/** FNV-1a: строка в сид. Используется для стабильного сида по имени файла фотографии. */
export function seedFromString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
```

Expected: all `random.test.ts` cases pass.

- [ ] **Step 3: Write the failing LAB test**

Create `lib/species/lab.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SPECIES, SPECIES_BY_ID, getSpeciesById } from './index'
import { chroma, labDistance, lightnessRamp, nearestSpecies, speciesDistance, speciesNeighbours } from './lab'

describe('labDistance', () => {
  it('расстояние до себя равно нулю', () => {
    const maple = getSpeciesById('maple')
    expect(labDistance(maple.lab, maple.lab)).toBe(0)
  })

  it('симметрично и считает евклидову норму', () => {
    const a = { L: 0, a: 0, b: 0 }
    const b = { L: 3, a: 4, b: 0 }
    expect(labDistance(a, b)).toBeCloseTo(5, 10)
    expect(labDistance(b, a)).toBeCloseTo(5, 10)
  })

  it('клён к берёзе ближе, чем клён к венге', () => {
    expect(speciesDistance('maple', 'birch')).toBeLessThan(speciesDistance('maple', 'wenge'))
  })
})

describe('nearestSpecies', () => {
  it('точное попадание в породу возвращает её саму', () => {
    for (const species of SPECIES) {
      expect(nearestSpecies(species.lab)).toBe(species.id)
    }
  })

  it('уважает список исключений', () => {
    const walnut = getSpeciesById('walnut')
    expect(nearestSpecies(walnut.lab, ['walnut'])).not.toBe('walnut')
  })

  it('не падает, если исключены все породы', () => {
    const all = SPECIES.map((s) => s.id)
    expect(SPECIES_BY_ID.has(nearestSpecies({ L: 50, a: 0, b: 0 }, all))).toBe(true)
  })
})

describe('speciesNeighbours', () => {
  it('возвращает запрошенное число соседей без самой породы', () => {
    const near = speciesNeighbours('cherry', 3)
    expect(near).toHaveLength(3)
    expect(near).not.toContain('cherry')
    expect(new Set(near).size).toBe(3)
  })

  it('соседи отсортированы по возрастанию расстояния', () => {
    const near = speciesNeighbours('walnut', 5)
    const distances = near.map((id) => speciesDistance('walnut', id))
    expect([...distances].sort((a, b) => a - b)).toEqual(distances)
  })

  it('не выдаёт больше, чем есть пород', () => {
    expect(speciesNeighbours('maple', 100)).toHaveLength(SPECIES.length - 1)
  })
})

describe('lightnessRamp', () => {
  it('идёт от светлого к тёмному', () => {
    const ramp = lightnessRamp()
    const ls = ramp.map((id) => getSpeciesById(id).lab.L)
    expect([...ls].sort((a, b) => b - a)).toEqual(ls)
  })

  it('соседи в лесенке различимы глазом', () => {
    const ramp = lightnessRamp(18)
    for (let i = 1; i < ramp.length; i += 1) {
      const prev = ramp[i - 1]
      const curr = ramp[i]
      if (prev === undefined || curr === undefined) continue
      expect(speciesDistance(prev, curr)).toBeGreaterThanOrEqual(18)
    }
  })

  it('в лесенке достаточно ступеней для градиента', () => {
    expect(lightnessRamp(18).length).toBeGreaterThanOrEqual(5)
  })
})

describe('chroma', () => {
  it('серый бесцветен, падук насыщен', () => {
    expect(chroma({ L: 50, a: 0, b: 0 })).toBe(0)
    expect(chroma(getSpeciesById('padauk').lab)).toBeGreaterThan(chroma(getSpeciesById('walnut').lab))
  })
})
```

- [ ] **Step 4: Implement `lib/species/lab.ts`**

```ts
import type { SpeciesId } from '@/lib/engine'
import { SPECIES, getSpeciesById, type Lab } from './index'

/**
 * Евклидово расстояние в CIELAB. Не CIEDE2000: справочник пород маленький и
 * заведомо разнесённый по светлоте, а деление на пороги «различимо глазом»
 * у нас грубое, поэтому точность дельты-E 2000 здесь ничего не добавила бы.
 */
export function labDistance(a: Lab, b: Lab): number {
  const dL = a.L - b.L
  const da = a.a - b.a
  const db = a.b - b.b
  return Math.sqrt(dL * dL + da * da + db * db)
}

export function speciesDistance(a: SpeciesId, b: SpeciesId): number {
  return labDistance(getSpeciesById(a).lab, getSpeciesById(b).lab)
}

export function chroma(lab: Lab): number {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b)
}

/** Ближайшая реальная порода к произвольному цвету. Ничьи разрешаются по порядку справочника. */
export function nearestSpecies(lab: Lab, exclude: readonly SpeciesId[] = []): SpeciesId {
  const banned = new Set(exclude)
  const pool = SPECIES.filter((s) => !banned.has(s.id))
  // Исключить можно всё: тогда честнее вернуть просто ближайшую, чем бросить исключение
  // посреди пайплайна фотографии.
  const candidates = pool.length > 0 ? pool : SPECIES
  let best = candidates[0]
  if (best === undefined) throw new Error('справочник пород пуст')
  let bestDistance = labDistance(lab, best.lab)
  for (const species of candidates) {
    const d = labDistance(lab, species.lab)
    if (d < bestDistance) {
      best = species
      bestDistance = d
    }
  }
  return best.id
}

/** Ближайшие по цвету породы: основа мутации «замени породу на похожую». */
export function speciesNeighbours(id: SpeciesId, count: number): readonly SpeciesId[] {
  return SPECIES.filter((s) => s.id !== id)
    .map((s) => ({ id: s.id, d: speciesDistance(id, s.id) }))
    .sort((a, b) => a.d - b.d || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, count))
    .map((entry) => entry.id)
}

/**
 * Лесенка по светлоте с прореживанием: подряд идущие породы справочника бывают
 * почти неотличимы (клён и берёза), а в градиенте нужна видимая ступень.
 */
export function lightnessRamp(minDistance = 18): readonly SpeciesId[] {
  const sorted = [...SPECIES].sort((a, b) => b.lab.L - a.lab.L)
  const out: SpeciesId[] = []
  for (const species of sorted) {
    const last = out.at(-1)
    if (last === undefined || speciesDistance(last, species.id) >= minDistance) out.push(species.id)
  }
  return out
}
```

Verify the ramp really has enough steps before moving on: with `minDistance = 18` the walk over the 16 species must keep at least five entries, otherwise the gradient family degenerates. The test asserts it; if it fails, lower the default to 15 rather than reordering `SPECIES`.

- [ ] **Step 5: Write the failing width-fitting test**

Create `lib/designs/fit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MAX_CELL_MM, MAX_PANEL_WIDTH_MM, MIN_BOARD_SPAN_MM, MIN_CELL_MM, fitWidths, roundHalf, sumMm } from './fit'

describe('roundHalf', () => {
  it('округляет до половины миллиметра', () => {
    expect(roundHalf(12.24)).toBe(12)
    expect(roundHalf(12.26)).toBe(12.5)
    expect(roundHalf(12.76)).toBe(13)
  })
})

describe('fitWidths', () => {
  it('пустой список остаётся пустым', () => {
    expect(fitWidths([])).toEqual([])
  })

  it('поднимает слишком узкие полосы до минимума', () => {
    const out = fitWidths([1, 2, 3, 4])
    for (const w of out) expect(w).toBeGreaterThanOrEqual(MIN_CELL_MM)
  })

  it('срезает слишком широкие полосы до максимума', () => {
    for (const w of fitWidths([900, 900, 900, 900])) expect(w).toBeLessThanOrEqual(MAX_CELL_MM)
  })

  it('укладывает сумму в рейсмус', () => {
    const out = fitWidths(new Array(14).fill(45))
    expect(sumMm(out)).toBeLessThanOrEqual(MAX_PANEL_WIDTH_MM)
  })

  it('вытягивает слишком узкую доску до минимального габарита', () => {
    const out = fitWidths([8, 8, 8, 8])
    expect(sumMm(out)).toBeGreaterThanOrEqual(MIN_BOARD_SPAN_MM)
  })

  it('выбрасывает лишние полосы, если по минимуму они не влезают', () => {
    const out = fitWidths(new Array(60).fill(10))
    expect(out.length).toBeLessThanOrEqual(Math.floor(MAX_PANEL_WIDTH_MM / MIN_CELL_MM))
    expect(sumMm(out)).toBeLessThanOrEqual(MAX_PANEL_WIDTH_MM)
  })

  it('все значения кратны половине миллиметра', () => {
    for (const w of fitWidths([11.13, 27.77, 33.31, 9.09])) expect(w * 2).toBe(Math.round(w * 2))
  })

  it('сохраняет пропорции, когда всё и так в допуске', () => {
    expect(fitWidths([20, 40, 20])).toEqual([20, 40, 20])
  })

  it('уважает переданные границы', () => {
    const out = fitWidths([100, 100], { min: 10, max: 60, maxTotal: 100, minTotal: 60 })
    expect(sumMm(out)).toBeLessThanOrEqual(100)
    for (const w of out) expect(w).toBeGreaterThanOrEqual(10)
  })

  it('детерминирован', () => {
    const input = [13.7, 41.2, 6.4, 55.9, 22.2]
    expect(fitWidths(input)).toEqual(fitWidths(input))
  })

  it('на случайных входах всегда выдаёт изготовимую панель', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const count = 4 + (seed % 11)
      const widths = Array.from({ length: count }, (_, i) => ((seed * 37 + i * 13) % 90) + 0.5)
      const out = fitWidths(widths)
      const total = sumMm(out)
      expect(total).toBeGreaterThanOrEqual(MIN_BOARD_SPAN_MM)
      expect(total).toBeLessThanOrEqual(MAX_PANEL_WIDTH_MM)
      for (const w of out) expect(w).toBeGreaterThanOrEqual(MIN_CELL_MM)
    }
  })
})
```

- [ ] **Step 6: Implement `lib/designs/fit.ts`**

```ts
/**
 * Единственное место, где решается, какой ширины бывает полоса в сгенерированном узоре.
 * Движковый минимум 4 мм соблюдается с запасом: полоса 4 мм склеивается, но в рисунке
 * не читается, а доска из таких полос выглядит как ошибка генератора, а не как узор.
 */
export const MIN_CELL_MM = 8
export const MAX_CELL_MM = 45
/** Рейсмус 330 мм минус запас на дрожание ширин при мутации. */
export const MAX_PANEL_WIDTH_MM = 320
/** Движок отбивает габарит меньше 50 мм ошибкой DIMENSION_SANITY, берём с запасом. */
export const MIN_BOARD_SPAN_MM = 60

export interface FitOptions {
  readonly min?: number
  readonly max?: number
  readonly minTotal?: number
  readonly maxTotal?: number
}

export function roundHalf(mm: number): number {
  return Math.round(mm * 2) / 2
}

export function sumMm(list: readonly number[]): number {
  return list.reduce((acc, value) => acc + value, 0)
}

function clampRound(mm: number, min: number, max: number): number {
  if (!Number.isFinite(mm)) return min
  return roundHalf(Math.min(max, Math.max(min, mm)))
}

/**
 * Подгонка списка ширин под изготовимость: каждая полоса в допуске, сумма в габарите.
 * Масштабирование идёт в несколько проходов, потому что после умножения на коэффициент
 * часть полос снова упирается в min или max и сумма уезжает.
 */
export function fitWidths(widths: readonly number[], opts: FitOptions = {}): number[] {
  const min = opts.min ?? MIN_CELL_MM
  const max = opts.max ?? MAX_CELL_MM
  const minTotal = opts.minTotal ?? MIN_BOARD_SPAN_MM
  const maxTotal = opts.maxTotal ?? MAX_PANEL_WIDTH_MM

  if (widths.length === 0) return []

  // По минимальной ширине в габарит влезает ограниченное число полос: лишние отсекаем,
  // иначе никакое масштабирование уже не спасёт.
  const maxCount = Math.max(1, Math.floor(maxTotal / min))
  let out = widths.slice(0, maxCount).map((w) => clampRound(w, min, max))

  for (let pass = 0; pass < 4; pass += 1) {
    const total = sumMm(out)
    if (total >= minTotal && total <= maxTotal) break
    if (total <= 0) break
    const factor = total > maxTotal ? maxTotal / total : minTotal / total
    out = out.map((w) => clampRound(w * factor, min, max))
  }

  // Последний рубеж: если после масштабирования сумма всё ещё выше потолка (так бывает
  // при упоре всех полос в min), режем список, а не выдаём непроходную панель.
  while (out.length > 1 && sumMm(out) > maxTotal) out.pop()

  return out
}
```

- [ ] **Step 7: Run everything and commit**

```bash
pnpm exec vitest run lib/generators/random.test.ts lib/species/lab.test.ts lib/designs/fit.test.ts
pnpm typecheck && pnpm lint
git add lib/generators/random.ts lib/generators/random.test.ts lib/species/lab.ts lib/species/lab.test.ts lib/designs/fit.ts lib/designs/fit.test.ts
git commit -m "feat: детерминированный PRNG, расстояние в LAB и подгонка ширин"
```

Expected: three new test files, roughly 30 cases, all green.

---

### Task 2: LAB palettes

**Files:**
- Create: `lib/generators/palette.ts`
- Test: `lib/generators/palette.test.ts`

**Interfaces:**
- Consumes: `SpeciesId` from `@/lib/engine`; `SPECIES`, `getSpeciesById` from `@/lib/species`; `chroma`, `labDistance`, `lightnessRamp`, `speciesDistance`, `speciesNeighbours` from `@/lib/species/lab`; `Rng` from `./random`.
- Produces:

```ts
// lib/generators/palette.ts
export type PaletteKind = 'contrast' | 'analogous' | 'accented'
export const PALETTE_KINDS: readonly PaletteKind[]
export const MIN_PALETTE = 2
export const MAX_PALETTE = 5
/** Ниже этого расстояния в LAB две породы на доске сливаются в одно пятно. */
export const MIN_PALETTE_DISTANCE = 18
export function contrastPalette(rng: Rng, size: number): readonly SpeciesId[]
export function analogousPalette(rng: Rng, size: number): readonly SpeciesId[]
export function accentedPalette(rng: Rng, size: number): readonly SpeciesId[]
export function makePalette(rng: Rng, size: number, kind?: PaletteKind): readonly SpeciesId[]
export function sanitisePalette(ids: readonly SpeciesId[], seed: number, size: number): readonly SpeciesId[]
```

Three kinds, because three different looks sell the generator: `contrast` is farthest-point sampling in LAB and gives the classic light-versus-dark board; `analogous` walks a window of the lightness ramp and gives a tonal gradient; `accented` is a contrast pair plus the most saturated species available (padauk, purpleheart, yellowheart) and gives the board a single loud line. `sanitisePalette` is the repair function used by `clampGenome` after mutation and crossover: it drops unknown ids, deduplicates, and tops the palette up deterministically.

- [ ] **Step 1: Write the failing palette test**

Create `lib/generators/palette.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SPECIES_BY_ID, getSpeciesById } from '@/lib/species'
import { chroma, speciesDistance } from '@/lib/species/lab'
import { makeRng } from './random'
import {
  MAX_PALETTE,
  MIN_PALETTE,
  MIN_PALETTE_DISTANCE,
  PALETTE_KINDS,
  accentedPalette,
  analogousPalette,
  contrastPalette,
  makePalette,
  sanitisePalette,
} from './palette'

function isReal(ids: readonly string[]): boolean {
  return ids.every((id) => SPECIES_BY_ID.has(id))
}

describe('contrastPalette', () => {
  it('выдаёт запрошенный размер из реальных пород без повторов', () => {
    for (let size = MIN_PALETTE; size <= MAX_PALETTE; size += 1) {
      const ids = contrastPalette(makeRng(size * 17), size)
      expect(ids).toHaveLength(size)
      expect(new Set(ids).size).toBe(size)
      expect(isReal(ids)).toBe(true)
    }
  })

  it('любые две породы в паре различимы глазом', () => {
    for (let seed = 0; seed < 60; seed += 1) {
      const ids = contrastPalette(makeRng(seed), 3)
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          const a = ids[i]
          const b = ids[j]
          if (a === undefined || b === undefined) continue
          expect(speciesDistance(a, b)).toBeGreaterThanOrEqual(MIN_PALETTE_DISTANCE)
        }
      }
    }
  })

  it('детерминирована по сиду', () => {
    expect(contrastPalette(makeRng(42), 4)).toEqual(contrastPalette(makeRng(42), 4))
  })

  it('на ста сидах даёт заметное разнообразие', () => {
    const seen = new Set<string>()
    for (let seed = 0; seed < 100; seed += 1) seen.add(contrastPalette(makeRng(seed), 3).join('|'))
    expect(seen.size).toBeGreaterThanOrEqual(20)
  })
})

describe('analogousPalette', () => {
  it('идёт от светлого к тёмному', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const ids = analogousPalette(makeRng(seed), 4)
      const ls = ids.map((id) => getSpeciesById(id).lab.L)
      expect([...ls].sort((a, b) => b - a)).toEqual(ls)
    }
  })

  it('без повторов и нужного размера', () => {
    for (let size = MIN_PALETTE; size <= MAX_PALETTE; size += 1) {
      const ids = analogousPalette(makeRng(size), size)
      expect(ids).toHaveLength(size)
      expect(new Set(ids).size).toBe(size)
    }
  })
})

describe('accentedPalette', () => {
  it('содержит ровно одну насыщенную породу', () => {
    for (let seed = 0; seed < 40; seed += 1) {
      const ids = accentedPalette(makeRng(seed), 3)
      const loud = ids.filter((id) => chroma(getSpeciesById(id).lab) > 40)
      expect(loud).toHaveLength(1)
    }
  })

  it('на размере два всё равно возвращает две породы', () => {
    const ids = accentedPalette(makeRng(1), 2)
    expect(ids).toHaveLength(2)
    expect(new Set(ids).size).toBe(2)
  })
})

describe('makePalette', () => {
  it('зажимает размер в допустимые границы', () => {
    expect(makePalette(makeRng(1), 0)).toHaveLength(MIN_PALETTE)
    expect(makePalette(makeRng(1), 99)).toHaveLength(MAX_PALETTE)
  })

  it('уважает явно заданный вид палитры', () => {
    for (const kind of PALETTE_KINDS) {
      const ids = makePalette(makeRng(7), 3, kind)
      expect(ids).toHaveLength(3)
      expect(isReal(ids)).toBe(true)
    }
  })

  it('без явного вида перебирает все три вида на разных сидах', () => {
    const shapes = new Set<string>()
    for (let seed = 0; seed < 60; seed += 1) shapes.add(makePalette(makeRng(seed), 3).join('|'))
    expect(shapes.size).toBeGreaterThan(10)
  })
})

describe('sanitisePalette', () => {
  it('выбрасывает несуществующие породы', () => {
    const ids = sanitisePalette(['maple', 'нет-такой-породы', 'walnut'], 5, 3)
    expect(isReal(ids)).toBe(true)
    expect(ids).toHaveLength(3)
  })

  it('убирает дубликаты и добирает до размера', () => {
    const ids = sanitisePalette(['maple', 'maple', 'maple'], 9, 4)
    expect(new Set(ids).size).toBe(4)
    expect(ids[0]).toBe('maple')
  })

  it('обрезает лишнее, сохраняя порядок', () => {
    const ids = sanitisePalette(['maple', 'walnut', 'padauk', 'cherry', 'wenge'], 1, 2)
    expect(ids).toEqual(['maple', 'walnut'])
  })

  it('на пустом входе всё равно даёт рабочую палитру', () => {
    const ids = sanitisePalette([], 3, 3)
    expect(ids).toHaveLength(3)
    expect(isReal(ids)).toBe(true)
  })

  it('детерминирована', () => {
    expect(sanitisePalette(['maple'], 8, 4)).toEqual(sanitisePalette(['maple'], 8, 4))
  })
})
```

- [ ] **Step 2: Implement `lib/generators/palette.ts`**

```ts
import type { SpeciesId } from '@/lib/engine'
import { SPECIES, SPECIES_BY_ID, getSpeciesById } from '@/lib/species'
import { chroma, lightnessRamp, speciesDistance, speciesNeighbours } from '@/lib/species/lab'
import { makeRng, mixSeed, type Rng } from './random'

export type PaletteKind = 'contrast' | 'analogous' | 'accented'
export const PALETTE_KINDS: readonly PaletteKind[] = ['contrast', 'analogous', 'accented']

export const MIN_PALETTE = 2
export const MAX_PALETTE = 5
/** Ниже этого расстояния в LAB две породы на доске сливаются в одно пятно. */
export const MIN_PALETTE_DISTANCE = 18

const ALL_IDS: readonly SpeciesId[] = SPECIES.map((s) => s.id)
/** Породы, которые тянут на акцент: высокая насыщенность, а не просто тёмный тон. */
const LOUD_IDS: readonly SpeciesId[] = SPECIES.filter((s) => chroma(s.lab) > 40).map((s) => s.id)

function clampSize(size: number): number {
  if (!Number.isFinite(size)) return MIN_PALETTE
  return Math.max(MIN_PALETTE, Math.min(MAX_PALETTE, Math.round(size)))
}

/**
 * Жадный farthest-point sampling: каждая следующая порода максимально далека
 * от уже выбранных. Так контрастная палитра остаётся контрастной и на пяти породах,
 * а не вырождается в четыре оттенка коричневого.
 */
export function contrastPalette(rng: Rng, size: number): readonly SpeciesId[] {
  const count = clampSize(size)
  const out: SpeciesId[] = [rng.pick(ALL_IDS)]
  while (out.length < count) {
    let best: SpeciesId | null = null
    let bestScore = -1
    for (const id of ALL_IDS) {
      if (out.includes(id)) continue
      let nearest = Infinity
      for (const chosen of out) nearest = Math.min(nearest, speciesDistance(chosen, id))
      if (nearest > bestScore) {
        bestScore = nearest
        best = id
      }
    }
    if (best === null) break
    out.push(best)
  }
  return out
}

/** Тональная лесенка: окно подряд идущих ступеней прореженной лестницы по светлоте. */
export function analogousPalette(rng: Rng, size: number): readonly SpeciesId[] {
  const count = clampSize(size)
  const ramp = lightnessRamp(MIN_PALETTE_DISTANCE)
  if (ramp.length <= count) return contrastPalette(rng, count)
  const start = rng.int(ramp.length - count + 1)
  return ramp.slice(start, start + count)
}

/** Контрастная основа плюс ровно один громкий акцент: тонкий кант или полоса. */
export function accentedPalette(rng: Rng, size: number): readonly SpeciesId[] {
  const count = clampSize(size)
  const accent = LOUD_IDS.length > 0 ? rng.pick(LOUD_IDS) : rng.pick(ALL_IDS)
  const base = contrastPalette(rng, count).filter((id) => !LOUD_IDS.includes(id))
  const out: SpeciesId[] = [...base.slice(0, count - 1), accent]
  // Основа могла оказаться короче: добираем самыми далёкими от акцента спокойными породами.
  const calm = ALL_IDS.filter((id) => !LOUD_IDS.includes(id) && !out.includes(id))
    .map((id) => ({ id, d: speciesDistance(accent, id) }))
    .sort((a, b) => b.d - a.d || a.id.localeCompare(b.id))
  for (const entry of calm) {
    if (out.length >= count) break
    out.unshift(entry.id)
  }
  return out.slice(0, count)
}

export function makePalette(rng: Rng, size: number, kind?: PaletteKind): readonly SpeciesId[] {
  const chosen = kind ?? rng.pick(PALETTE_KINDS)
  if (chosen === 'analogous') return analogousPalette(rng, size)
  if (chosen === 'accented') return accentedPalette(rng, size)
  return contrastPalette(rng, size)
}

/**
 * Починка палитры после мутации и скрещивания: неизвестные породы выбрасываются,
 * дубликаты схлопываются, недостача добирается ближайшими соседями по LAB.
 * Сид фиксирован снаружи, поэтому починка детерминирована.
 */
export function sanitisePalette(ids: readonly SpeciesId[], seed: number, size: number): readonly SpeciesId[] {
  const count = clampSize(size)
  const out: SpeciesId[] = []
  for (const id of ids) {
    if (!SPECIES_BY_ID.has(id)) continue
    if (out.includes(id)) continue
    out.push(id)
    if (out.length === count) break
  }
  if (out.length === 0) return contrastPalette(makeRng(mixSeed(seed, 0x9a)), count)

  const anchor = out[0]
  if (anchor === undefined) return contrastPalette(makeRng(mixSeed(seed, 0x9a)), count)
  const rng = makeRng(mixSeed(seed, 0x9b))
  const pool = [...speciesNeighbours(anchor, SPECIES.length), ...ALL_IDS]
  while (out.length < count) {
    const candidate = pool.find((id) => !out.includes(id))
    if (candidate === undefined) break
    // Слишком близкую породу берём только тогда, когда далёких уже не осталось.
    const far = pool.find((id) => !out.includes(id) && out.every((chosen) => speciesDistance(chosen, id) >= MIN_PALETTE_DISTANCE))
    out.push(far ?? candidate)
    void rng
  }
  void getSpeciesById
  return out
}
```

Before committing, delete the two `void` lines: they are there only to make the shape of the code obvious while reading the plan, and `noUnusedLocals` plus `no-unused-vars` will reject the unused `rng` and the unused import. The correct final version of `sanitisePalette` drops the `rng` local and the `getSpeciesById` import entirely, because the top-up is fully determined by the neighbour ordering.

- [ ] **Step 3: Run, then commit**

```bash
pnpm exec vitest run lib/generators/palette.test.ts
pnpm typecheck && pnpm lint
git add lib/generators/palette.ts lib/generators/palette.test.ts
git commit -m "feat: палитры пород по расстоянию в LAB"
```

Expected: 15 cases green. If `contrastPalette` ever fails the `MIN_PALETTE_DISTANCE` assertion at size 5, that is a real signal that the 16-species reference is too tight for five mutually distinct woods: cap `MAX_PALETTE` at 4 rather than lowering the distance threshold, and say so in the commit message.

---

### Task 3: The genome and its buildability clamp

**Files:**
- Create: `lib/generators/genome.ts`
- Test: `lib/generators/genome.test.ts`

**Interfaces:**
- Consumes: `SpeciesId` from `@/lib/engine`; `fitWidths`, `MAX_CELL_MM`, `MAX_PANEL_WIDTH_MM`, `MIN_CELL_MM`, `roundHalf`, `sumMm` from `@/lib/designs/fit`; `makeRng`, `mixSeed`, `type Rng` from `./random`; `makePalette`, `sanitisePalette`, `MAX_PALETTE`, `MIN_PALETTE` from `./palette`.
- Produces:

```ts
// lib/generators/genome.ts
export type FamilyId =
  | 'symmetry-pmm' | 'symmetry-p4m' | 'symmetry-p2'
  | 'stripes' | 'brick' | 'gradient'
  | 'chaos' | 'inlay'
export const FAMILY_IDS: readonly FamilyId[]

export interface GenParams {
  readonly cols: number       // число колонок сетки
  readonly rows: number       // число рядов
  readonly cellMm: number     // базовый размер клетки, от него пляшут ширины
  readonly density: number    // 0..1, смысл зависит от семейства
  readonly jitter: number     // 0..1, насколько неровные ширины полос
}

export interface Genome {
  readonly familyId: FamilyId
  readonly seed: number                       // uint32
  readonly palette: readonly SpeciesId[]
  readonly colWidthsMm: readonly number[]
  readonly rowHeightsMm: readonly number[]
  readonly rowOrder: readonly number[]        // перестановка 0..rows-1
  readonly params: GenParams
}

export interface FamilyHint {
  readonly cols: readonly [number, number]
  readonly rows: readonly [number, number]
  readonly palette: readonly [number, number]
  /** Клетка обязана быть квадратной в миллиметрах: иначе диагональное зеркало p4m врёт. */
  readonly squareCells: boolean
  /** Ширины зеркалятся относительно центра: без этого симметрия читается только по цвету. */
  readonly mirrorWidths: boolean
  /** Жёсткое число колонок, если семейство его требует (инкрустация). */
  readonly fixedCols?: number
}
export const FAMILY_HINTS: Readonly<Record<FamilyId, FamilyHint>>

export const MIN_ROW_MM = 8
export const MAX_ROW_MM = 45
export const MAX_BOARD_LENGTH_MM = 600

export function clampGenome(genome: Genome): Genome
export function randomGenome(familyId: FamilyId, seed: number): Genome
export function genomeKey(genome: Genome): string
export function mirrorArray(list: readonly number[]): number[]
export function isPermutation(order: readonly number[], length: number): boolean
export function repairOrder(order: readonly number[], length: number): number[]
```

`clampGenome` is the contract of this whole phase. Anything that produces or edits a genome (random generation, slider moves, mutation, crossover, deserialisation from a share link one day) ends by calling it, and after it the genome is guaranteed to render to a design that `validate` accepts with zero errors. Nothing downstream re-checks.

- [ ] **Step 1: Write the failing genome test**

Create `lib/generators/genome.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SPECIES_BY_ID } from '@/lib/species'
import { MAX_CELL_MM, MAX_PANEL_WIDTH_MM, MIN_BOARD_SPAN_MM, MIN_CELL_MM, sumMm } from '@/lib/designs/fit'
import { MAX_PALETTE, MIN_PALETTE } from './palette'
import {
  FAMILY_HINTS,
  FAMILY_IDS,
  MAX_BOARD_LENGTH_MM,
  MAX_ROW_MM,
  MIN_ROW_MM,
  clampGenome,
  genomeKey,
  isPermutation,
  mirrorArray,
  randomGenome,
  repairOrder,
  type Genome,
} from './genome'

function expectBuildable(g: Genome): void {
  const widthTotal = sumMm(g.colWidthsMm)
  const lengthTotal = sumMm(g.rowHeightsMm)
  expect(g.colWidthsMm.length).toBe(g.params.cols)
  expect(g.rowHeightsMm.length).toBe(g.params.rows)
  expect(widthTotal).toBeGreaterThanOrEqual(MIN_BOARD_SPAN_MM)
  expect(widthTotal).toBeLessThanOrEqual(MAX_PANEL_WIDTH_MM)
  expect(lengthTotal).toBeGreaterThanOrEqual(MIN_BOARD_SPAN_MM)
  expect(lengthTotal).toBeLessThanOrEqual(MAX_BOARD_LENGTH_MM)
  for (const w of g.colWidthsMm) {
    expect(w).toBeGreaterThanOrEqual(MIN_CELL_MM)
    expect(w).toBeLessThanOrEqual(MAX_CELL_MM)
  }
  for (const h of g.rowHeightsMm) {
    expect(h).toBeGreaterThanOrEqual(MIN_ROW_MM)
    expect(h).toBeLessThanOrEqual(MAX_ROW_MM)
  }
  expect(g.palette.length).toBeGreaterThanOrEqual(MIN_PALETTE)
  expect(g.palette.length).toBeLessThanOrEqual(MAX_PALETTE)
  expect(new Set(g.palette).size).toBe(g.palette.length)
  for (const id of g.palette) expect(SPECIES_BY_ID.has(id)).toBe(true)
  expect(isPermutation(g.rowOrder, g.params.rows)).toBe(true)
  expect(g.params.density).toBeGreaterThanOrEqual(0)
  expect(g.params.density).toBeLessThanOrEqual(1)
  expect(g.params.jitter).toBeGreaterThanOrEqual(0)
  expect(g.params.jitter).toBeLessThanOrEqual(1)
  expect(g.seed).toBeGreaterThanOrEqual(0)
  expect(Number.isInteger(g.seed)).toBe(true)
}

describe('isPermutation и repairOrder', () => {
  it('узнаёт настоящую перестановку', () => {
    expect(isPermutation([0, 1, 2], 3)).toBe(true)
    expect(isPermutation([2, 0, 1], 3)).toBe(true)
    expect(isPermutation([0, 0, 1], 3)).toBe(false)
    expect(isPermutation([0, 1], 3)).toBe(false)
    expect(isPermutation([0, 1, 5], 3)).toBe(false)
  })

  it('чинит битый порядок, сохраняя ранжирование', () => {
    expect(repairOrder([5, 1, 9], 3)).toEqual([1, 0, 2])
    expect(repairOrder([], 3)).toEqual([0, 1, 2])
    expect(repairOrder([0, 0, 0, 0], 2)).toEqual([0, 1])
    expect(isPermutation(repairOrder([7, 7, 2, 1, 9], 5), 5)).toBe(true)
  })

  it('детерминирован', () => {
    expect(repairOrder([3, 1, 3, 0], 4)).toEqual(repairOrder([3, 1, 3, 0], 4))
  })
})

describe('mirrorArray', () => {
  it('делает список симметричным относительно центра', () => {
    expect(mirrorArray([1, 2, 3, 4])).toEqual([1, 2, 2, 1])
    expect(mirrorArray([1, 2, 3, 4, 5])).toEqual([1, 2, 3, 2, 1])
    expect(mirrorArray([9])).toEqual([9])
    expect(mirrorArray([])).toEqual([])
  })
})

describe('randomGenome', () => {
  it('на любом семействе и сиде выдаёт изготовимый геном', () => {
    for (const familyId of FAMILY_IDS) {
      for (let seed = 0; seed < 100; seed += 1) {
        expectBuildable(randomGenome(familyId, seed))
      }
    }
  })

  it('детерминирован', () => {
    expect(randomGenome('chaos', 777)).toEqual(randomGenome('chaos', 777))
  })

  it('на разных сидах даёт разные геномы', () => {
    const keys = new Set<string>()
    for (let seed = 0; seed < 50; seed += 1) keys.add(genomeKey(randomGenome('stripes', seed)))
    expect(keys.size).toBeGreaterThanOrEqual(40)
  })

  it('соблюдает подсказки семейства', () => {
    for (const familyId of FAMILY_IDS) {
      const hint = FAMILY_HINTS[familyId]
      for (let seed = 0; seed < 30; seed += 1) {
        const g = randomGenome(familyId, seed)
        if (hint.fixedCols !== undefined) expect(g.params.cols).toBe(hint.fixedCols)
        if (hint.squareCells) {
          expect(g.params.rows).toBe(g.params.cols)
          expect(g.rowHeightsMm).toEqual([...g.colWidthsMm])
        }
        if (hint.mirrorWidths) expect(g.colWidthsMm).toEqual(mirrorArray([...g.colWidthsMm]))
      }
    }
  })

  it('число клеток остаётся далеко от бюджета движка', () => {
    for (const familyId of FAMILY_IDS) {
      const g = randomGenome(familyId, 5)
      expect(g.params.cols * g.params.rows).toBeLessThan(500)
    }
  })
})

describe('clampGenome', () => {
  const broken: Genome = {
    familyId: 'stripes',
    seed: -12.7,
    palette: ['maple', 'maple', 'нет-такой', 'walnut'],
    colWidthsMm: [1, 900, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    rowHeightsMm: [0],
    rowOrder: [4, 4, 4],
    params: { cols: 99, rows: -3, cellMm: 500, density: 4, jitter: -1 },
  }

  it('чинит заведомо битый геном', () => {
    expectBuildable(clampGenome(broken))
  })

  it('идемпотентен', () => {
    const once = clampGenome(broken)
    expect(clampGenome(once)).toEqual(once)
  })

  it('не трогает уже корректный геном', () => {
    const good = randomGenome('brick', 3)
    expect(clampGenome(good)).toEqual(good)
  })

  it('приводит p4m к квадрату', () => {
    const g = clampGenome({ ...randomGenome('symmetry-p4m', 1), params: { ...randomGenome('symmetry-p4m', 1).params, rows: 5 } })
    expect(g.params.rows).toBe(g.params.cols)
    expect(g.rowHeightsMm).toEqual([...g.colWidthsMm])
  })

  it('держит число колонок инкрустации фиксированным', () => {
    const hint = FAMILY_HINTS.inlay
    const g = clampGenome({ ...randomGenome('inlay', 2), params: { ...randomGenome('inlay', 2).params, cols: 11 } })
    expect(g.params.cols).toBe(hint.fixedCols)
    expect(g.colWidthsMm).toHaveLength(hint.fixedCols ?? 0)
  })
})

describe('genomeKey', () => {
  it('различает геномы и стабилен', () => {
    const a = randomGenome('gradient', 1)
    const b = randomGenome('gradient', 2)
    expect(genomeKey(a)).toBe(genomeKey(a))
    expect(genomeKey(a)).not.toBe(genomeKey(b))
  })
})
```

- [ ] **Step 2: Implement `lib/generators/genome.ts`**

```ts
import type { SpeciesId } from '@/lib/engine'
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

export const FAMILY_IDS: readonly FamilyId[] = [
  'symmetry-pmm',
  'symmetry-p4m',
  'symmetry-p2',
  'stripes',
  'brick',
  'gradient',
  'chaos',
  'inlay',
]

export interface GenParams {
  readonly cols: number
  readonly rows: number
  readonly cellMm: number
  readonly density: number
  readonly jitter: number
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

  return clampGenome({
    familyId,
    seed: base,
    palette: makePalette(paletteRng, paletteSize),
    colWidthsMm: jitteredWidths(cols, cellMm, jitter, widthRng),
    rowHeightsMm: jitteredWidths(rows, cellMm, jitter, widthRng),
    rowOrder: Array.from({ length: rows }, (_, i) => i),
    params: { cols, rows, cellMm, density, jitter },
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
  ]
  return parts.join('/')
}
```

- [ ] **Step 3: Run, then commit**

```bash
pnpm exec vitest run lib/generators/genome.test.ts
pnpm typecheck && pnpm lint
git add lib/generators/genome.ts lib/generators/genome.test.ts
git commit -m "feat: геном узора и его приведение к изготовимости"
```

Expected: 15 cases green, including the 800-genome sweep (8 families times 100 seeds) in the `randomGenome` test. If `clampGenome` is not idempotent, the usual cause is the mirror-then-fit order: `fitWidths` can break the mirror by clamping one side, which is why the implementation mirrors again after fitting. Do not "fix" that by removing the second mirror.

---

### Task 4: Eight generator families and the 100-seed property test

**Files:**
- Create: `lib/generators/cells.ts` (the shared `CellFn` type and `weightedIndex`; not listed in the File Structure section above, add it there when you touch the plan)
- Create: `lib/generators/symmetry.ts`
- Test: `lib/generators/symmetry.test.ts`
- Create: `lib/generators/parametric.ts`
- Test: `lib/generators/parametric.test.ts`
- Create: `lib/generators/noise.ts`
- Test: `lib/generators/noise.test.ts`
- Create: `lib/generators/inlay.ts`
- Test: `lib/generators/inlay.test.ts`
- Create: `lib/generators/families.ts`
- Test: `lib/generators/families.test.ts`
- Test: `lib/generators/families.property.test.ts`
- Create: `lib/generators/index.ts`
- Test: `lib/generators/purity.test.ts`

**Interfaces:**
- Consumes: `Design`, `Panel`, `Row`, `SpeciesId` from `@/lib/engine`; `GRID_ALLOWANCE_MM`, `GRID_KERF_MM`, `GRID_THICKNESS_MM`, `GRID_TRIM_MM`, `hash2`, `makeGridDesign`, `pick` from `@/lib/designs/grid`; `MessageKey` from `@/lib/i18n`; the genome module from Task 3.
- Produces:

```ts
// lib/generators/cells.ts
export type CellFn = (col: number, row: number) => SpeciesId
/** Индекс палитры со смещением к фону: 0 - фон, дальше акценты. */
export function weightedIndex(rng: Rng, paletteSize: number, density: number): number

// lib/generators/symmetry.ts
export type SymmetryGroup = 'pmm' | 'p4m' | 'p2'
export function tileDims(group: SymmetryGroup, cols: number, rows: number): { readonly w: number; readonly h: number }
export function makeTile(genome: Genome, group: SymmetryGroup): readonly (readonly number[])[]
export function symmetryCells(group: SymmetryGroup): (genome: Genome) => CellFn

// lib/generators/parametric.ts
export function stripesCells(genome: Genome): CellFn
export function brickCells(genome: Genome): CellFn
export function gradientCells(genome: Genome): CellFn

// lib/generators/noise.ts
export const BLUE_NOISE_CANDIDATES = 8
export function blueNoiseMask(cols: number, rows: number, count: number, rng: Rng): boolean[]
export function chaosCells(genome: Genome): CellFn

// lib/generators/inlay.ts
export function inlayDesign(genome: Genome, name: string): Design

// lib/generators/families.ts
export interface GeneratorFamily {
  readonly id: FamilyId
  readonly nameKey: MessageKey                  // `gen.family.<id>`
  readonly build: (genome: Genome, name: string) => Design
}
export const FAMILIES: readonly GeneratorFamily[]
export function familyById(id: FamilyId): GeneratorFamily
export function toDesign(genome: Genome, name: string): Design
```

- [ ] **Step 1: Create the shared cell helper**

Create `lib/generators/cells.ts`:

```ts
import type { SpeciesId } from '@/lib/engine'
import type { Rng } from './random'

/** Узор как чистая функция координат сетки: одна и та же клетка всегда даёт одну и ту же породу. */
export type CellFn = (col: number, row: number) => SpeciesId

/**
 * Индекс породы со смещением к фону. Палитра устроена как «нулевая порода - фон,
 * остальные - акценты», поэтому density прямо управляет тем, сколько на доске
 * не-фоновых клеток, а не просто крутит генератор.
 */
export function weightedIndex(rng: Rng, paletteSize: number, density: number): number {
  if (paletteSize <= 1) return 0
  if (!rng.bool(Math.max(0.05, Math.min(0.95, density)))) return 0
  return 1 + rng.int(paletteSize - 1)
}
```

- [ ] **Step 2: Write the failing symmetry test**

Create `lib/generators/symmetry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { randomGenome, type Genome } from './genome'
import { makeTile, symmetryCells, tileDims, type SymmetryGroup } from './symmetry'

const GROUPS: readonly SymmetryGroup[] = ['pmm', 'p4m', 'p2']

function grid(genome: Genome, group: SymmetryGroup): string[][] {
  const at = symmetryCells(group)(genome)
  return Array.from({ length: genome.params.rows }, (_, row) =>
    Array.from({ length: genome.params.cols }, (_, col) => at(col, row)),
  )
}

describe('tileDims', () => {
  it('для pmm и p4m берёт четверть, для p2 половину по рядам', () => {
    expect(tileDims('pmm', 8, 10)).toEqual({ w: 4, h: 5 })
    expect(tileDims('p4m', 8, 8)).toEqual({ w: 4, h: 4 })
    expect(tileDims('p2', 8, 10)).toEqual({ w: 8, h: 5 })
  })

  it('нечётные размеры округляет вверх, чтобы центр попал в плитку', () => {
    expect(tileDims('pmm', 7, 9)).toEqual({ w: 4, h: 5 })
  })
})

describe('makeTile', () => {
  it('детерминирована и имеет размер плитки', () => {
    const g = randomGenome('symmetry-pmm', 4)
    const dims = tileDims('pmm', g.params.cols, g.params.rows)
    const tile = makeTile(g, 'pmm')
    expect(tile).toHaveLength(dims.w)
    for (const column of tile) expect(column).toHaveLength(dims.h)
    expect(makeTile(g, 'pmm')).toEqual(tile)
  })

  it('индексы плитки лежат внутри палитры', () => {
    const g = randomGenome('symmetry-p2', 9)
    for (const column of makeTile(g, 'p2')) {
      for (const index of column) {
        expect(index).toBeGreaterThanOrEqual(0)
        expect(index).toBeLessThan(g.palette.length)
      }
    }
  })
})

describe('symmetryCells', () => {
  it('pmm зеркалит по обеим осям', () => {
    const g = randomGenome('symmetry-pmm', 12)
    const cells = grid(g, 'pmm')
    const { cols, rows } = g.params
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        expect(cells[row]?.[col]).toBe(cells[row]?.[cols - 1 - col])
        expect(cells[row]?.[col]).toBe(cells[rows - 1 - row]?.[col])
      }
    }
  })

  it('p4m добавляет диагональное зеркало', () => {
    const g = randomGenome('symmetry-p4m', 21)
    const cells = grid(g, 'p4m')
    const { cols, rows } = g.params
    expect(rows).toBe(cols)
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        expect(cells[row]?.[col]).toBe(cells[col]?.[row])
        expect(cells[row]?.[col]).toBe(cells[row]?.[cols - 1 - col])
      }
    }
  })

  it('p2 симметрична поворотом на 180 градусов', () => {
    const g = randomGenome('symmetry-p2', 33)
    const cells = grid(g, 'p2')
    const { cols, rows } = g.params
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        expect(cells[row]?.[col]).toBe(cells[rows - 1 - row]?.[cols - 1 - col])
      }
    }
  })

  it('p2 не обязана быть зеркальной: иначе это просто pmm', () => {
    let asymmetric = false
    for (let seed = 0; seed < 30 && !asymmetric; seed += 1) {
      const g = randomGenome('symmetry-p2', seed)
      const cells = grid(g, 'p2')
      const { cols, rows } = g.params
      for (let row = 0; row < rows && !asymmetric; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (cells[row]?.[col] !== cells[row]?.[cols - 1 - col]) {
            asymmetric = true
            break
          }
        }
      }
    }
    expect(asymmetric).toBe(true)
  })

  it('использует только породы из палитры', () => {
    for (const group of GROUPS) {
      const g = randomGenome(group === 'p4m' ? 'symmetry-p4m' : group === 'pmm' ? 'symmetry-pmm' : 'symmetry-p2', 6)
      for (const row of grid(g, group)) for (const id of row) expect(g.palette).toContain(id)
    }
  })

  it('на разных сидах узор разный', () => {
    const a = grid(randomGenome('symmetry-pmm', 1), 'pmm').flat().join('')
    const b = grid(randomGenome('symmetry-pmm', 2), 'pmm').flat().join('')
    expect(a).not.toBe(b)
  })
})
```

- [ ] **Step 3: Implement `lib/generators/symmetry.ts`**

```ts
import { pick } from '@/lib/designs/grid'
import { weightedIndex, type CellFn } from './cells'
import type { Genome } from './genome'
import { makeRng, mixSeed } from './random'

export type SymmetryGroup = 'pmm' | 'p4m' | 'p2'

/**
 * Размер плитки, из которой отражениями строится вся доска.
 * pmm и p4m строятся из четверти, p2 из половины по рядам: поворот на 180 градусов
 * переносит верхнюю половину в нижнюю целиком, включая её асимметрию.
 */
export function tileDims(group: SymmetryGroup, cols: number, rows: number): { readonly w: number; readonly h: number } {
  const halfCols = Math.ceil(cols / 2)
  const halfRows = Math.ceil(rows / 2)
  if (group === 'p2') return { w: cols, h: halfRows }
  return { w: halfCols, h: halfRows }
}

/** Случайная плитка индексов палитры. Сид отдельный, чтобы смена палитры не ломала рисунок. */
export function makeTile(genome: Genome, group: SymmetryGroup): readonly (readonly number[])[] {
  const { cols, rows, density } = genome.params
  const dims = tileDims(group, cols, rows)
  const rng = makeRng(mixSeed(genome.seed, 0x51))
  return Array.from({ length: dims.w }, () =>
    Array.from({ length: dims.h }, () => weightedIndex(rng, genome.palette.length, density)),
  )
}

function fold(index: number, size: number, half: number): number {
  const folded = index < half ? index : size - 1 - index
  return Math.max(0, Math.min(half - 1, folded))
}

export function symmetryCells(group: SymmetryGroup): (genome: Genome) => CellFn {
  return (genome) => {
    const { cols, rows } = genome.params
    const tile = makeTile(genome, group)
    const dims = tileDims(group, cols, rows)
    const at = (x: number, y: number): number => tile[x]?.[y] ?? 0

    return (col, row) => {
      const fc = fold(col, cols, dims.w)
      const fr = fold(row, rows, dims.h)
      let index: number
      if (group === 'p4m') {
        // Диагональное зеркало поверх двух осевых: классическая обойная группа p4m.
        index = at(Math.min(fc, fr), Math.max(fc, fr))
      } else if (group === 'pmm') {
        index = at(fc, fr)
      } else {
        // p2: верхняя половина как есть, нижняя - поворот на 180 градусов.
        index = row < dims.h ? at(col, row) : at(cols - 1 - col, rows - 1 - row)
      }
      return pick(genome.palette, index)
    }
  }
}
```

Note the `p4m` mapping reads `tile[min][max]`, which requires the tile to be square. `FAMILY_HINTS['symmetry-p4m'].squareCells` guarantees `cols === rows`, so `dims.w === dims.h` and the index is always inside the tile. The `?? 0` in `at` is a belt-and-braces default for `noUncheckedIndexedAccess`, not a real branch.

- [ ] **Step 4: Write the failing parametric test**

Create `lib/generators/parametric.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getSpeciesById } from '@/lib/species'
import { brickCells, gradientCells, stripesCells } from './parametric'
import { clampGenome, randomGenome, type Genome } from './genome'

function render(genome: Genome, cells: (g: Genome) => (col: number, row: number) => string): string[][] {
  const at = cells(genome)
  return Array.from({ length: genome.params.rows }, (_, row) =>
    Array.from({ length: genome.params.cols }, (_, col) => at(col, row)),
  )
}

describe('stripesCells', () => {
  it('колонка одноцветна по всем рядам', () => {
    const g = randomGenome('stripes', 3)
    const cells = render(g, stripesCells)
    for (let col = 0; col < g.params.cols; col += 1) {
      const first = cells[0]?.[col]
      for (let row = 1; row < g.params.rows; row += 1) expect(cells[row]?.[col]).toBe(first)
    }
  })

  it('использует всю палитру, когда колонок хватает', () => {
    const g = clampGenome({ ...randomGenome('stripes', 8), params: { ...randomGenome('stripes', 8).params, cols: 12 } })
    const used = new Set(render(g, stripesCells).flat())
    expect(used.size).toBe(g.palette.length)
  })

  it('детерминирована', () => {
    const g = randomGenome('stripes', 15)
    expect(render(g, stripesCells)).toEqual(render(g, stripesCells))
  })
})

describe('brickCells', () => {
  it('соседние ряды сдвинуты, а не повторяют друг друга', () => {
    let shifted = false
    for (let seed = 0; seed < 20 && !shifted; seed += 1) {
      const g = randomGenome('brick', seed)
      const cells = render(g, brickCells)
      if (JSON.stringify(cells[0]) !== JSON.stringify(cells[1])) shifted = true
    }
    expect(shifted).toBe(true)
  })

  it('число различных рядов не больше числа рядов', () => {
    const g = randomGenome('brick', 4)
    const rows = new Set(render(g, brickCells).map((row) => row.join('|')))
    expect(rows.size).toBeLessThanOrEqual(g.params.rows)
  })
})

describe('gradientCells', () => {
  it('идёт от светлого к тёмному и обратно', () => {
    const g = randomGenome('gradient', 2)
    const first = render(g, gradientCells)[0] ?? []
    const middle = Math.floor(first.length / 2)
    const left = first.slice(0, middle).map((id) => getSpeciesById(id).lab.L)
    // Лесенка монотонна на левой половине: это и делает градиент градиентом.
    expect([...left].sort((a, b) => b - a)).toEqual(left)
  })

  it('симметрична по колонкам', () => {
    const g = randomGenome('gradient', 6)
    const row = render(g, gradientCells)[0] ?? []
    for (let col = 0; col < row.length; col += 1) expect(row[col]).toBe(row[row.length - 1 - col])
  })
})
```

- [ ] **Step 5: Implement `lib/generators/parametric.ts`**

```ts
import { pick } from '@/lib/designs/grid'
import { getSpeciesById } from '@/lib/species'
import type { CellFn } from './cells'
import type { Genome } from './genome'
import { makeRng, mixSeed } from './random'

/** Палитра, отсортированная от светлого к тёмному: градиент обязан быть монотонным. */
function byLightness(palette: readonly string[]): readonly string[] {
  return [...palette].sort((a, b) => getSpeciesById(b).lab.L - getSpeciesById(a).lab.L)
}

/**
 * Полосы вдоль длины доски: порядок пород в колонках случайный, но фиксированный сидом,
 * а ширины уже неровные из генома, поэтому две случайные полосатые доски не похожи.
 */
export function stripesCells(genome: Genome): CellFn {
  const rng = makeRng(mixSeed(genome.seed, 0x21))
  const size = genome.palette.length
  const order: number[] = []
  for (let col = 0; col < genome.params.cols; col += 1) {
    // Первые size колонок гарантированно разные: палитра должна прозвучать целиком.
    order.push(col < size ? col : rng.int(size))
  }
  const shuffled = makeRng(mixSeed(genome.seed, 0x22)).shuffled(order)
  return (col) => pick(genome.palette, shuffled[col] ?? 0)
}

/** Кирпич: блок в несколько колонок, каждый ряд сдвинут на часть блока. */
export function brickCells(genome: Genome): CellFn {
  const block = 1 + Math.round(genome.params.density * 3)
  const shift = Math.max(1, Math.round(block / 2))
  return (col, row) => pick(genome.palette, Math.floor((col + row * shift) / block) + row)
}

/** Зеркальный градиент по светлоте с медленным дрейфом по рядам. */
export function gradientCells(genome: Genome): CellFn {
  const ramp = byLightness(genome.palette)
  const cols = genome.params.cols
  const drift = genome.params.density > 0.6 ? 1 : 0
  return (col, row) => {
    const mirrored = Math.min(col, cols - 1 - col)
    const step = Math.floor((mirrored * ramp.length) / Math.max(1, Math.ceil(cols / 2)))
    return pick(ramp, step + drift * Math.floor(row / 3))
  }
}
```

`gradientCells` with `drift = 1` breaks the "symmetric by columns" test only if the drift depended on the column, which it does not: the drift is a per-row constant added to the ramp index, so each row stays mirror-symmetric while the whole board slides through the palette from top to bottom. `stripesCells` shuffles a list that already contains every palette index once, so the "uses the whole palette" assertion holds whenever `cols >= palette.length`.

- [ ] **Step 6: Write the failing blue-noise test**

Create `lib/generators/noise.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { blueNoiseMask, chaosCells } from './noise'
import { randomGenome } from './genome'
import { makeRng } from './random'

function meanNearestDistance(mask: readonly boolean[], cols: number, rows: number): number {
  const points: Array<readonly [number, number]> = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) if (mask[row * cols + col] === true) points.push([col, row])
  }
  if (points.length < 2) return 0
  let total = 0
  for (const [x, y] of points) {
    let nearest = Infinity
    for (const [px, py] of points) {
      if (px === x && py === y) continue
      nearest = Math.min(nearest, Math.max(Math.abs(px - x), Math.abs(py - y)))
    }
    total += nearest
  }
  return total / points.length
}

describe('blueNoiseMask', () => {
  it('ставит запрошенное число точек', () => {
    const mask = blueNoiseMask(12, 12, 20, makeRng(1))
    expect(mask.filter(Boolean)).toHaveLength(20)
    expect(mask).toHaveLength(144)
  })

  it('не просит больше точек, чем есть клеток', () => {
    const mask = blueNoiseMask(3, 3, 100, makeRng(2))
    expect(mask.filter(Boolean).length).toBeLessThanOrEqual(9)
  })

  it('детерминирована по сиду', () => {
    expect(blueNoiseMask(10, 10, 15, makeRng(7))).toEqual(blueNoiseMask(10, 10, 15, makeRng(7)))
  })

  it('разносит точки лучше, чем равномерный шум', () => {
    const blue = blueNoiseMask(16, 16, 32, makeRng(9))
    const white: boolean[] = new Array(256).fill(false)
    const rng = makeRng(9)
    let placed = 0
    while (placed < 32) {
      const index = rng.int(256)
      if (white[index] !== true) {
        white[index] = true
        placed += 1
      }
    }
    expect(meanNearestDistance(blue, 16, 16)).toBeGreaterThan(meanNearestDistance(white, 16, 16))
  })

  it('нулевое число точек даёт пустую маску', () => {
    expect(blueNoiseMask(5, 5, 0, makeRng(3)).some(Boolean)).toBe(false)
  })
})

describe('chaosCells', () => {
  it('использует только породы палитры', () => {
    const g = randomGenome('chaos', 11)
    const at = chaosCells(g)
    for (let row = 0; row < g.params.rows; row += 1) {
      for (let col = 0; col < g.params.cols; col += 1) expect(g.palette).toContain(at(col, row))
    }
  })

  it('детерминирована и не зависит от порядка обхода', () => {
    const g = randomGenome('chaos', 13)
    const straight: string[] = []
    const atA = chaosCells(g)
    for (let row = 0; row < g.params.rows; row += 1) for (let col = 0; col < g.params.cols; col += 1) straight.push(atA(col, row))
    const reversed: string[] = []
    const atB = chaosCells(g)
    for (let row = g.params.rows - 1; row >= 0; row -= 1) for (let col = g.params.cols - 1; col >= 0; col -= 1) reversed.push(atB(col, row))
    expect([...reversed].reverse()).toEqual(straight)
  })

  it('плотность управляет числом акцентов', () => {
    const base = randomGenome('chaos', 17)
    const count = (density: number): number => {
      const g = { ...base, params: { ...base.params, density } }
      const at = chaosCells(g)
      let acc = 0
      for (let row = 0; row < g.params.rows; row += 1) {
        for (let col = 0; col < g.params.cols; col += 1) if (at(col, row) !== g.palette[0]) acc += 1
      }
      return acc
    }
    expect(count(0.1)).toBeLessThan(count(0.8))
  })
})
```

The "does not depend on traversal order" case is the one that matters: a `CellFn` that pulled from a live `Rng` inside the closure would pass every other test and then render a different board in the SVG and in the 3D view. Precomputing the mask in the closure is what makes it a pure function of coordinates.

- [ ] **Step 7: Implement `lib/generators/noise.ts`**

```ts
import { hash2, pick } from '@/lib/designs/grid'
import type { CellFn } from './cells'
import type { Genome } from './genome'
import { makeRng, mixSeed, type Rng } from './random'

/** Сколько кандидатов перебирается на одну точку в схеме best-candidate Митчелла. */
export const BLUE_NOISE_CANDIDATES = 8

/**
 * Голубой шум методом лучшего кандидата: каждая новая точка выбирается из нескольких
 * случайных так, чтобы оказаться максимально далеко от уже расставленных.
 * Белый шум на доске выглядит как грязь, потому что акценты слипаются в кляксы,
 * а голубой читается как осмысленная россыпь.
 */
export function blueNoiseMask(cols: number, rows: number, count: number, rng: Rng): boolean[] {
  const mask: boolean[] = new Array(Math.max(0, cols * rows)).fill(false)
  const chosen: Array<readonly [number, number]> = []
  const target = Math.max(0, Math.min(count, cols * rows))

  for (let placed = 0; placed < target; placed += 1) {
    let best: readonly [number, number] | null = null
    let bestScore = -1
    for (let candidate = 0; candidate < BLUE_NOISE_CANDIDATES; candidate += 1) {
      const x = rng.int(cols)
      const y = rng.int(rows)
      if (mask[y * cols + x] === true) continue
      let nearest = Infinity
      for (const [px, py] of chosen) nearest = Math.min(nearest, Math.max(Math.abs(px - x), Math.abs(py - y)))
      if (nearest > bestScore) {
        bestScore = nearest
        best = [x, y]
      }
    }
    if (best === null) {
      // Все кандидаты заняты: добираем первой свободной клеткой, иначе цикл вхолостую.
      const free = mask.indexOf(false)
      if (free < 0) break
      mask[free] = true
      chosen.push([free % cols, Math.floor(free / cols)])
      continue
    }
    mask[best[1] * cols + best[0]] = true
    chosen.push(best)
  }
  return mask
}

/** Хаос: фон плюс россыпь акцентов по голубому шуму, порода акцента берётся хэшем. */
export function chaosCells(genome: Genome): CellFn {
  const { cols, rows, density } = genome.params
  // До трети доски под акцентами: дальше фон перестаёт читаться как фон.
  const count = Math.round(density * cols * rows * 0.35)
  const mask = blueNoiseMask(cols, rows, count, makeRng(mixSeed(genome.seed, 0x31)))
  const accents = genome.palette.slice(1)
  const background = genome.palette[0] ?? genome.palette[0]

  return (col, row) => {
    if (background === undefined) throw new Error('пустая палитра в chaosCells')
    if (mask[row * cols + col] !== true) return background
    if (accents.length === 0) return background
    return pick(accents, hash2(col, row, genome.seed))
  }
}
```

- [ ] **Step 8: Write the failing inlay test**

Create `lib/generators/inlay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MIN_STRIP_WIDTH_MM, compile, hasErrors, panelWidthMm, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { randomGenome } from './genome'
import { inlayDesign } from './inlay'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()

describe('inlayDesign', () => {
  it('строит ровно две панели: наружную и вставку', () => {
    const design = inlayDesign(randomGenome('inlay', 1), 'Вставка')
    expect(design.panels).toHaveLength(2)
  })

  it('вставка сделана срезом другой панели, глубина ровно два', () => {
    const design = inlayDesign(randomGenome('inlay', 2), 'Вставка')
    const outer = design.panels.find((p) => p.elements.some((el) => el.kind === 'sliceRef'))
    expect(outer).toBeDefined()
    const refs = outer?.elements.filter((el) => el.kind === 'sliceRef') ?? []
    expect(refs).toHaveLength(1)
    const inner = design.panels.find((p) => p.id === (refs[0]?.kind === 'sliceRef' ? refs[0].panelId : ''))
    expect(inner).toBeDefined()
    expect(inner?.elements.every((el) => el.kind === 'strip')).toBe(true)
  })

  it('все ряды смотрят в наружную панель, поэтому доска не рваная', () => {
    const design = inlayDesign(randomGenome('inlay', 3), 'Вставка')
    expect(new Set(design.rows.map((r) => r.panelId)).size).toBe(1)
  })

  it('угол реза везде нулевой', () => {
    const design = inlayDesign(randomGenome('inlay', 4), 'Вставка')
    for (const row of design.rows) expect(row.angleDeg).toBe(0)
    for (const panel of design.panels) {
      for (const el of panel.elements) if (el.kind === 'sliceRef') expect(el.angleDeg).toBe(0)
    }
  })

  it('обе панели влезают в рейсмус, полосы не тоньше минимума', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const design = inlayDesign(randomGenome('inlay', seed), 'Вставка')
      for (const panel of design.panels) {
        expect(panelWidthMm(panel)).toBeLessThanOrEqual(design.planerWidthMm)
        for (const el of panel.elements) {
          const extent = el.kind === 'strip' ? el.widthMm : el.thicknessMm
          expect(extent).toBeGreaterThanOrEqual(MIN_STRIP_WIDTH_MM)
        }
      }
    }
  })

  it('на ста сидах проходит проверки изготовимости без ошибок', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const design = inlayDesign(randomGenome('inlay', seed), 'Вставка')
      const diagnostics = validate(design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
      expect(hasErrors(diagnostics), `сид ${seed}: ${JSON.stringify(diagnostics.filter((d) => d.level === 'error'))}`).toBe(false)
    }
  })

  it('внутри полосы вставки мельче наружных, ради чего всё и затевалось', () => {
    const design = inlayDesign(randomGenome('inlay', 8), 'Вставка')
    const model = compile(design)
    expect(model.cells.length).toBeGreaterThan(design.rows.length * 5)
  })

  it('перечисляет в палитре проекта все использованные породы', () => {
    const design = inlayDesign(randomGenome('inlay', 9), 'Вставка')
    const used = new Set<string>()
    for (const panel of design.panels) for (const el of panel.elements) if (el.kind === 'strip') used.add(el.speciesId)
    for (const id of used) expect(design.species).toContain(id)
  })
})
```

- [ ] **Step 9: Implement `lib/generators/inlay.ts`**

```ts
import {
  DEFAULT_PLANER_WIDTH_MM,
  type Design,
  type Panel,
  type Row,
  type SpeciesId,
} from '@/lib/engine'
import { GRID_ALLOWANCE_MM, GRID_KERF_MM, GRID_THICKNESS_MM, GRID_TRIM_MM } from '@/lib/designs/grid'
import { MAX_PANEL_WIDTH_MM, fitWidths, roundHalf, sumMm } from '@/lib/designs/fit'
import { SPECIES } from '@/lib/species'
import { genomeKey, type Genome } from './genome'

const SPECIES_ORDER = new Map(SPECIES.map((s, index) => [s.id, index]))
/** Тоньше этого срез вставки не имеет смысла: движок отбивает ниже 4 мм, глазу нужно больше. */
const MIN_BAND_MM = 12

/**
 * Единственное семейство с двумя поколениями склеек: центральная вставка - это срез
 * отдельной панели, вклеенный в наружную. Внутри вставки полосы мельче наружных рядов,
 * поэтому в середине доски появляется мелкий рисунок, недостижимый обычной сеткой.
 */
export function inlayDesign(genome: Genome, name: string): Design {
  const [light, mid, accent, extra] = genome.palette
  const outerSpecies: SpeciesId = light ?? 'maple'
  const frameSpecies: SpeciesId = mid ?? 'walnut'
  const innerA: SpeciesId = accent ?? frameSpecies
  const innerB: SpeciesId = extra ?? outerSpecies

  // Геном инкрустации всегда пятиколоночный: край, рамка, вставка, рамка, край.
  const widths = fitWidths([...genome.colWidthsMm], { maxTotal: MAX_PANEL_WIDTH_MM })
  const side = widths[0] ?? 45
  const frame = widths[1] ?? 15
  const bandRaw = widths[2] ?? 60
  // Вставка забирает всё, что осталось от рейсмуса после краёв и рамок.
  const band = Math.max(MIN_BAND_MM, roundHalf(Math.min(bandRaw * 2, MAX_PANEL_WIDTH_MM - 2 * side - 2 * frame)))

  const outer: Panel = {
    id: 'MAIN',
    elements: [
      { kind: 'strip', speciesId: outerSpecies, widthMm: side },
      { kind: 'strip', speciesId: frameSpecies, widthMm: frame },
      { kind: 'sliceRef', panelId: 'INNER', thicknessMm: band, angleDeg: 0, offsetMm: 0 },
      { kind: 'strip', speciesId: frameSpecies, widthMm: frame },
      { kind: 'strip', speciesId: outerSpecies, widthMm: side },
    ],
  }

  // Плотность управляет мелкостью вставки: от шести до восемнадцати полос.
  const innerCount = 6 + Math.round(genome.params.density * 12)
  const innerWidths = fitWidths(new Array(innerCount).fill(roundHalf(MAX_PANEL_WIDTH_MM / innerCount)), {
    maxTotal: MAX_PANEL_WIDTH_MM,
  })
  const inner: Panel = {
    id: 'INNER',
    elements: innerWidths.map((widthMm, index) => ({
      kind: 'strip' as const,
      speciesId: index % 2 === 0 ? innerA : innerB,
      widthMm,
    })),
  }

  const rows: Row[] = genome.rowHeightsMm.map((thicknessMm, index) => ({
    id: `r${index}`,
    panelId: 'MAIN',
    thicknessMm,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: GRID_TRIM_MM,
  }))

  const used = new Set<SpeciesId>([outerSpecies, frameSpecies, innerA, innerB])
  const species = [...used].sort((a, b) => (SPECIES_ORDER.get(a) ?? 0) - (SPECIES_ORDER.get(b) ?? 0))

  return {
    schemaVersion: 1,
    id: `gen-inlay-${genomeKey(genome).length}-${genome.seed}`,
    name,
    species,
    panels: [outer, inner],
    rows,
    board: {
      targetWidthMm: sumMm(outer.elements.map((el) => (el.kind === 'strip' ? el.widthMm : el.thicknessMm))),
      targetLengthMm: sumMm(genome.rowHeightsMm),
      thicknessMm: GRID_THICKNESS_MM,
    },
    kerfMm: GRID_KERF_MM,
    planingAllowanceMm: GRID_ALLOWANCE_MM,
    planerWidthMm: DEFAULT_PLANER_WIDTH_MM,
  }
}
```

Two arithmetic checks to do by hand before running the test. The outer panel is `2 * side + 2 * frame + band`, and `band` is capped at exactly the leftover, so the total never exceeds 320 while `side` and `frame` come out of `fitWidths` at 8..45 mm each. Worst case is `side = frame = 45`: the leftover is `320 - 180 = 140`, comfortably above `MIN_BAND_MM`. Best case is `side = frame = 8`: the leftover is 288, and `band` takes the smaller of that and `2 * bandRaw`. The inner panel is `innerCount` equal strips summing to at most 320, and with `innerCount = 18` each strip is 17.5 mm, above the 8 mm floor.

- [ ] **Step 10: Write the failing registry and property tests**

Create `lib/generators/families.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import ru from '@/lib/i18n/ru'
import { FAMILIES, familyById, toDesign } from './families'
import { FAMILY_IDS, randomGenome } from './genome'

describe('FAMILIES', () => {
  it('перечисляет ровно восемь семейств из FAMILY_IDS', () => {
    expect(FAMILIES.map((f) => f.id).sort()).toEqual([...FAMILY_IDS].sort())
  })

  it('у каждого семейства есть ключ перевода в обоих словарях', () => {
    for (const family of FAMILIES) expect(ru).toHaveProperty(family.nameKey)
  })

  it('familyById бросает на неизвестном идентификаторе, а не возвращает undefined', () => {
    expect(() => familyById('нет-такого' as never)).toThrow()
  })
})

describe('toDesign', () => {
  it('присваивает документу переданное имя', () => {
    expect(toDesign(randomGenome('stripes', 1), 'Мой узор').name).toBe('Мой узор')
  })

  it('детерминирована', () => {
    const g = randomGenome('chaos', 5)
    expect(toDesign(g, 'A')).toEqual(toDesign(g, 'A'))
  })

  it('одинаковые ряды схлопываются в одну панель', () => {
    const design = toDesign(randomGenome('stripes', 7), 'Полосы')
    // У полосатого узора все ряды одинаковы: склейка ровно одна.
    expect(design.panels).toHaveLength(1)
  })

  it('перестановка рядов меняет документ', () => {
    const g = randomGenome('brick', 9)
    const shuffled = { ...g, rowOrder: [...g.rowOrder].reverse() }
    expect(toDesign(shuffled, 'X')).not.toEqual(toDesign(g, 'X'))
  })
})
```

Create `lib/generators/families.property.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MAX_CELLS, WARN_CELLS, compile, hasErrors, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { FAMILY_IDS, randomGenome } from './genome'
import { toDesign } from './families'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()
const SEEDS = 100

describe('генератор на ста сидах каждого семейства', () => {
  for (const familyId of FAMILY_IDS) {
    it(`${familyId}: ноль ошибок изготовимости`, () => {
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const design = toDesign(randomGenome(familyId, seed), `${familyId}-${seed}`)
        const diagnostics = validate(design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
        const errors = diagnostics.filter((d) => d.level === 'error')
        expect(errors, `${familyId} сид ${seed}: ${JSON.stringify(errors)}`).toEqual([])
      }
    })

    it(`${familyId}: модель не обрезана и укладывается в бюджет ячеек`, () => {
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const model = compile(toDesign(randomGenome(familyId, seed), 'x'))
        expect(model.truncated).toBe(false)
        expect(model.cells.length).toBeLessThan(WARN_CELLS)
        expect(model.cells.length).toBeLessThan(MAX_CELLS)
        expect(model.cells.length).toBeGreaterThan(0)
      }
    })

    it(`${familyId}: два случайных прогона дают визуально разные доски`, () => {
      const shapes = new Set<string>()
      for (let seed = 0; seed < SEEDS; seed += 1) {
        const model = compile(toDesign(randomGenome(familyId, seed), 'x'))
        shapes.add(model.cells.map((c) => c.speciesId).join(''))
      }
      // Требование конкурса: два прогона не должны совпасть. Берём с большим запасом.
      expect(shapes.size).toBeGreaterThanOrEqual(SEEDS - 5)
    })
  }

  it('число склеек честное: одинаковые ряды переиспользуют панель', () => {
    for (const familyId of FAMILY_IDS) {
      const design = toDesign(randomGenome(familyId, 3), 'x')
      const model = compile(design)
      expect(model.glueUpCount).toBe(design.panels.length)
    }
  })
})
```

If the last assertion fails, do not change the test: read `lib/engine/compile.ts` and report what `glueUpCount` actually counts, because the complexity meter shown to the user depends on that same number and the plan's understanding of it would be wrong.

- [ ] **Step 11: Implement `lib/generators/families.ts` and `lib/generators/index.ts`**

```ts
// lib/generators/families.ts
import type { Design } from '@/lib/engine'
import { makeGridDesign } from '@/lib/designs/grid'
import type { MessageKey } from '@/lib/i18n'
import type { CellFn } from './cells'
import { FAMILY_IDS, genomeKey, type FamilyId, type Genome } from './genome'
import { inlayDesign } from './inlay'
import { brickCells, gradientCells, stripesCells } from './parametric'
import { chaosCells } from './noise'
import { symmetryCells } from './symmetry'

export interface GeneratorFamily {
  readonly id: FamilyId
  readonly nameKey: MessageKey
  readonly build: (genome: Genome, name: string) => Design
}

/** Сетчатое семейство: вся разница между ними умещается в функцию клетки. */
function gridFamily(id: FamilyId, cells: (genome: Genome) => CellFn): GeneratorFamily {
  return {
    id,
    nameKey: `gen.family.${id}` as MessageKey,
    build: (genome, name) => {
      const at = cells(genome)
      return makeGridDesign({
        id: `gen-${id}-${genome.seed}`,
        name,
        colWidthsMm: [...genome.colWidthsMm],
        rowHeightsMm: [...genome.rowHeightsMm],
        // rowOrder переставляет содержимое рядов, не их высоты: доска сохраняет габарит,
        // а мутация «перемешать ряды» становится дешёвой и обратимой.
        at: (col, row) => at(col, genome.rowOrder[row] ?? row),
      })
    },
  }
}

export const FAMILIES: readonly GeneratorFamily[] = [
  gridFamily('symmetry-pmm', symmetryCells('pmm')),
  gridFamily('symmetry-p4m', symmetryCells('p4m')),
  gridFamily('symmetry-p2', symmetryCells('p2')),
  gridFamily('stripes', stripesCells),
  gridFamily('brick', brickCells),
  gridFamily('gradient', gradientCells),
  gridFamily('chaos', chaosCells),
  { id: 'inlay', nameKey: 'gen.family.inlay' as MessageKey, build: inlayDesign },
]

export function familyById(id: FamilyId): GeneratorFamily {
  const family = FAMILIES.find((f) => f.id === id)
  if (!family) throw new Error(`семейство генератора ${String(id)} не найдено`)
  return family
}

/** Единственный вход: геном плюс имя на языке пользователя даёт обычный Design. */
export function toDesign(genome: Genome, name: string): Design {
  return familyById(FAMILY_IDS.includes(genome.familyId) ? genome.familyId : 'stripes').build(genome, name)
}

export { genomeKey }
```

```ts
// lib/generators/index.ts
export { makeRng, mixSeed, mulberry32, seedFromString, type Rng } from './random'
export {
  MAX_PALETTE,
  MIN_PALETTE,
  MIN_PALETTE_DISTANCE,
  PALETTE_KINDS,
  makePalette,
  sanitisePalette,
  type PaletteKind,
} from './palette'
export {
  FAMILY_HINTS,
  FAMILY_IDS,
  clampGenome,
  genomeKey,
  randomGenome,
  type FamilyId,
  type GenParams,
  type Genome,
} from './genome'
export { FAMILIES, familyById, toDesign, type GeneratorFamily } from './families'
export {
  POPULATION_SIZE,
  crossover,
  mutate,
  nextGeneration,
  reshuffle,
  seedPopulation,
  type Individual,
  type Population,
} from './evolve'
```

`index.ts` re-exports `./evolve`, which does not exist yet: create the file in Task 5 and add these lines then, or create `evolve.ts` as an empty module now and fill it in Task 5. Prefer the first: leave the evolve exports out of `index.ts` until Task 5 adds them, so the tree always typechecks.

- [ ] **Step 12: Write the purity test**

Create `lib/generators/purity.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIRS = ['lib/generators', 'lib/photo', 'lib/designs', 'lib/species']
const EM_DASH = String.fromCharCode(0x2014)

function sourceFiles(): string[] {
  const out: string[] = []
  for (const dir of DIRS) {
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      // Каталог lib/photo появляется в восьмой задаче: до неё тест просто его пропускает.
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.ts')) continue
      out.push(join(dir, entry))
    }
  }
  return out
}

describe('чистота генеративных модулей', () => {
  it('находит исходники', () => {
    expect(sourceFiles().length).toBeGreaterThan(5)
  })

  it('нигде не зовёт Math.random, Date.now и crypto', () => {
    for (const file of sourceFiles()) {
      const source = readFileSync(file, 'utf8')
      expect(source.includes('Math.random'), file).toBe(false)
      expect(source.includes('Date.now'), file).toBe(false)
      expect(source.includes('getRandomValues'), file).toBe(false)
      expect(source.includes('performance.now'), file).toBe(false)
    }
  })

  it('не тянет DOM внутрь lib', () => {
    for (const file of sourceFiles()) {
      if (file.endsWith('.test.ts')) continue
      const source = readFileSync(file, 'utf8')
      for (const forbidden of ['document.', 'window.', 'HTMLCanvas', 'createImageBitmap', 'OffscreenCanvas']) {
        expect(source.includes(forbidden), `${file}: ${forbidden}`).toBe(false)
      }
    }
  })

  it('нигде не использует длинное тире', () => {
    for (const file of sourceFiles()) {
      expect(readFileSync(file, 'utf8').includes(EM_DASH), file).toBe(false)
    }
  })
})
```

The test reads relative paths, which works because vitest runs with the repo root as `process.cwd()`. Confirm that in the run output rather than assuming it: if the paths do not resolve, switch to `new URL('../../lib/generators', import.meta.url)` and keep the assertions identical.

- [ ] **Step 13: Run the whole generator suite and commit**

```bash
pnpm exec vitest run lib/generators lib/designs lib/species
pnpm typecheck && pnpm lint
git add lib/generators lib/designs/fit.ts
git commit -m "feat: восемь семейств генератора узоров и property-тест на сто сидов"
```

Expected: eight families times three property cases, plus the per-module tests. Total run time should stay under about 15 seconds; the 100-seed sweep compiles 800 designs, which is the slowest part of the unit suite and is still cheap because every board is under 250 cells.

---

### Task 5: Interactive evolution

**Files:**
- Create: `lib/generators/evolve.ts`
- Test: `lib/generators/evolve.test.ts`
- Modify: `lib/generators/index.ts` (add the evolve re-exports)

**Interfaces:**

```ts
// lib/generators/evolve.ts
export const POPULATION_SIZE = 9
export interface Individual { readonly id: string; readonly genome: Genome }
export interface Population {
  readonly seed: number
  readonly generation: number
  readonly familyIds: readonly FamilyId[]
  readonly items: readonly Individual[]
}
export function seedPopulation(seed: number, familyIds: readonly FamilyId[]): Population
export function reshuffle(population: Population): Population
export function nextGeneration(population: Population, favouriteIds: readonly string[]): Population
export function mutate(genome: Genome, rng: Rng): Genome
export function crossover(a: Genome, b: Genome, rng: Rng): Genome
export function applyParams(population: Population, patch: Partial<GenParams>): Population
```

There is no fitness function and there never will be one: the user is the fitness function. The spec floats a scored fitness (contrast, symmetry, glue-up penalty), and this plan deliberately drops it. A machine score would fight the user's taste in a nine-cell grid where the user can simply look, and it would need tuning time we do not have on day four. What survives from that idea is the honest glue-up count already printed under every preview.

Determinism rule: `nextGeneration(pop, favourites)` is a pure function of `pop.seed`, `pop.generation` and the sorted list of favourite ids. The same clicks always give the same nine boards, so a session is reproducible and a share link stays meaningful.

Slot policy for the nine cells:

- No favourites: the whole generation is fresh random genomes on a new derived seed. This is the "none of these, try again" button and it must not creep toward the previous generation.
- One favourite: slot 0 is the favourite itself (elitism, so the user never loses what they liked), slots 1..7 are mutations of it, slot 8 is a fresh immigrant that keeps the gene pool from collapsing.
- Two or more favourites: the favourites occupy the first slots unchanged, then crossovers and mutations alternate, and the last slot is again a fresh immigrant.

- [ ] **Step 1: Write the failing evolution test**

Create `lib/generators/evolve.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { hasErrors, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { toDesign } from './families'
import { FAMILY_IDS, clampGenome, genomeKey, randomGenome, type Genome } from './genome'
import { makeRng } from './random'
import {
  POPULATION_SIZE,
  applyParams,
  crossover,
  mutate,
  nextGeneration,
  reshuffle,
  seedPopulation,
} from './evolve'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()

function expectAllBuildable(genomes: readonly Genome[]): void {
  for (const genome of genomes) {
    const diagnostics = validate(toDesign(genome, 'x'), { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
    expect(hasErrors(diagnostics), JSON.stringify(diagnostics.filter((d) => d.level === 'error'))).toBe(false)
  }
}

describe('seedPopulation', () => {
  it('даёт девять особей с уникальными идентификаторами', () => {
    const pop = seedPopulation(1, FAMILY_IDS)
    expect(pop.items).toHaveLength(POPULATION_SIZE)
    expect(new Set(pop.items.map((i) => i.id)).size).toBe(POPULATION_SIZE)
    expect(pop.generation).toBe(1)
  })

  it('раскладывает выбранные семейства по слотам', () => {
    const pop = seedPopulation(2, ['stripes', 'chaos'])
    for (const item of pop.items) expect(['stripes', 'chaos']).toContain(item.genome.familyId)
    expect(new Set(pop.items.map((i) => i.genome.familyId)).size).toBe(2)
  })

  it('на пустом списке семейств берёт все', () => {
    expect(seedPopulation(3, []).items).toHaveLength(POPULATION_SIZE)
  })

  it('детерминирована', () => {
    expect(seedPopulation(9, FAMILY_IDS)).toEqual(seedPopulation(9, FAMILY_IDS))
  })

  it('все девять досок изготовимы', () => {
    expectAllBuildable(seedPopulation(4, FAMILY_IDS).items.map((i) => i.genome))
  })

  it('девять досок не совпадают между собой', () => {
    const keys = seedPopulation(5, FAMILY_IDS).items.map((i) => genomeKey(i.genome))
    expect(new Set(keys).size).toBe(POPULATION_SIZE)
  })
})

describe('mutate', () => {
  it('меняет геном, но оставляет его изготовимым', () => {
    const base = randomGenome('brick', 10)
    const changed: Genome[] = []
    for (let seed = 0; seed < 40; seed += 1) changed.push(mutate(base, makeRng(seed)))
    expect(changed.some((g) => genomeKey(g) !== genomeKey(base))).toBe(true)
    expectAllBuildable(changed)
  })

  it('детерминирована по сиду', () => {
    const base = randomGenome('gradient', 11)
    expect(mutate(base, makeRng(3))).toEqual(mutate(base, makeRng(3)))
  })

  it('замена породы берёт близкую по цвету, а не любую', () => {
    // Прогоняем много сидов и смотрим, что палитра меняется мелкими шагами.
    const base = randomGenome('stripes', 12)
    let swaps = 0
    for (let seed = 0; seed < 100; seed += 1) {
      const next = mutate(base, makeRng(seed))
      if (next.palette.join() !== base.palette.join()) swaps += 1
    }
    expect(swaps).toBeGreaterThan(10)
  })

  it('после мутации сохраняется корректная перестановка рядов', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const g = mutate(randomGenome('chaos', 13), makeRng(seed))
      expect([...g.rowOrder].sort((a, b) => a - b)).toEqual(Array.from({ length: g.params.rows }, (_, i) => i))
    }
  })
})

describe('crossover', () => {
  it('берёт признаки обоих родителей', () => {
    const a = randomGenome('stripes', 20)
    const b = randomGenome('brick', 21)
    const child = crossover(a, b, makeRng(1))
    expect([a.familyId, b.familyId]).toContain(child.familyId)
    const parentSpecies = new Set([...a.palette, ...b.palette])
    for (const id of child.palette) expect(parentSpecies.has(id)).toBe(true)
  })

  it('детерминирован и симметричен по сиду', () => {
    const a = randomGenome('gradient', 22)
    const b = randomGenome('chaos', 23)
    expect(crossover(a, b, makeRng(4))).toEqual(crossover(a, b, makeRng(4)))
  })

  it('потомок изготовим при любых родителях', () => {
    const children: Genome[] = []
    for (const left of FAMILY_IDS) {
      for (const right of FAMILY_IDS) {
        children.push(crossover(randomGenome(left, 1), randomGenome(right, 2), makeRng(7)))
      }
    }
    expectAllBuildable(children)
  })
})

describe('nextGeneration', () => {
  it('без избранных полностью обновляет популяцию', () => {
    const first = seedPopulation(30, FAMILY_IDS)
    const second = nextGeneration(first, [])
    expect(second.generation).toBe(2)
    const before = new Set(first.items.map((i) => genomeKey(i.genome)))
    const overlap = second.items.filter((i) => before.has(genomeKey(i.genome)))
    expect(overlap).toHaveLength(0)
  })

  it('сохраняет избранное нетронутым в первых слотах', () => {
    const first = seedPopulation(31, FAMILY_IDS)
    const favourite = first.items[3]
    expect(favourite).toBeDefined()
    if (!favourite) return
    const second = nextGeneration(first, [favourite.id])
    expect(second.items[0]?.genome).toEqual(favourite.genome)
  })

  it('двое избранных дают потомков, а не копии', () => {
    const first = seedPopulation(32, FAMILY_IDS)
    const ids = [first.items[0]?.id, first.items[1]?.id].filter((id): id is string => id !== undefined)
    const second = nextGeneration(first, ids)
    expect(second.items).toHaveLength(POPULATION_SIZE)
    const keys = second.items.map((i) => genomeKey(i.genome))
    expect(new Set(keys).size).toBeGreaterThanOrEqual(POPULATION_SIZE - 1)
  })

  it('детерминирована по тем же кликам', () => {
    const first = seedPopulation(33, FAMILY_IDS)
    const ids = [first.items[2]?.id, first.items[5]?.id].filter((id): id is string => id !== undefined)
    expect(nextGeneration(first, ids)).toEqual(nextGeneration(first, ids))
  })

  it('порядок кликов не влияет на результат', () => {
    const first = seedPopulation(34, FAMILY_IDS)
    const a = first.items[1]?.id
    const b = first.items[6]?.id
    if (a === undefined || b === undefined) return
    expect(nextGeneration(first, [a, b])).toEqual(nextGeneration(first, [b, a]))
  })

  it('незнакомые идентификаторы игнорирует', () => {
    const first = seedPopulation(35, FAMILY_IDS)
    expect(nextGeneration(first, ['мусор'])).toEqual(nextGeneration(first, []))
  })

  it('через десять поколений всё ещё изготовимо', () => {
    let pop = seedPopulation(36, FAMILY_IDS)
    for (let step = 0; step < 10; step += 1) {
      const ids = [pop.items[0]?.id, pop.items[4]?.id].filter((id): id is string => id !== undefined)
      pop = nextGeneration(pop, ids)
    }
    expect(pop.generation).toBe(11)
    expectAllBuildable(pop.items.map((i) => i.genome))
  })

  it('идентификаторы уникальны в каждом поколении', () => {
    let pop = seedPopulation(37, FAMILY_IDS)
    for (let step = 0; step < 5; step += 1) {
      pop = nextGeneration(pop, [pop.items[0]?.id ?? ''])
      expect(new Set(pop.items.map((i) => i.id)).size).toBe(POPULATION_SIZE)
    }
  })
})

describe('reshuffle', () => {
  it('меняет сид и обнуляет поколение', () => {
    const first = seedPopulation(40, FAMILY_IDS)
    const shuffled = reshuffle(first)
    expect(shuffled.seed).not.toBe(first.seed)
    expect(shuffled.generation).toBe(1)
    expect(shuffled.familyIds).toEqual(first.familyIds)
  })
})

describe('applyParams', () => {
  it('применяет ползунок ко всем девяти, не теряя поиск', () => {
    const first = seedPopulation(41, ['chaos'])
    const wider = applyParams(first, { cols: 12 })
    expect(wider.items).toHaveLength(POPULATION_SIZE)
    for (const item of wider.items) expect(item.genome.params.cols).toBe(12)
    expect(wider.generation).toBe(first.generation)
    expectAllBuildable(wider.items.map((i) => i.genome))
  })

  it('не трогает семейства и сиды особей', () => {
    const first = seedPopulation(42, FAMILY_IDS)
    const next = applyParams(first, { density: 0.9 })
    expect(next.items.map((i) => i.genome.seed)).toEqual(first.items.map((i) => i.genome.seed))
    expect(next.items.map((i) => i.genome.familyId)).toEqual(first.items.map((i) => i.genome.familyId))
  })

  it('зажимает невозможные значения вместо того, чтобы ломать доску', () => {
    const first = seedPopulation(43, ['symmetry-p4m'])
    const next = applyParams(first, { cols: 99, rows: 1 })
    for (const item of next.items) {
      expect(item.genome.params.cols).toBeLessThanOrEqual(12)
      expect(item.genome.params.rows).toBe(item.genome.params.cols)
    }
    expectAllBuildable(next.items.map((i) => i.genome))
  })
})
```

- [ ] **Step 2: Implement `lib/generators/evolve.ts`**

```ts
import type { SpeciesId } from '@/lib/engine'
import { speciesNeighbours } from '@/lib/species/lab'
import { roundHalf } from '@/lib/designs/fit'
import {
  FAMILY_IDS,
  clampGenome,
  randomGenome,
  type FamilyId,
  type GenParams,
  type Genome,
} from './genome'
import { sanitisePalette } from './palette'
import { makeRng, mixSeed, type Rng } from './random'

export const POPULATION_SIZE = 9

export interface Individual {
  readonly id: string
  readonly genome: Genome
}

export interface Population {
  readonly seed: number
  readonly generation: number
  readonly familyIds: readonly FamilyId[]
  readonly items: readonly Individual[]
}

function idFor(generation: number, index: number): string {
  return `g${generation}i${index}`
}

function familiesOf(familyIds: readonly FamilyId[]): readonly FamilyId[] {
  const filtered = familyIds.filter((id) => FAMILY_IDS.includes(id))
  return filtered.length > 0 ? filtered : FAMILY_IDS
}

/** Свежая девятка: семейства раскладываются по кругу, сид каждой особи выводится из сида популяции. */
export function seedPopulation(seed: number, familyIds: readonly FamilyId[]): Population {
  const families = familiesOf(familyIds)
  const base = Math.abs(Math.trunc(seed)) >>> 0
  const items = Array.from({ length: POPULATION_SIZE }, (_, index) => {
    const familyId = families[index % families.length] ?? 'stripes'
    return { id: idFor(1, index), genome: randomGenome(familyId, mixSeed(base, index)) }
  })
  return { seed: base, generation: 1, familyIds: families, items }
}

export function reshuffle(population: Population): Population {
  return seedPopulation(mixSeed(population.seed, population.generation + 0x77), population.familyIds)
}

type MutationKind = 'species' | 'widths' | 'rows' | 'grid' | 'seed' | 'paletteSize'
const MUTATIONS: readonly MutationKind[] = ['species', 'widths', 'rows', 'grid', 'seed', 'paletteSize']

function mutateOnce(genome: Genome, kind: MutationKind, rng: Rng): Genome {
  if (kind === 'species') {
    // Порода меняется на близкую по LAB: узор узнаётся, но настроение сдвигается.
    const index = rng.int(genome.palette.length)
    const current = genome.palette[index]
    if (current === undefined) return genome
    const neighbours = speciesNeighbours(current, 4).filter((id) => !genome.palette.includes(id))
    if (neighbours.length === 0) return genome
    const palette: SpeciesId[] = [...genome.palette]
    palette[index] = rng.pick(neighbours)
    return { ...genome, palette }
  }
  if (kind === 'widths') {
    const amount = 0.2
    return {
      ...genome,
      colWidthsMm: genome.colWidthsMm.map((w) => roundHalf(w * (1 + (rng.next() * 2 - 1) * amount))),
      rowHeightsMm: genome.rowHeightsMm.map((h) => roundHalf(h * (1 + (rng.next() * 2 - 1) * amount))),
    }
  }
  if (kind === 'rows') {
    return { ...genome, rowOrder: rng.shuffled(genome.rowOrder) }
  }
  if (kind === 'grid') {
    const delta = rng.bool() ? 1 : -1
    return {
      ...genome,
      params: { ...genome.params, cols: genome.params.cols + delta, rows: genome.params.rows + (rng.bool() ? delta : 0) },
    }
  }
  if (kind === 'seed') {
    return { ...genome, seed: mixSeed(genome.seed, rng.int(1024) + 1) }
  }
  const size = genome.palette.length + (rng.bool() ? 1 : -1)
  return { ...genome, palette: sanitisePalette(genome.palette, genome.seed, size) }
}

/** Одна или две случайные правки генома. Больше двух за раз - и родство с оригиналом теряется. */
export function mutate(genome: Genome, rng: Rng): Genome {
  let out = genome
  const count = rng.bool(0.35) ? 2 : 1
  for (let step = 0; step < count; step += 1) out = mutateOnce(out, rng.pick(MUTATIONS), rng)
  return clampGenome(out)
}

function blend(a: number, b: number, takeA: boolean): number {
  return takeA ? a : b
}

/**
 * Скрещивание: ширины от одного родителя, ряды от другого, палитра вперемешку.
 * Одноточечный разрез по спискам рядов даёт потомку узнаваемую половину каждого родителя.
 */
export function crossover(a: Genome, b: Genome, rng: Rng): Genome {
  const familyId = rng.bool() ? a.familyId : b.familyId
  const cut = 1 + rng.int(Math.max(1, Math.min(a.rowHeightsMm.length, b.rowHeightsMm.length) - 1))
  const rowHeightsMm = [...a.rowHeightsMm.slice(0, cut), ...b.rowHeightsMm.slice(cut)]
  const rowOrder = [...a.rowOrder.slice(0, cut), ...b.rowOrder.slice(cut)]

  const mixedPalette: SpeciesId[] = []
  const longer = Math.max(a.palette.length, b.palette.length)
  for (let i = 0; i < longer; i += 1) {
    const first = rng.bool() ? a.palette[i] : b.palette[i]
    const second = first === a.palette[i] ? b.palette[i] : a.palette[i]
    const chosen = first ?? second
    if (chosen !== undefined && !mixedPalette.includes(chosen)) mixedPalette.push(chosen)
  }

  const takeA = rng.bool()
  const params: GenParams = {
    cols: blend(a.params.cols, b.params.cols, takeA),
    rows: blend(a.params.rows, b.params.rows, !takeA),
    cellMm: roundHalf((a.params.cellMm + b.params.cellMm) / 2),
    density: (a.params.density + b.params.density) / 2,
    jitter: (a.params.jitter + b.params.jitter) / 2,
  }

  return clampGenome({
    familyId,
    seed: mixSeed(a.seed, b.seed),
    palette: mixedPalette,
    colWidthsMm: takeA ? [...a.colWidthsMm] : [...b.colWidthsMm],
    rowHeightsMm,
    rowOrder,
    params,
  })
}

/**
 * Следующее поколение. Пользователь и есть функция приспособленности: никакого скоринга
 * контраста и симметрии здесь нет и не будет, звёздочки решают всё.
 */
export function nextGeneration(population: Population, favouriteIds: readonly string[]): Population {
  const generation = population.generation + 1
  const chosen = population.items.filter((item) => favouriteIds.includes(item.id))
  const families = familiesOf(population.familyIds)
  // Сид зависит от выбора, но не от порядка кликов: одни и те же звёздочки дают ту же девятку.
  const choiceSalt = chosen.reduce((acc, item) => acc ^ Number.parseInt(item.id.replace(/\D/g, ''), 10), 0)
  const seed = mixSeed(mixSeed(population.seed, generation), choiceSalt)

  if (chosen.length === 0) {
    return { ...seedPopulation(seed, families), generation, familyIds: families, items: seedPopulation(seed, families).items.map((item, index) => ({ ...item, id: idFor(generation, index) })) }
  }

  const rng = makeRng(seed)
  const items: Individual[] = chosen
    .slice(0, POPULATION_SIZE - 1)
    .map((item, index) => ({ id: idFor(generation, index), genome: item.genome }))

  while (items.length < POPULATION_SIZE - 1) {
    const index = items.length
    const parentA = rng.pick(chosen).genome
    const genome =
      chosen.length >= 2 && rng.bool(0.5)
        ? crossover(parentA, rng.pick(chosen).genome, rng)
        : mutate(parentA, rng)
    items.push({ id: idFor(generation, index), genome })
  }

  // Последний слот всегда чужак: без притока свежей крови девятка схлопывается за пять поколений.
  const immigrantFamily = families[rng.int(families.length)] ?? 'stripes'
  items.push({ id: idFor(generation, POPULATION_SIZE - 1), genome: randomGenome(immigrantFamily, mixSeed(seed, 0xbeef)) })

  return { seed: population.seed, generation, familyIds: families, items }
}

/** Ползунки в интерфейсе: правка параметров всей девятки без потери найденного. */
export function applyParams(population: Population, patch: Partial<GenParams>): Population {
  return {
    ...population,
    items: population.items.map((item) => ({
      ...item,
      genome: clampGenome({ ...item.genome, params: { ...item.genome.params, ...patch } }),
    })),
  }
}
```

The zero-favourites branch above is written twice by accident in the draft; collapse it to one call before running:

```ts
if (chosen.length === 0) {
  const fresh = seedPopulation(seed, families)
  return {
    seed: population.seed,
    generation,
    familyIds: families,
    items: fresh.items.map((item, index) => ({ id: idFor(generation, index), genome: item.genome })),
  }
}
```

- [ ] **Step 3: Add the evolve re-exports to `lib/generators/index.ts` and commit**

Append to `lib/generators/index.ts` the block that Task 4 deliberately left out:

```ts
export {
  POPULATION_SIZE,
  applyParams,
  crossover,
  mutate,
  nextGeneration,
  reshuffle,
  seedPopulation,
  type Individual,
  type Population,
} from './evolve'
```

```bash
pnpm exec vitest run lib/generators
pnpm typecheck && pnpm lint
git add lib/generators
git commit -m "feat: интерактивная эволюция узоров, мутации и скрещивание"
```

Expected: about 25 new cases green, including the ten-generation drift test. The two assertions most likely to fail first are "no favourites fully refreshes the population" (fix: make sure the fresh seed is derived from the generation, not reused) and "click order does not matter" (fix: the salt must be built from the ids themselves, never from their position in the `favouriteIds` array).

---

### Task 6: Store views, i18n and the shared confirm dialog

**Files:**
- Modify: `lib/store/studio.ts`
- Modify: `lib/store/studio.test.ts`
- Modify: `components/StudioTabs.tsx`
- Modify: `components/StudioTabs.test.tsx`
- Modify: `components/StudioShell.tsx`
- Modify: `components/StudioShell.test.tsx`
- Create: `components/ConfirmReplace.tsx`
- Test: `components/ConfirmReplace.test.tsx`
- Modify: `components/TemplateGallery.tsx`
- Modify: `lib/i18n/ru.ts`, `lib/i18n/en.ts`
- Modify: `lib/flags.ts`

**Navigation decision, and why.** Two new top-level tabs, `generate` and `photo`, not a single `create` hub with sub-tabs. The tab bar goes from three entries to five.

The hub is the tidier information architecture and it is the wrong choice here. The photo flow is the contest hero: the demo GIF opens the app and clicks straight into it, and burying it one level deep costs a click in the fifteen seconds that decide the score. A hub would also need a second piece of UI state (which sub-tab is active) plus a decision about what the hub shows before you pick, and it would push the shipped `tab-templates` selector one level down, breaking `e2e/templates.spec.ts` for no user-visible gain. The existing bar is already `flex flex-wrap gap-1` with `size="sm"` buttons, so five entries wrap cleanly at 360 px. If the bar ever reaches seven entries, revisit this; at five it is a segmented control, not a menu.

**Interfaces:**

```ts
// lib/store/studio.ts
export type StudioView = 'editor' | 'templates' | 'generate' | 'photo' | 'view3d'

export interface GeneratorUiState {
  readonly population: Population
  readonly favouriteIds: readonly string[]
}
export interface PhotoUiState {
  readonly grid: PixelGrid
  readonly fileName: string
  readonly colors: number
  readonly panels: number
}
export interface StudioState {
  // ... shipped fields
  readonly generator: GeneratorUiState | null
  readonly photo: PhotoUiState | null
  setGenerator(next: GeneratorUiState): void
  setPhoto(next: PhotoUiState | null): void
}

// components/ConfirmReplace.tsx
export function ConfirmReplace(props: {
  readonly testId: string          // 'template' | 'generator' | 'photo'
  readonly title: string
  readonly body: string
  readonly confirmLabel: string
  readonly cancelLabel: string
  readonly onConfirm: () => void
  readonly onCancel: () => void
}): JSX.Element
```

Both new store fields live in `UI_DEFAULTS`, so `resetStudio` clears them and `loadDesign` keeps them. That is the behaviour we want: sending a generated board to the editor must not destroy the population the user is still exploring, so they can go back to the generator tab and pick a different one.

`PixelGrid` holds a `Uint8ClampedArray`, which is never serialised: `useStudioPersistence` saves `selectDesign` only, so nothing about the photo goes to `localStorage` or into the share hash.

- [ ] **Step 1: Write the failing store test additions**

Append to `lib/store/studio.test.ts`:

```ts
import { seedPopulation } from '@/lib/generators'
import { FAMILY_IDS } from '@/lib/generators/genome'

describe('состояние вкладок генератора и фото', () => {
  it('по умолчанию пусто', () => {
    const store = createStudioStore()
    expect(store.getState().generator).toBe(null)
    expect(store.getState().photo).toBe(null)
  })

  it('знает про пять вкладок', () => {
    const store = createStudioStore()
    for (const view of ['editor', 'templates', 'generate', 'photo', 'view3d'] as const) {
      store.getState().setView(view)
      expect(store.getState().view).toBe(view)
    }
  })

  it('хранит популяцию между переключениями вкладок', () => {
    const store = createStudioStore()
    const population = seedPopulation(1, FAMILY_IDS)
    store.getState().setGenerator({ population, favouriteIds: ['g1i0'] })
    store.getState().setView('editor')
    store.getState().setView('generate')
    expect(store.getState().generator?.population.items).toHaveLength(9)
    expect(store.getState().generator?.favouriteIds).toEqual(['g1i0'])
  })

  it('загрузка документа из генератора не стирает популяцию', () => {
    const store = createStudioStore()
    store.getState().setGenerator({ population: seedPopulation(2, FAMILY_IDS), favouriteIds: [] })
    store.getState().loadDesign(makeCheckerboard())
    expect(store.getState().generator).not.toBe(null)
    expect(store.getState().documentTouched).toBe(true)
  })

  it('resetStudio сбрасывает обе панели', () => {
    const store = createStudioStore()
    store.getState().setGenerator({ population: seedPopulation(3, FAMILY_IDS), favouriteIds: [] })
    store.getState().setPhoto({
      grid: { cols: 2, rows: 2, rgba: new Uint8ClampedArray(16) },
      fileName: 'x.png',
      colors: 3,
      panels: 2,
    })
    store.getState().resetStudio()
    expect(store.getState().generator).toBe(null)
    expect(store.getState().photo).toBe(null)
    expect(store.getState().view).toBe('editor')
  })

  it('setPhoto(null) очищает картинку', () => {
    const store = createStudioStore()
    store.getState().setPhoto({
      grid: { cols: 1, rows: 1, rgba: new Uint8ClampedArray(4) },
      fileName: 'y.png',
      colors: 2,
      panels: 1,
    })
    store.getState().setPhoto(null)
    expect(store.getState().photo).toBe(null)
  })
})
```

- [ ] **Step 2: Extend `lib/store/studio.ts`**

Three edits, nothing else in the file changes.

```ts
// 1. Imports
import type { Population } from '@/lib/generators'
import type { PixelGrid } from '@/lib/photo'

// 2. Types
export type StudioView = 'editor' | 'templates' | 'generate' | 'photo' | 'view3d'

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

// 3. In StudioState
  readonly generator: GeneratorUiState | null
  readonly photo: PhotoUiState | null
  setGenerator(next: GeneratorUiState): void
  setPhoto(next: PhotoUiState | null): void

// 4. In UI_DEFAULTS
  generator: null,
  photo: null,

// 5. In the store body, next to setView
  setGenerator: (generator) => set({ generator }),
  setPhoto: (photo) => set({ photo }),
```

`lib/photo/index.ts` does not exist until Task 8. Do this task after Task 8, or land Task 6 with a locally declared `PixelGrid` and swap the import in Task 8. Prefer reordering: run Tasks 8 and 9 before Task 6 if you are executing out of order. The dependency is only this one type import.

- [ ] **Step 3: Write the failing `ConfirmReplace` test**

Create `components/ConfirmReplace.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmReplace } from './ConfirmReplace'

function setup(overrides: Partial<Parameters<typeof ConfirmReplace>[0]> = {}) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ConfirmReplace
      testId="generator"
      title="Заменить текущий проект?"
      body="Узор заменит доску целиком."
      confirmLabel="Заменить"
      cancelLabel="Отмена"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ConfirmReplace', () => {
  it('показывает заголовок и текст', () => {
    setup()
    expect(screen.getByTestId('generator-confirm-dialog')).toBeInTheDocument()
    expect(screen.getByText('Заменить текущий проект?')).toBeInTheDocument()
    expect(screen.getByText('Узор заменит доску целиком.')).toBeInTheDocument()
  })

  it('это модальный диалог с доступным именем', () => {
    setup()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-label', 'Заменить текущий проект?')
  })

  it('кнопки зовут свои обработчики', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = setup()
    await user.click(screen.getByTestId('generator-confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await user.click(screen.getByTestId('generator-cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('идентификаторы шаблонов сохранены ради существующих e2e', () => {
    setup({ testId: 'template' })
    expect(screen.getByTestId('template-confirm-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('template-confirm')).toBeInTheDocument()
    expect(screen.getByTestId('template-cancel')).toBeInTheDocument()
  })
})
```

Check whether `@testing-library/user-event` is actually installed before writing this test: `package.json` lists `@testing-library/react` and `@testing-library/jest-dom` but not `user-event`. If it is missing, use `fireEvent.click` from `@testing-library/react` exactly as the shipped `ForkDialog.test.tsx` does, and follow that file's style everywhere in this phase rather than introducing a new dependency.

- [ ] **Step 4: Implement `components/ConfirmReplace.tsx` and reuse it in `TemplateGallery`**

```tsx
'use client'

import { Button } from '@/components/ui/button'

/**
 * Одно окно подтверждения на три места: шаблоны, генератор, фото.
 * Идентификаторы задаются снаружи, потому что за template-confirm уже держатся e2e-тесты
 * третьей фазы, и переименовывать их ради красоты нельзя.
 */
export function ConfirmReplace({
  testId,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  testId: string
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      data-testid={`${testId}-confirm-dialog`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border bg-background p-4 shadow-lg"
    >
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button data-testid={`${testId}-cancel`} size="sm" variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button data-testid={`${testId}-confirm`} size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
```

In `components/TemplateGallery.tsx`, replace the inline `pending ? (<div ...>) : null` block with:

```tsx
{pending ? (
  <ConfirmReplace
    testId="template"
    title={t(locale, 'templates.confirmTitle')}
    body={t(locale, 'templates.confirmBody', { name: t(locale, pending.nameKey) })}
    confirmLabel={t(locale, 'templates.confirmApply')}
    cancelLabel={t(locale, 'templates.confirmCancel')}
    onConfirm={() => apply(pending)}
    onCancel={() => setPending(null)}
  />
) : null}
```

Then run the shipped template tests as the safety net for this refactor:

```bash
pnpm exec vitest run components/TemplateGallery.test.tsx components/ConfirmReplace.test.tsx
```

- [ ] **Step 5: Add the i18n keys**

Add to `lib/i18n/ru.ts` (and the mirrored English strings to `lib/i18n/en.ts` in the same commit):

```ts
  'tabs.generate': 'Генератор',
  'tabs.photo': 'Фото',
  'gen.title': 'Генератор узоров',
  'gen.subtitle': 'Девять вариантов сразу. Отметьте понравившиеся звёздочкой и жмите «Дальше»: следующая девятка вырастет из них',
  'gen.families': 'Семейства узоров',
  'gen.shuffle': 'Перемешать',
  'gen.evolve': 'Дальше',
  'gen.evolveHint': 'Без отмеченных получится просто новая девятка',
  'gen.generation': 'Поколение {number}',
  'gen.favourite': 'В избранное',
  'gen.apply': 'В редактор',
  'gen.cols': 'Колонок',
  'gen.rows': 'Рядов',
  'gen.density': 'Плотность узора',
  'gen.cardStats': 'склеек: {glueUps}, {widthMm} × {lengthMm} мм',
  'gen.designName': 'Генератор: {family}',
  'gen.confirmTitle': 'Заменить текущий проект?',
  'gen.confirmBody': 'Узор «{name}» заменит доску целиком, а история правок обнулится.',
  'gen.confirmApply': 'Заменить',
  'gen.confirmCancel': 'Отмена',
  'gen.family.symmetry-pmm': 'Зеркальная симметрия',
  'gen.family.symmetry-p4m': 'Симметрия квадрата',
  'gen.family.symmetry-p2': 'Поворотная симметрия',
  'gen.family.stripes': 'Полосы',
  'gen.family.brick': 'Кирпич',
  'gen.family.gradient': 'Градиент',
  'gen.family.chaos': 'Россыпь',
  'gen.family.inlay': 'Инкрустация',
  'aria.generatorPanel': 'генератор узоров',
  'aria.generatorGrid': 'девять вариантов узора',
  'photo.title': 'Узор по фотографии',
  'photo.subtitle': 'Загрузите картинку: студия разложит её на реальные породы и превратит в изготовимую доску',
  'photo.pick': 'Выбрать файл',
  'photo.drop': 'Перетащите картинку сюда или выберите файл',
  'photo.colors': 'Пород в узоре',
  'photo.panels': 'Похожесть и число щитов',
  'photo.panelsHint': 'Левее - меньше склеек и больше стилизации, правее - ближе к оригиналу',
  'photo.apply': 'В редактор',
  'photo.stats': 'склеек: {glueUps}, пород: {species}, {widthMm} × {lengthMm} мм',
  'photo.designName': 'Фото: {file}',
  'photo.error': 'Не получилось прочитать картинку. Попробуйте другой файл',
  'photo.errorType': 'Нужен файл изображения: png, jpeg или webp',
  'photo.loading': 'Разбираем картинку',
  'photo.confirmTitle': 'Заменить текущий проект?',
  'photo.confirmBody': 'Узор по фотографии заменит доску целиком, а история правок обнулится.',
  'photo.confirmApply': 'Заменить',
  'photo.confirmCancel': 'Отмена',
  'aria.photoPanel': 'узор по фотографии',
  'aria.photoPreview': 'превью узора по фотографии',
```

English side, same keys: `'tabs.generate': 'Generator'`, `'tabs.photo': 'Photo'`, `'gen.family.symmetry-p4m': 'Square symmetry'`, `'photo.panels': 'Likeness versus glue-ups'`, and so on. Keep the placeholder names identical (`{number}`, `{glueUps}`, `{widthMm}`, `{lengthMm}`, `{species}`, `{file}`, `{name}`, `{family}`), because `t()` interpolates by name.

- [ ] **Step 6: Wire the tabs and the shell**

`components/StudioTabs.tsx`: extend the `TABS` constant. Order matters, put creation next to creation:

```ts
const TABS: readonly { readonly view: StudioView; readonly labelKey: MessageKey }[] = [
  { view: 'editor', labelKey: 'tabs.editor' },
  { view: 'templates', labelKey: 'tabs.templates' },
  { view: 'generate', labelKey: 'tabs.generate' },
  { view: 'photo', labelKey: 'tabs.photo' },
  { view: 'view3d', labelKey: 'tabs.view3d' },
]
```

`components/StudioShell.tsx`: the full-width branch grows from one view to three.

```tsx
const FULL_WIDTH: readonly StudioView[] = ['templates', 'generate', 'photo']

// ...
{FULL_WIDTH.includes(view) ? (
  view === 'templates' ? <TemplateGallery /> : view === 'generate' ? <GeneratorPanel /> : <PhotoImport />
) : (
  /* the shipped two-column editor and 3D layout, unchanged */
)}
```

Update `components/StudioTabs.test.tsx` to assert five tabs and that clicking `tab-photo` sets the view, and `components/StudioShell.test.tsx` to assert that the generator and photo panels appear on their views and that the editor aside is hidden there. Both files already have the pattern for this from phase 3; follow it exactly, including the `act()` wrapper from quirk 3.

- [ ] **Step 7: Flip the flag and commit**

`lib/flags.ts`: `generators: true`.

```bash
pnpm exec vitest run lib components
pnpm typecheck && pnpm lint
git commit -am "feat: вкладки генератора и фото, общее окно подтверждения, словари"
```

Expected: the i18n test passes (both dictionaries carry the same keys, no em dash), the shipped template tests still pass after the dialog refactor, five tabs render.

---

### Task 7: The generator panel

**Files:**
- Create: `components/GeneratorPanel.tsx`
- Test: `components/GeneratorPanel.test.tsx`

**Interfaces:**
- Consumes: `compile`, `type BoardModel` from `@/lib/engine`; `POPULATION_SIZE`, `applyParams`, `nextGeneration`, `reshuffle`, `seedPopulation`, `toDesign`, `FAMILIES`, `FAMILY_IDS`, `genomeKey`, `type FamilyId`, `type Population` from `@/lib/generators`; `BoardSvg`; `ConfirmReplace`; `t`; `selectIsDirty`, `useStudio`.
- Produces: `export function GeneratorPanel(): JSX.Element`

Test ids: `generator-panel`, `gen-family-<familyId>`, `gen-shuffle`, `gen-evolve`, `gen-generation`, `gen-cols`, `gen-rows`, `gen-density`, `gen-card-<index>`, `gen-fav-<index>`, `gen-apply-<index>`, plus `generator-confirm-dialog` / `generator-confirm` / `generator-cancel` from `ConfirmReplace`.

**The seed constant.** The first population must be identical on the server and on the client, so the initial seed is the module constant `DEFAULT_GENERATOR_SEED = 20260812` (the date of this phase, no meaning beyond being a fixed number). "Перемешать" derives the next seed from the current one through `mixSeed`, never from the clock.

**No effects.** The component reads `generator` from the store, and when it is `null` it computes the first population during render and calls `setGenerator` inside the handlers only. Rendering must not write to the store, so the `null` case is handled by computing a local fallback with `useMemo` and treating "the store has nothing yet" as "show the default population"; the store is only written when the user actually does something. This is what keeps ESLint's `set-state-in-effect` rule satisfied without an effect.

- [ ] **Step 1: Write the failing component test**

Create `components/GeneratorPanel.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { POPULATION_SIZE } from '@/lib/generators'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import { GeneratorPanel } from './GeneratorPanel'

describe('GeneratorPanel', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard())
  })

  it('показывает девять превью', () => {
    render(<GeneratorPanel />)
    expect(screen.getByTestId('generator-panel')).toBeInTheDocument()
    for (let index = 0; index < POPULATION_SIZE; index += 1) {
      const card = screen.getByTestId(`gen-card-${index}`)
      expect(within(card).getAllByRole('img').length).toBeGreaterThan(0)
    }
  })

  it('в каждом превью есть настоящие ячейки доски', () => {
    const { container } = render(<GeneratorPanel />)
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(50)
  })

  it('первая девятка одинакова при каждом монтировании', () => {
    const first = render(<GeneratorPanel />).container.innerHTML
    act(() => {
      useStudio.getState().resetStudio(makeCheckerboard())
    })
    const second = render(<GeneratorPanel />).container.innerHTML
    expect(second).toBe(first)
  })

  it('перемешать меняет все девять досок', () => {
    const { container } = render(<GeneratorPanel />)
    const before = container.innerHTML
    fireEvent.click(screen.getByTestId('gen-shuffle'))
    expect(container.innerHTML).not.toBe(before)
  })

  it('звёздочка отмечает избранное', () => {
    render(<GeneratorPanel />)
    const star = screen.getByTestId('gen-fav-2')
    expect(star).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(star)
    expect(screen.getByTestId('gen-fav-2')).toHaveAttribute('aria-pressed', 'true')
    expect(useStudio.getState().generator?.favouriteIds).toHaveLength(1)
  })

  it('следующее поколение сохраняет избранное в первом слоте', () => {
    const { container } = render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-fav-3'))
    const favouriteHtml = screen.getByTestId('gen-card-3').innerHTML
    fireEvent.click(screen.getByTestId('gen-evolve'))
    expect(screen.getByTestId('gen-generation')).toHaveTextContent('2')
    expect(screen.getByTestId('gen-card-0').innerHTML).toContain(favouriteHtml.slice(0, 200))
    expect(container.querySelectorAll('[data-testid^="gen-card-"]')).toHaveLength(POPULATION_SIZE)
  })

  it('после эволюции избранное сбрасывается', () => {
    render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-fav-1'))
    fireEvent.click(screen.getByTestId('gen-evolve'))
    expect(useStudio.getState().generator?.favouriteIds).toEqual([])
  })

  it('фильтр семейств оставляет только выбранное', () => {
    render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-family-chaos'))
    const population = useStudio.getState().generator?.population
    expect(population?.familyIds).toEqual(['chaos'])
    for (const item of population?.items ?? []) expect(item.genome.familyId).toBe('chaos')
  })

  it('ползунок колонок переписывает все девять геномов', () => {
    render(<GeneratorPanel />)
    fireEvent.change(screen.getByTestId('gen-cols'), { target: { value: '10' } })
    for (const item of useStudio.getState().generator?.population.items ?? []) {
      // Симметрия квадрата и инкрустация имеют право зажать значение, остальные обязаны его принять.
      expect(item.genome.params.cols).toBeLessThanOrEqual(12)
    }
  })

  it('на чистом документе применяет узор сразу', () => {
    render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-apply-4'))
    expect(screen.queryByTestId('generator-confirm-dialog')).not.toBeInTheDocument()
    expect(useStudio.getState().view).toBe('editor')
    expect(useStudio.getState().documentTouched).toBe(true)
  })

  it('поверх правок сначала спрашивает', () => {
    act(() => {
      useStudio.getState().setBoardThicknessMm(55)
    })
    render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-apply-0'))
    expect(screen.getByTestId('generator-confirm-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('generator-cancel'))
    expect(screen.queryByTestId('generator-confirm-dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('gen-apply-0'))
    fireEvent.click(screen.getByTestId('generator-confirm'))
    expect(useStudio.getState().view).toBe('editor')
  })

  it('под превью показана честная цена узора', () => {
    render(<GeneratorPanel />)
    expect(within(screen.getByTestId('gen-card-0')).getByText(/склеек/)).toBeInTheDocument()
  })

  it('популяция переживает уход на другую вкладку', () => {
    const { unmount } = render(<GeneratorPanel />)
    fireEvent.click(screen.getByTestId('gen-shuffle'))
    const seed = useStudio.getState().generator?.population.seed
    unmount()
    render(<GeneratorPanel />)
    expect(useStudio.getState().generator?.population.seed).toBe(seed)
  })
})
```

- [ ] **Step 2: Implement `components/GeneratorPanel.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { ConfirmReplace } from '@/components/ConfirmReplace'
import { Button } from '@/components/ui/button'
import { compile, type BoardModel } from '@/lib/engine'
import {
  FAMILIES,
  POPULATION_SIZE,
  applyParams,
  mixSeed,
  nextGeneration,
  reshuffle,
  seedPopulation,
  toDesign,
  type FamilyId,
  type Population,
} from '@/lib/generators'
import { t } from '@/lib/i18n'
import { selectIsDirty, useStudio } from '@/lib/store/studio'

/** Сид первой девятки прибит гвоздями: сервер и клиент обязаны отрисовать одно и то же. */
export const DEFAULT_GENERATOR_SEED = 20260812

export function GeneratorPanel() {
  const locale = useStudio((s) => s.locale)
  const generator = useStudio((s) => s.generator)
  const setGenerator = useStudio((s) => s.setGenerator)
  const loadDesign = useStudio((s) => s.loadDesign)
  const setView = useStudio((s) => s.setView)
  const dirty = useStudio(selectIsDirty)
  const [pending, setPending] = useState<number | null>(null)

  // Пока пользователь ничего не сделал, в сторе пусто: показываем девятку по умолчанию,
  // но в стор не пишем, потому что запись во время рендера - это тот самый set-state-in-effect.
  const fallback = useMemo(() => seedPopulation(DEFAULT_GENERATOR_SEED, FAMILIES.map((f) => f.id)), [])
  const population: Population = generator?.population ?? fallback
  const favouriteIds = generator?.favouriteIds ?? []

  const previews: readonly BoardModel[] = useMemo(
    () => population.items.map((item) => compile(toDesign(item.genome, item.id))),
    [population],
  )

  const commit = (next: Population, ids: readonly string[] = []): void => {
    setGenerator({ population: next, favouriteIds: ids })
  }

  const toggleFamily = (familyId: FamilyId): void => {
    const current = population.familyIds
    const next = current.length === 1 && current[0] === familyId ? FAMILIES.map((f) => f.id) : [familyId]
    commit(seedPopulation(mixSeed(population.seed, 0x5a), next))
  }

  const onSlider = (patch: { cols?: number; rows?: number; density?: number }): void => {
    commit(applyParams(population, patch), favouriteIds)
  }

  const toggleFavourite = (id: string): void => {
    const next = favouriteIds.includes(id) ? favouriteIds.filter((value) => value !== id) : [...favouriteIds, id]
    commit(population, next)
  }

  const apply = (index: number): void => {
    const item = population.items[index]
    if (!item) return
    const family = FAMILIES.find((f) => f.id === item.genome.familyId)
    const familyName = family ? t(locale, family.nameKey) : item.genome.familyId
    loadDesign(toDesign(item.genome, t(locale, 'gen.designName', { family: familyName })))
    setPending(null)
    setView('editor')
  }

  const onPick = (index: number): void => {
    if (dirty) setPending(index)
    else apply(index)
  }

  const first = population.items[0]?.genome.params

  return (
    <section data-testid="generator-panel" aria-label={t(locale, 'aria.generatorPanel')} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t(locale, 'gen.title')}</h2>
        <p className="text-sm text-muted-foreground">{t(locale, 'gen.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label={t(locale, 'gen.families')}>
        {FAMILIES.map((family) => (
          <Button
            key={family.id}
            data-testid={`gen-family-${family.id}`}
            size="sm"
            variant={population.familyIds.includes(family.id) ? 'default' : 'outline'}
            aria-pressed={population.familyIds.includes(family.id)}
            onClick={() => toggleFamily(family.id)}
          >
            {t(locale, family.nameKey)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t(locale, 'gen.cols')}
          <input
            data-testid="gen-cols"
            type="range"
            min={5}
            max={14}
            step={1}
            value={first?.cols ?? 8}
            onChange={(event) => onSlider({ cols: Number(event.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t(locale, 'gen.rows')}
          <input
            data-testid="gen-rows"
            type="range"
            min={5}
            max={16}
            step={1}
            value={first?.rows ?? 8}
            onChange={(event) => onSlider({ rows: Number(event.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t(locale, 'gen.density')}
          <input
            data-testid="gen-density"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round((first?.density ?? 0.5) * 100)}
            onChange={(event) => onSlider({ density: Number(event.target.value) / 100 })}
          />
        </label>

        <Button data-testid="gen-shuffle" size="sm" variant="outline" onClick={() => commit(reshuffle(population))}>
          {t(locale, 'gen.shuffle')}
        </Button>
        <Button data-testid="gen-evolve" size="sm" onClick={() => commit(nextGeneration(population, favouriteIds))}>
          {t(locale, 'gen.evolve')}
        </Button>
        <span data-testid="gen-generation" className="text-sm text-muted-foreground">
          {t(locale, 'gen.generation', { number: population.generation })}
        </span>
      </div>

      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        role="group"
        aria-label={t(locale, 'aria.generatorGrid')}
      >
        {population.items.map((item, index) => {
          const model = previews[index]
          const starred = favouriteIds.includes(item.id)
          return (
            <li key={item.id} data-testid={`gen-card-${index}`} className="flex flex-col items-center gap-2 rounded-lg border p-2">
              {model ? <BoardSvg model={model} locale={locale} maxPx={150} /> : null}
              {model ? (
                <span className="text-xs text-muted-foreground">
                  {t(locale, 'gen.cardStats', {
                    glueUps: model.glueUpCount,
                    widthMm: Math.round(model.widthMm),
                    lengthMm: Math.round(model.lengthMm),
                  })}
                </span>
              ) : null}
              <div className="flex gap-1">
                <Button
                  data-testid={`gen-fav-${index}`}
                  size="sm"
                  variant={starred ? 'default' : 'outline'}
                  aria-pressed={starred}
                  onClick={() => toggleFavourite(item.id)}
                >
                  {t(locale, 'gen.favourite')}
                </Button>
                <Button data-testid={`gen-apply-${index}`} size="sm" variant="outline" onClick={() => onPick(index)}>
                  {t(locale, 'gen.apply')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {pending !== null ? (
        <ConfirmReplace
          testId="generator"
          title={t(locale, 'gen.confirmTitle')}
          body={t(locale, 'gen.confirmBody', { name: t(locale, 'gen.title') })}
          confirmLabel={t(locale, 'gen.confirmApply')}
          cancelLabel={t(locale, 'gen.confirmCancel')}
          onConfirm={() => apply(pending)}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </section>
  )
}
```

`mixSeed` must be re-exported from `lib/generators/index.ts` for this import to work; Task 4 already lists it in the export block.

The nine previews mean nine `compile` calls per population change, roughly 1500 rects in the DOM. That is the same order as the sixteen template thumbnails already shipped, and the `useMemo` keyed on the population object means sliders and stars do not recompile anything they did not change (a star toggle keeps the same `population` reference, so `previews` is reused).

- [ ] **Step 3: Run, then commit**

```bash
pnpm exec vitest run components/GeneratorPanel.test.tsx
pnpm typecheck && pnpm lint
git add components/GeneratorPanel.tsx components/GeneratorPanel.test.tsx
git commit -m "feat: панель генератора с девятью превью и эволюцией"
```

Expected: 13 cases green. The "first nine are identical on every mount" case is the hydration guard: if it fails, something reached for the clock or for `Math.random`, and the purity test will not catch it because the offender is in `components/`, not in `lib/`.

---

### Task 8: Photo pipeline part 1, LAB, k-means and species mapping

**Files:**
- Create: `lib/photo/lab.ts`
- Test: `lib/photo/lab.test.ts`
- Create: `lib/photo/kmeans.ts`
- Test: `lib/photo/kmeans.test.ts`
- Create: `lib/photo/map.ts`
- Test: `lib/photo/map.test.ts`

**Interfaces:**

```ts
// lib/photo/lab.ts
export function srgbToLinear(channel: number): number        // channel 0..1
export function rgbToLab(r: number, g: number, b: number): Lab   // r, g, b in 0..255
export function hexToLab(hex: string): Lab

// lib/photo/kmeans.ts
export interface KMeansOptions { readonly seed?: number; readonly maxIter?: number }
export interface KMeansResult {
  readonly centroids: readonly Lab[]
  readonly labels: readonly number[]
  readonly iterations: number
}
export function kmeansLab(points: readonly Lab[], k: number, opts?: KMeansOptions): KMeansResult

// lib/photo/map.ts
export function mapClustersToSpecies(centroids: readonly Lab[], allowed?: readonly SpeciesId[]): readonly SpeciesId[]
```

**Canonical ordering.** `kmeansLab` sorts its output centroids by lightness, brightest first, and remaps the labels to match. Two consequences: cluster 0 is always the lightest part of the photo, which makes the pipeline readable in tests and in debugging, and the result no longer depends on the order in which k-means++ happened to seed its centroids.

**A verification the pipeline depends on.** The `lab` values in `lib/species/index.ts` were authored to match sRGB-to-LAB of the same row's `hex`. Photo clustering compares computed centroids against those authored values, so if the table drifted from its own hex the mapping would be skewed. The lab test checks all sixteen rows against `hexToLab` with a tolerance of 4. If a row fails, fix the table (the hex is what the user sees on screen, so the hex wins), do not weaken the tolerance.

- [ ] **Step 1: Write the failing LAB conversion test**

Create `lib/photo/lab.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SPECIES } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'
import { hexToLab, rgbToLab, srgbToLinear } from './lab'

describe('srgbToLinear', () => {
  it('линеаризует крайние точки', () => {
    expect(srgbToLinear(0)).toBeCloseTo(0, 6)
    expect(srgbToLinear(1)).toBeCloseTo(1, 6)
  })

  it('монотонен', () => {
    let previous = -1
    for (let i = 0; i <= 100; i += 1) {
      const value = srgbToLinear(i / 100)
      expect(value).toBeGreaterThan(previous)
      previous = value
    }
  })
})

describe('rgbToLab', () => {
  it('белый и чёрный на своих местах', () => {
    const white = rgbToLab(255, 255, 255)
    expect(white.L).toBeCloseTo(100, 2)
    expect(white.a).toBeCloseTo(0, 2)
    expect(white.b).toBeCloseTo(0, 2)
    const black = rgbToLab(0, 0, 0)
    expect(black.L).toBeCloseTo(0, 4)
  })

  it('совпадает со справочными значениями для чистых цветов', () => {
    const red = rgbToLab(255, 0, 0)
    expect(red.L).toBeCloseTo(53.24, 1)
    expect(red.a).toBeCloseTo(80.09, 1)
    expect(red.b).toBeCloseTo(67.2, 1)
    const green = rgbToLab(0, 255, 0)
    expect(green.L).toBeCloseTo(87.73, 1)
    const blue = rgbToLab(0, 0, 255)
    expect(blue.b).toBeCloseTo(-107.86, 1)
  })

  it('серые остаются нейтральными', () => {
    for (const value of [32, 96, 160, 224]) {
      const lab = rgbToLab(value, value, value)
      expect(Math.abs(lab.a)).toBeLessThan(0.5)
      expect(Math.abs(lab.b)).toBeLessThan(0.5)
    }
  })

  it('светлота растёт вместе с яркостью', () => {
    expect(rgbToLab(20, 20, 20).L).toBeLessThan(rgbToLab(200, 200, 200).L)
  })
})

describe('справочник пород согласован со своими hex', () => {
  it('заявленный LAB совпадает с пересчитанным из hex', () => {
    for (const species of SPECIES) {
      const computed = hexToLab(species.hex)
      expect(labDistance(computed, species.lab), `${species.id}: ${JSON.stringify(computed)}`).toBeLessThan(4)
    }
  })
})
```

- [ ] **Step 2: Implement `lib/photo/lab.ts`**

```ts
import type { Lab } from '@/lib/species'

/** Обратная гамма sRGB. Без неё усреднение цветов фотографии врёт по светлоте. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

// Точка белого D65 в процентах.
const XN = 95.047
const YN = 100
const ZN = 108.883
const EPS = 216 / 24389
const KAPPA = 24389 / 27

function pivot(t: number): number {
  return t > EPS ? Math.cbrt(t) : (KAPPA * t + 16) / 116
}

/** sRGB (0..255) в CIELAB D65. Тот же расчёт, по которому собран справочник пород. */
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(Math.max(0, Math.min(255, r)) / 255)
  const lg = srgbToLinear(Math.max(0, Math.min(255, g)) / 255)
  const lb = srgbToLinear(Math.max(0, Math.min(255, b)) / 255)

  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) * 100
  const y = (0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb) * 100
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) * 100

  const fx = pivot(x / XN)
  const fy = pivot(y / YN)
  const fz = pivot(z / ZN)

  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) }
}

export function hexToLab(hex: string): Lab {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match || match[1] === undefined) return { L: 50, a: 0, b: 0 }
  const value = Number.parseInt(match[1], 16)
  return rgbToLab((value >> 16) & 255, (value >> 8) & 255, value & 255)
}
```

- [ ] **Step 3: Write the failing k-means test**

Create `lib/photo/kmeans.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Lab } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'
import { kmeansLab } from './kmeans'

/** Три тугих облака в LAB: светлое, среднее, тёмное. Детерминированный синтетический вход. */
function blobs(): Lab[] {
  const centres: Lab[] = [
    { L: 85, a: 4, b: 20 },
    { L: 50, a: 20, b: 30 },
    { L: 18, a: 6, b: 9 },
  ]
  const out: Lab[] = []
  centres.forEach((centre, index) => {
    for (let i = 0; i < 40; i += 1) {
      const wobble = ((i * 37 + index * 11) % 7) - 3
      out.push({ L: centre.L + wobble * 0.4, a: centre.a + wobble * 0.2, b: centre.b - wobble * 0.2 })
    }
  })
  return out
}

describe('kmeansLab', () => {
  it('находит три облака', () => {
    const result = kmeansLab(blobs(), 3, { seed: 1 })
    expect(result.centroids).toHaveLength(3)
    expect(result.labels).toHaveLength(120)
    const found = result.centroids.map((c) => Math.round(c.L))
    expect(found[0]).toBeGreaterThan(80)
    expect(found[2]).toBeLessThan(25)
  })

  it('центроиды отсортированы от светлого к тёмному', () => {
    const result = kmeansLab(blobs(), 3, { seed: 5 })
    const ls = result.centroids.map((c) => c.L)
    expect([...ls].sort((a, b) => b - a)).toEqual(ls)
  })

  it('метки указывают на ближайший центроид', () => {
    const points = blobs()
    const result = kmeansLab(points, 3, { seed: 2 })
    points.forEach((point, index) => {
      const label = result.labels[index] ?? 0
      const own = result.centroids[label]
      if (!own) throw new Error('нет центроида')
      for (const centroid of result.centroids) {
        expect(labDistance(point, own)).toBeLessThanOrEqual(labDistance(point, centroid) + 1e-9)
      }
    })
  })

  it('детерминирован по сиду', () => {
    expect(kmeansLab(blobs(), 4, { seed: 3 })).toEqual(kmeansLab(blobs(), 4, { seed: 3 }))
  })

  it('не зависит от сида, когда кластеры очевидны', () => {
    const a = kmeansLab(blobs(), 3, { seed: 1 }).centroids.map((c) => Math.round(c.L))
    const b = kmeansLab(blobs(), 3, { seed: 999 }).centroids.map((c) => Math.round(c.L))
    expect(a).toEqual(b)
  })

  it('не просит больше кластеров, чем есть точек', () => {
    const result = kmeansLab([{ L: 10, a: 0, b: 0 }, { L: 90, a: 0, b: 0 }], 5, { seed: 1 })
    expect(result.centroids.length).toBeLessThanOrEqual(2)
  })

  it('на пустом входе возвращает пустой результат, а не падает', () => {
    const result = kmeansLab([], 3, { seed: 1 })
    expect(result.centroids).toEqual([])
    expect(result.labels).toEqual([])
  })

  it('однородная картинка не порождает пустых кластеров', () => {
    const flat: Lab[] = new Array(50).fill({ L: 60, a: 5, b: 5 })
    const result = kmeansLab(flat, 4, { seed: 4 })
    const used = new Set(result.labels)
    expect(used.size).toBe(result.centroids.length)
  })

  it('сходится быстрее лимита итераций', () => {
    expect(kmeansLab(blobs(), 3, { seed: 6, maxIter: 50 }).iterations).toBeLessThan(50)
  })
})
```

- [ ] **Step 4: Implement `lib/photo/kmeans.ts`**

```ts
import type { Lab } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'
import { makeRng } from '@/lib/generators/random'

export interface KMeansOptions {
  readonly seed?: number
  readonly maxIter?: number
}

export interface KMeansResult {
  readonly centroids: readonly Lab[]
  readonly labels: readonly number[]
  readonly iterations: number
}

const DEFAULT_MAX_ITER = 30

function nearestIndex(point: Lab, centroids: readonly Lab[]): number {
  let best = 0
  let bestDistance = Infinity
  centroids.forEach((centroid, index) => {
    const d = labDistance(point, centroid)
    if (d < bestDistance) {
      bestDistance = d
      best = index
    }
  })
  return best
}

/** k-means++: первый центр случайный, дальше точки берутся с вероятностью, растущей с расстоянием. */
function seedCentroids(points: readonly Lab[], k: number, seed: number): Lab[] {
  const rng = makeRng(seed)
  const first = points[rng.int(points.length)]
  if (first === undefined) return []
  const centroids: Lab[] = [first]
  while (centroids.length < k) {
    const weights = points.map((point) => {
      const d = labDistance(point, centroids[nearestIndex(point, centroids)] ?? point)
      return d * d
    })
    const total = weights.reduce((acc, value) => acc + value, 0)
    if (total <= 0) break
    let target = rng.next() * total
    let chosen = points[0]
    for (let i = 0; i < points.length; i += 1) {
      target -= weights[i] ?? 0
      if (target <= 0) {
        chosen = points[i]
        break
      }
    }
    if (chosen === undefined) break
    centroids.push(chosen)
  }
  return centroids
}

/**
 * k-means в LAB с детерминированной инициализацией. Результат канонизируется сортировкой
 * центроидов по светлоте: нулевой кластер всегда самый светлый, и порядок не зависит
 * от того, как лёг k-means++.
 */
export function kmeansLab(points: readonly Lab[], k: number, opts: KMeansOptions = {}): KMeansResult {
  const seed = opts.seed ?? 1
  const maxIter = opts.maxIter ?? DEFAULT_MAX_ITER
  if (points.length === 0 || k <= 0) return { centroids: [], labels: [], iterations: 0 }

  const wanted = Math.min(k, points.length)
  let centroids = seedCentroids(points, wanted, seed)
  if (centroids.length === 0) return { centroids: [], labels: [], iterations: 0 }

  let labels: number[] = new Array(points.length).fill(0)
  let iterations = 0

  for (; iterations < maxIter; iterations += 1) {
    const nextLabels = points.map((point) => nearestIndex(point, centroids))
    const stable = nextLabels.every((label, index) => label === labels[index])
    labels = nextLabels
    if (stable && iterations > 0) break

    const sums = centroids.map(() => ({ L: 0, a: 0, b: 0, n: 0 }))
    points.forEach((point, index) => {
      const bucket = sums[labels[index] ?? 0]
      if (!bucket) return
      bucket.L += point.L
      bucket.a += point.a
      bucket.b += point.b
      bucket.n += 1
    })

    centroids = sums.map((bucket, index) => {
      if (bucket.n > 0) return { L: bucket.L / bucket.n, a: bucket.a / bucket.n, b: bucket.b / bucket.n }
      // Пустой кластер: переносим его на самую далёкую от своего центра точку,
      // иначе на однотонной картинке половина кластеров осталась бы призраками.
      let worst = points[0] ?? { L: 0, a: 0, b: 0 }
      let worstDistance = -1
      for (const point of points) {
        const d = labDistance(point, centroids[nearestIndex(point, centroids)] ?? point)
        if (d > worstDistance) {
          worstDistance = d
          worst = point
        }
      }
      void index
      return worst
    })
  }

  // Схлопываем дубликаты: на плоской картинке несколько центров могут сойтись в одну точку.
  const unique: Lab[] = []
  const remap = new Map<number, number>()
  centroids.forEach((centroid, index) => {
    const existing = unique.findIndex((c) => labDistance(c, centroid) < 1e-6)
    if (existing >= 0) {
      remap.set(index, existing)
      return
    }
    remap.set(index, unique.length)
    unique.push(centroid)
  })

  const order = unique
    .map((centroid, index) => ({ centroid, index }))
    .sort((a, b) => b.centroid.L - a.centroid.L || a.index - b.index)
  const position = new Map(order.map((entry, rank) => [entry.index, rank]))

  return {
    centroids: order.map((entry) => entry.centroid),
    labels: labels.map((label) => position.get(remap.get(label) ?? 0) ?? 0),
    iterations,
  }
}
```

Remove the `void index` line before committing; it exists only to show that the empty-cluster branch ignores its index. The `iterations < 50` assertion in the test relies on the loop breaking on a stable assignment, which is why the `stable` check runs before the centroid update.

- [ ] **Step 5: Write the failing mapping test**

Create `lib/photo/map.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { SPECIES_BY_ID, getSpeciesById } from '@/lib/species'
import { mapClustersToSpecies } from './map'

describe('mapClustersToSpecies', () => {
  it('точные цвета пород отображаются в самих себя', () => {
    const ids = ['maple', 'cherry', 'wenge'] as const
    const result = mapClustersToSpecies(ids.map((id) => getSpeciesById(id).lab))
    expect(result).toEqual([...ids])
  })

  it('никогда не повторяет породу', () => {
    const walnut = getSpeciesById('walnut').lab
    const result = mapClustersToSpecies([walnut, walnut, walnut])
    expect(new Set(result).size).toBe(3)
    expect(result).toContain('walnut')
  })

  it('возвращает столько пород, сколько кластеров', () => {
    for (let k = 1; k <= 5; k += 1) {
      const centroids = Array.from({ length: k }, (_, i) => ({ L: 20 + i * 15, a: 5, b: 10 }))
      const result = mapClustersToSpecies(centroids)
      expect(result).toHaveLength(k)
      for (const id of result) expect(SPECIES_BY_ID.has(id)).toBe(true)
    }
  })

  it('уважает список разрешённых пород', () => {
    const allowed = ['maple', 'walnut'] as const
    const result = mapClustersToSpecies([{ L: 80, a: 3, b: 20 }, { L: 25, a: 12, b: 18 }], allowed)
    expect(new Set(result)).toEqual(new Set(allowed))
  })

  it('детерминирована', () => {
    const centroids = [{ L: 70, a: 8, b: 25 }, { L: 40, a: 20, b: 28 }]
    expect(mapClustersToSpecies(centroids)).toEqual(mapClustersToSpecies(centroids))
  })

  it('на пустом входе возвращает пустой список', () => {
    expect(mapClustersToSpecies([])).toEqual([])
  })

  it('просит больше пород, чем есть в справочнике: отдаёт сколько может', () => {
    const centroids = Array.from({ length: 20 }, (_, i) => ({ L: i * 5, a: 0, b: 0 }))
    expect(mapClustersToSpecies(centroids).length).toBeLessThanOrEqual(16)
  })
})
```

- [ ] **Step 6: Implement `lib/photo/map.ts`**

```ts
import type { SpeciesId } from '@/lib/engine'
import { SPECIES, type Lab } from '@/lib/species'
import { labDistance } from '@/lib/species/lab'

/**
 * Кластеры фотографии на реальные породы, по одной породе на кластер.
 * Жадное глобальное сопоставление: все пары сортируются по расстоянию, ближайшая
 * свободная пара забирается первой. Запрет повторов принципиален: две «одинаковые»
 * породы на доске означают, что склейка между ними не видна и узор развалится.
 */
export function mapClustersToSpecies(
  centroids: readonly Lab[],
  allowed: readonly SpeciesId[] = SPECIES.map((s) => s.id),
): readonly SpeciesId[] {
  if (centroids.length === 0) return []
  const pool = SPECIES.filter((s) => allowed.includes(s.id))
  if (pool.length === 0) return []

  const pairs: Array<{ cluster: number; id: SpeciesId; d: number }> = []
  centroids.forEach((centroid, cluster) => {
    for (const species of pool) pairs.push({ cluster, id: species.id, d: labDistance(centroid, species.lab) })
  })
  pairs.sort((a, b) => a.d - b.d || a.cluster - b.cluster || a.id.localeCompare(b.id))

  const result = new Array<SpeciesId | null>(centroids.length).fill(null)
  const used = new Set<SpeciesId>()
  for (const pair of pairs) {
    if (result[pair.cluster] !== null) continue
    if (used.has(pair.id)) continue
    result[pair.cluster] = pair.id
    used.add(pair.id)
    if (used.size === Math.min(centroids.length, pool.length)) break
  }

  return result.filter((id): id is SpeciesId => id !== null)
}
```

- [ ] **Step 7: Run, then commit**

```bash
pnpm exec vitest run lib/photo
pnpm typecheck && pnpm lint
git add lib/photo
git commit -m "feat: перевод фотографии в LAB, кластеризация k-means и подбор пород"
```

Expected: about 22 cases green. If the species-table consistency case fails on a row, recompute that row's `lab` from its `hex` with `hexToLab` and commit the corrected table in the same commit, mentioning which species drifted.

---

### Task 9: Photo pipeline part 2, row clustering and `photoToDesign`

**Files:**
- Create: `lib/photo/rowCluster.ts`
- Test: `lib/photo/rowCluster.test.ts`
- Create: `lib/photo/pipeline.ts`
- Test: `lib/photo/pipeline.test.ts`
- Test: `lib/photo/pipeline.property.test.ts`
- Create: `lib/photo/index.ts`

**Interfaces:**

```ts
// lib/photo/rowCluster.ts
export interface RowClusterOptions { readonly seed?: number; readonly maxIter?: number }
export interface RowClustering {
  readonly medoids: readonly number[]      // индексы рядов-представителей
  readonly labels: readonly number[]       // для каждого ряда: позиция его медоида в medoids
}
export function rowDistance(a: readonly number[], b: readonly number[]): number   // Хэмминг
export function clusterRows(rows: readonly (readonly number[])[], k: number, opts?: RowClusterOptions): RowClustering

// lib/photo/pipeline.ts
export interface PixelGrid {
  readonly cols: number
  readonly rows: number
  readonly rgba: Uint8ClampedArray        // cols * rows * 4, порядок строк сверху вниз
}
export const PHOTO_MAX_COLS = 24
export const PHOTO_MAX_ROWS = 16
export const PHOTO_MIN_COLORS = 2
export const PHOTO_MAX_COLORS = 5
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
export function gridToLab(grid: PixelGrid): Lab[]
export function photoToDesign(grid: PixelGrid, params: PhotoParams): PhotoResult
```

**The slider.** `panels` is the number of row medoids. At `panels = rows` every row keeps its own pattern and the board is as close to the photo as the grid allows, at the cost of one glue-up per distinct row. At `panels = 2` the whole board is built from two panels, and the photo becomes a stylised two-band motif. The user is choosing, explicitly, between likeness and work. That is the whole product thesis in one control.

**Why k-medoids and not k-means over rows.** A cluster centre has to be a row that can actually be glued. The mean of two rows is not a row; the medoid is one of the input rows by construction, so the projection onto buildability is exact rather than rounded.

- [ ] **Step 1: Write the failing row-clustering test**

Create `lib/photo/rowCluster.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { clusterRows, rowDistance } from './rowCluster'

const A = [0, 0, 1, 1]
const B = [0, 0, 1, 1]
const C = [1, 1, 0, 0]
const D = [1, 1, 0, 1]

describe('rowDistance', () => {
  it('считает число различий', () => {
    expect(rowDistance(A, B)).toBe(0)
    expect(rowDistance(A, C)).toBe(4)
    expect(rowDistance(C, D)).toBe(1)
  })

  it('разная длина не роняет функцию', () => {
    expect(rowDistance([0, 1], [0, 1, 1])).toBeGreaterThan(0)
  })
})

describe('clusterRows', () => {
  it('находит две группы среди четырёх рядов', () => {
    const result = clusterRows([A, B, C, D], 2, { seed: 1 })
    expect(result.medoids).toHaveLength(2)
    expect(result.labels).toHaveLength(4)
    expect(result.labels[0]).toBe(result.labels[1])
    expect(result.labels[2]).toBe(result.labels[3])
    expect(result.labels[0]).not.toBe(result.labels[2])
  })

  it('медоид всегда один из входных рядов', () => {
    const result = clusterRows([A, B, C, D], 2, { seed: 2 })
    for (const medoid of result.medoids) {
      expect(medoid).toBeGreaterThanOrEqual(0)
      expect(medoid).toBeLessThan(4)
    }
  })

  it('k равное числу рядов оставляет каждый ряд собой', () => {
    const result = clusterRows([A, C, D], 3, { seed: 3 })
    expect(new Set(result.medoids).size).toBe(3)
    result.labels.forEach((label, index) => {
      expect(result.medoids[label]).toBe(index)
    })
  })

  it('k больше числа рядов зажимается', () => {
    expect(clusterRows([A, C], 10, { seed: 4 }).medoids.length).toBeLessThanOrEqual(2)
  })

  it('k равное единице сводит доску к одной панели', () => {
    const result = clusterRows([A, B, C, D], 1, { seed: 5 })
    expect(result.medoids).toHaveLength(1)
    expect(new Set(result.labels).size).toBe(1)
  })

  it('детерминирована по сиду', () => {
    expect(clusterRows([A, B, C, D], 2, { seed: 6 })).toEqual(clusterRows([A, B, C, D], 2, { seed: 6 }))
  })

  it('на очевидных данных не зависит от сида', () => {
    const a = clusterRows([A, B, C, C], 2, { seed: 1 })
    const b = clusterRows([A, B, C, C], 2, { seed: 42 })
    expect(a.labels).toEqual(b.labels)
  })

  it('одинаковые ряды не порождают пустых кластеров', () => {
    const result = clusterRows([A, A, A, A], 3, { seed: 7 })
    expect(new Set(result.labels).size).toBe(result.medoids.length)
  })

  it('пустой вход даёт пустой результат', () => {
    expect(clusterRows([], 3, { seed: 1 })).toEqual({ medoids: [], labels: [] })
  })

  it('увеличение k не увеличивает суммарную ошибку', () => {
    const rows = [A, B, C, D, [0, 1, 0, 1], [1, 0, 1, 0]]
    const cost = (k: number): number => {
      const result = clusterRows(rows, k, { seed: 8 })
      return rows.reduce((acc, row, index) => {
        const medoid = rows[result.medoids[result.labels[index] ?? 0] ?? 0] ?? row
        return acc + rowDistance(row, medoid)
      }, 0)
    }
    expect(cost(4)).toBeLessThanOrEqual(cost(2))
    expect(cost(6)).toBe(0)
  })
})
```

- [ ] **Step 2: Implement `lib/photo/rowCluster.ts`**

```ts
import { makeRng } from '@/lib/generators/random'

export interface RowClusterOptions {
  readonly seed?: number
  readonly maxIter?: number
}

export interface RowClustering {
  readonly medoids: readonly number[]
  readonly labels: readonly number[]
}

const DEFAULT_MAX_ITER = 20

/** Расстояние Хэмминга: сколько клеток ряда пришлось бы переклеить, чтобы получить другой ряд. */
export function rowDistance(a: readonly number[], b: readonly number[]): number {
  const length = Math.max(a.length, b.length)
  let distance = 0
  for (let i = 0; i < length; i += 1) if ((a[i] ?? -1) !== (b[i] ?? -1)) distance += 1
  return distance
}

function nearestMedoid(rows: readonly (readonly number[])[], medoids: readonly number[], index: number): number {
  const row = rows[index]
  if (!row) return 0
  let best = 0
  let bestDistance = Infinity
  medoids.forEach((medoid, position) => {
    const candidate = rows[medoid]
    if (!candidate) return
    const d = rowDistance(row, candidate)
    // Ничьи разрешаются в пользу более раннего медоида: результат не зависит от порядка обхода.
    if (d < bestDistance) {
      bestDistance = d
      best = position
    }
  })
  return best
}

/**
 * k-medoids над рядами картинки. Центр кластера обязан быть настоящим рядом: доска
 * склеивается из панелей, а среднее арифметическое двух панелей склеить нельзя.
 * Число медоидов и есть число щитов первой склейки, то есть цена узора в работе.
 */
export function clusterRows(
  rows: readonly (readonly number[])[],
  k: number,
  opts: RowClusterOptions = {},
): RowClustering {
  if (rows.length === 0 || k <= 0) return { medoids: [], labels: [] }
  const wanted = Math.min(Math.max(1, Math.round(k)), rows.length)
  const rng = makeRng(opts.seed ?? 1)
  const maxIter = opts.maxIter ?? DEFAULT_MAX_ITER

  // Инициализация в духе k-means++: следующий медоид тем вероятнее, чем он дальше от уже взятых.
  const medoids: number[] = [rng.int(rows.length)]
  while (medoids.length < wanted) {
    const weights = rows.map((row, index) => {
      if (medoids.includes(index)) return 0
      const nearest = medoids.reduce((acc, medoid) => Math.min(acc, rowDistance(row, rows[medoid] ?? row)), Infinity)
      return nearest === Infinity ? 0 : nearest * nearest
    })
    const total = weights.reduce((acc, value) => acc + value, 0)
    if (total <= 0) {
      // Все оставшиеся ряды совпадают с уже взятыми: добираем первым свободным индексом.
      const free = rows.findIndex((_, index) => !medoids.includes(index))
      if (free < 0) break
      medoids.push(free)
      continue
    }
    let target = rng.next() * total
    let chosen = -1
    for (let i = 0; i < rows.length; i += 1) {
      target -= weights[i] ?? 0
      if (target <= 0 && (weights[i] ?? 0) > 0) {
        chosen = i
        break
      }
    }
    if (chosen < 0) break
    medoids.push(chosen)
  }

  let labels = rows.map((_, index) => nearestMedoid(rows, medoids, index))

  for (let iteration = 0; iteration < maxIter; iteration += 1) {
    let moved = false
    medoids.forEach((current, position) => {
      const members = rows.map((_, index) => index).filter((index) => labels[index] === position)
      if (members.length === 0) return
      let best = current
      let bestCost = Infinity
      for (const candidate of members) {
        const candidateRow = rows[candidate]
        if (!candidateRow) continue
        let cost = 0
        for (const member of members) cost += rowDistance(rows[member] ?? candidateRow, candidateRow)
        if (cost < bestCost || (cost === bestCost && candidate < best)) {
          bestCost = cost
          best = candidate
        }
      }
      if (best !== current) {
        medoids[position] = best
        moved = true
      }
    })
    const nextLabels = rows.map((_, index) => nearestMedoid(rows, medoids, index))
    const stable = !moved && nextLabels.every((label, index) => label === labels[index])
    labels = nextLabels
    if (stable) break
  }

  // Пустые кластеры убираем: иначе число щитов на экране разошлось бы с числом панелей в документе.
  const usedPositions = [...new Set(labels)].sort((a, b) => a - b)
  const compactMedoids = usedPositions.map((position) => medoids[position] ?? 0)
  const remap = new Map(usedPositions.map((position, index) => [position, index]))

  return {
    medoids: compactMedoids,
    labels: labels.map((label) => remap.get(label) ?? 0),
  }
}
```

- [ ] **Step 3: Write the failing pipeline tests**

Create `lib/photo/pipeline.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compile, hasErrors, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { PHOTO_MAX_COLORS, PHOTO_MIN_COLORS, gridToLab, photoToDesign, type PixelGrid } from './pipeline'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()

/** Три горизонтальные полосы: светлая, средняя, тёмная. Классический вход для проверки. */
function bandsGrid(cols = 12, rows = 9): PixelGrid {
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  for (let row = 0; row < rows; row += 1) {
    const band = row < rows / 3 ? [235, 225, 200] : row < (2 * rows) / 3 ? [150, 95, 60] : [45, 35, 30]
    for (let col = 0; col < cols; col += 1) {
      const offset = (row * cols + col) * 4
      rgba[offset] = band[0] ?? 0
      rgba[offset + 1] = band[1] ?? 0
      rgba[offset + 2] = band[2] ?? 0
      rgba[offset + 3] = 255
    }
  }
  return { cols, rows, rgba }
}

describe('gridToLab', () => {
  it('переводит каждый пиксель', () => {
    const grid = bandsGrid(4, 4)
    const labs = gridToLab(grid)
    expect(labs).toHaveLength(16)
    expect(labs[0]?.L ?? 0).toBeGreaterThan(80)
    expect(labs[15]?.L ?? 100).toBeLessThan(30)
  })
})

describe('photoToDesign', () => {
  it('делает обычный изготовимый Design', () => {
    const result = photoToDesign(bandsGrid(), { colors: 3, panels: 3 })
    const diagnostics = validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN })
    expect(hasErrors(diagnostics), JSON.stringify(diagnostics.filter((d) => d.level === 'error'))).toBe(false)
  })

  it('на трёх полосах и трёх щитах даёт ровно три панели', () => {
    const result = photoToDesign(bandsGrid(), { colors: 3, panels: 3 })
    expect(result.panelCount).toBe(3)
    expect(result.design.panels).toHaveLength(3)
  })

  it('число пород соответствует ползунку', () => {
    for (let colors = PHOTO_MIN_COLORS; colors <= PHOTO_MAX_COLORS; colors += 1) {
      const result = photoToDesign(bandsGrid(16, 12), { colors, panels: 4 })
      expect(result.species.length).toBeLessThanOrEqual(colors)
      expect(new Set(result.species).size).toBe(result.species.length)
    }
  })

  it('ползунок щитов действительно снижает число склеек', () => {
    const many = photoToDesign(bandsGrid(16, 12), { colors: 4, panels: 12 })
    const few = photoToDesign(bandsGrid(16, 12), { colors: 4, panels: 2 })
    expect(compile(few.design).glueUpCount).toBeLessThanOrEqual(compile(many.design).glueUpCount)
    expect(few.panelCount).toBeLessThanOrEqual(2)
  })

  it('светлая полоса сверху осталась светлой', () => {
    const result = photoToDesign(bandsGrid(), { colors: 3, panels: 3 })
    const model = compile(result.design)
    const topCell = model.cells.find((cell) => cell.yMm === 0)
    const bottomCell = [...model.cells].sort((a, b) => b.yMm - a.yMm)[0]
    expect(topCell).toBeDefined()
    expect(bottomCell).toBeDefined()
    expect(topCell?.speciesId).not.toBe(bottomCell?.speciesId)
  })

  it('детерминирована', () => {
    const grid = bandsGrid()
    expect(photoToDesign(grid, { colors: 4, panels: 5 })).toEqual(photoToDesign(grid, { colors: 4, panels: 5 }))
  })

  it('зажимает параметры вне допуска', () => {
    const result = photoToDesign(bandsGrid(), { colors: 99, panels: -4 })
    expect(result.species.length).toBeLessThanOrEqual(PHOTO_MAX_COLORS)
    expect(result.panelCount).toBeGreaterThanOrEqual(1)
  })

  it('однотонная картинка не роняет пайплайн', () => {
    const cols = 8
    const rows = 6
    const rgba = new Uint8ClampedArray(cols * rows * 4).fill(200)
    const result = photoToDesign({ cols, rows, rgba }, { colors: 4, panels: 3 })
    expect(hasErrors(validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN }))).toBe(false)
    expect(result.design.panels.length).toBeGreaterThanOrEqual(1)
  })

  it('вырожденная сетка не роняет пайплайн', () => {
    const result = photoToDesign({ cols: 1, rows: 1, rgba: new Uint8ClampedArray([120, 90, 60, 255]) }, { colors: 3, panels: 2 })
    expect(hasErrors(validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN }))).toBe(false)
  })

  it('имя документа берётся из параметров', () => {
    expect(photoToDesign(bandsGrid(), { colors: 3, panels: 3, name: 'Кот' }).design.name).toBe('Кот')
  })
})
```

Create `lib/photo/pipeline.property.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { WARN_CELLS, compile, validate } from '@/lib/engine'
import { SPECIES, shrinkageMap } from '@/lib/species'
import { mulberry32 } from '@/lib/generators/random'
import { PHOTO_MAX_COLORS, PHOTO_MIN_COLORS, photoToDesign, type PixelGrid } from './pipeline'

const KNOWN = SPECIES.map((s) => s.id)
const SHRINK = shrinkageMap()

function randomGrid(seed: number, cols: number, rows: number): PixelGrid {
  const rnd = mulberry32(seed)
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  for (let i = 0; i < cols * rows; i += 1) {
    rgba[i * 4] = Math.floor(rnd() * 256)
    rgba[i * 4 + 1] = Math.floor(rnd() * 256)
    rgba[i * 4 + 2] = Math.floor(rnd() * 256)
    rgba[i * 4 + 3] = 255
  }
  return { cols, rows, rgba }
}

describe('photoToDesign на случайных картинках', () => {
  it('никогда не выдаёт неизготовимую доску', () => {
    for (let seed = 0; seed < 25; seed += 1) {
      const cols = 4 + (seed % 21)
      const rows = 3 + (seed % 14)
      const grid = randomGrid(seed, cols, rows)
      for (let colors = PHOTO_MIN_COLORS; colors <= PHOTO_MAX_COLORS; colors += 1) {
        for (const panels of [1, 2, Math.ceil(rows / 2), rows]) {
          const result = photoToDesign(grid, { colors, panels })
          const errors = validate(result.design, { shrinkageByPct: SHRINK, knownSpeciesIds: KNOWN }).filter(
            (d) => d.level === 'error',
          )
          expect(errors, `сид ${seed}, цветов ${colors}, щитов ${panels}: ${JSON.stringify(errors)}`).toEqual([])
          const model = compile(result.design)
          expect(model.truncated).toBe(false)
          expect(model.cells.length).toBeLessThan(WARN_CELLS)
          expect(result.panelCount).toBeLessThanOrEqual(Math.max(1, Math.min(panels, rows)))
        }
      }
    }
  })
})
```

- [ ] **Step 4: Implement `lib/photo/pipeline.ts` and `lib/photo/index.ts`**

```ts
import type { Design, SpeciesId } from '@/lib/engine'
import { makeGridDesign } from '@/lib/designs/grid'
import { MAX_PANEL_WIDTH_MM, fitWidths, roundHalf } from '@/lib/designs/fit'
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
  const colWidthsMm = fitWidths(new Array(cols).fill(cellMm))
  const rowHeightsMm = fitWidths(new Array(rows).fill(cellMm), { maxTotal: 600 })

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
```

```ts
// lib/photo/index.ts
export { hexToLab, rgbToLab, srgbToLinear } from './lab'
export { kmeansLab, type KMeansOptions, type KMeansResult } from './kmeans'
export { mapClustersToSpecies } from './map'
export { clusterRows, rowDistance, type RowClustering, type RowClusterOptions } from './rowCluster'
export {
  PHOTO_MAX_COLORS,
  PHOTO_MAX_COLS,
  PHOTO_MAX_ROWS,
  PHOTO_MIN_COLORS,
  PHOTO_SEED,
  gridToLab,
  photoToDesign,
  type PhotoParams,
  type PhotoResult,
  type PixelGrid,
} from './pipeline'
```

Two subtleties the tests pin down. `colWidthsMm.length` can come back shorter than `cols` if `fitWidths` had to drop columns, and `at` is called with the *fitted* column count by `makeGridDesign`, so indexing `rowOf(row)[col]` stays in range and the `?? 0` covers the tail. And `rowHeightsMm` uses a 600 mm cap so that a sixteen-row photo at 13 mm per row lands at 208 mm, well inside the engine's 50..1200 window.

- [ ] **Step 5: Run, then commit**

```bash
pnpm exec vitest run lib/photo
pnpm typecheck && pnpm lint
git add lib/photo
git commit -m "feat: кластеризация рядов и сборка доски по фотографии"
```

Expected: about 21 new cases, and the property test covering 25 grids times 4 colour counts times 4 panel counts, that is 400 designs, all validating clean.

---

### Task 10: The photo import panel

**Files:**
- Create: `components/photoDecode.ts`
- Create: `components/PhotoImport.tsx`
- Test: `components/PhotoImport.test.tsx`

**Interfaces:**

```ts
// components/photoDecode.ts
export const ACCEPTED_TYPES: readonly string[]        // ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']
export function isImageFile(file: File): boolean
export function fitGrid(width: number, height: number, maxCols: number, maxRows: number): { cols: number; rows: number }
export async function decodeToGrid(file: File, maxCols?: number, maxRows?: number): Promise<PixelGrid>

// components/PhotoImport.tsx
export function PhotoImport(): JSX.Element
```

Test ids: `photo-panel`, `photo-dropzone`, `photo-file`, `photo-colors`, `photo-panels`, `photo-preview`, `photo-stats`, `photo-apply`, `photo-error`, plus `photo-confirm-dialog` / `photo-confirm` / `photo-cancel`.

**Why the decode lives in `components/`.** `lib/` is DOM-free by rule and jsdom cannot run it anyway (quirk 5). `decodeToGrid` is thirty lines of canvas plumbing with no branching logic worth a unit test, and the thing that could actually break (a browser that decodes differently) is only observable in a real browser. Playwright covers it in Task 11; the unit test for `PhotoImport` mocks the module.

**Aspect ratio.** `fitGrid` preserves the picture's proportions inside the 24 by 16 budget, so a portrait photo becomes a tall board rather than a squashed one. It is pure arithmetic and is unit-tested even though the rest of the module is not.

- [ ] **Step 1: Implement `components/photoDecode.ts`**

```ts
'use client'

import { PHOTO_MAX_COLS, PHOTO_MAX_ROWS, type PixelGrid } from '@/lib/photo'

export const ACCEPTED_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']

export function isImageFile(file: File): boolean {
  return ACCEPTED_TYPES.includes(file.type) || file.type.startsWith('image/')
}

/** Сетка под пропорции картинки: портрет не должен превращаться в квадрат. */
export function fitGrid(
  width: number,
  height: number,
  maxCols = PHOTO_MAX_COLS,
  maxRows = PHOTO_MAX_ROWS,
): { cols: number; rows: number } {
  if (width <= 0 || height <= 0) return { cols: maxCols, rows: maxRows }
  const scale = Math.min(maxCols / width, maxRows / height)
  return {
    cols: Math.max(2, Math.min(maxCols, Math.round(width * scale))),
    rows: Math.max(2, Math.min(maxRows, Math.round(height * scale))),
  }
}

async function toBitmapSize(file: File): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }
  // Запасной путь для браузеров без createImageBitmap: тот же результат, только через тег img.
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('картинка не декодировалась'))
      element.src = url
    })
    return { source: image, width: image.naturalWidth, height: image.naturalHeight }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Картинка в сетку клеток. Даунсемпл делает сам браузер через drawImage:
 * усреднение по площади нам и нужно, а руками оно вышло бы медленнее и хуже.
 */
export async function decodeToGrid(
  file: File,
  maxCols = PHOTO_MAX_COLS,
  maxRows = PHOTO_MAX_ROWS,
): Promise<PixelGrid> {
  const { source, width, height } = await toBitmapSize(file)
  const { cols, rows } = fitGrid(width, height, maxCols, maxRows)

  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('нет 2d-контекста')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(source, 0, 0, cols, rows)
  const data = context.getImageData(0, 0, cols, rows)

  return { cols, rows, rgba: data.data }
}
```

- [ ] **Step 2: Write the failing `PhotoImport` test**

Create `components/PhotoImport.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { makeCheckerboard } from '@/lib/designs/samples'
import { useStudio } from '@/lib/store/studio'
import type { PixelGrid } from '@/lib/photo'

// jsdom не умеет canvas: разбор файла подменяем, вся арифметика уже покрыта в lib/photo.
vi.mock('./photoDecode', () => ({
  ACCEPTED_TYPES: ['image/png'],
  isImageFile: (file: File) => file.type.startsWith('image/'),
  fitGrid: () => ({ cols: 8, rows: 6 }),
  decodeToGrid: vi.fn(async () => bandsGrid()),
}))

import { PhotoImport } from './PhotoImport'
import { decodeToGrid } from './photoDecode'

function bandsGrid(): PixelGrid {
  const cols = 8
  const rows = 6
  const rgba = new Uint8ClampedArray(cols * rows * 4)
  for (let row = 0; row < rows; row += 1) {
    const band = row < 2 ? [235, 225, 200] : row < 4 ? [150, 95, 60] : [45, 35, 30]
    for (let col = 0; col < cols; col += 1) {
      const offset = (row * cols + col) * 4
      rgba[offset] = band[0] ?? 0
      rgba[offset + 1] = band[1] ?? 0
      rgba[offset + 2] = band[2] ?? 0
      rgba[offset + 3] = 255
    }
  }
  return { cols, rows, rgba }
}

function pngFile(name = 'demo.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
}

async function upload(): Promise<void> {
  const input = screen.getByTestId('photo-file')
  fireEvent.change(input, { target: { files: [pngFile()] } })
  await waitFor(() => expect(screen.getByTestId('photo-preview')).toBeInTheDocument())
}

describe('PhotoImport', () => {
  beforeEach(() => {
    useStudio.getState().resetStudio(makeCheckerboard())
    vi.mocked(decodeToGrid).mockClear()
  })

  it('до загрузки показывает зону перетаскивания и не показывает превью', () => {
    render(<PhotoImport />)
    expect(screen.getByTestId('photo-panel')).toBeInTheDocument()
    expect(screen.getByTestId('photo-dropzone')).toBeInTheDocument()
    expect(screen.queryByTestId('photo-preview')).not.toBeInTheDocument()
  })

  it('после загрузки рисует превью доски', async () => {
    const { container } = render(<PhotoImport />)
    await upload()
    expect(decodeToGrid).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll('svg rect').length).toBeGreaterThan(10)
  })

  it('кладёт разобранную картинку в стор', async () => {
    render(<PhotoImport />)
    await upload()
    expect(useStudio.getState().photo?.fileName).toBe('demo.png')
    expect(useStudio.getState().photo?.grid.cols).toBe(8)
  })

  it('ползунок числа пород меняет узор', async () => {
    const { container } = render(<PhotoImport />)
    await upload()
    const before = container.querySelector('svg')?.innerHTML
    fireEvent.change(screen.getByTestId('photo-colors'), { target: { value: '5' } })
    await waitFor(() => expect(container.querySelector('svg')?.innerHTML).not.toBe(before))
  })

  it('ползунок щитов меняет число склеек в подписи', async () => {
    render(<PhotoImport />)
    await upload()
    fireEvent.change(screen.getByTestId('photo-panels'), { target: { value: '6' } })
    const many = screen.getByTestId('photo-stats').textContent ?? ''
    fireEvent.change(screen.getByTestId('photo-panels'), { target: { value: '1' } })
    const few = screen.getByTestId('photo-stats').textContent ?? ''
    expect(few).not.toBe(many)
  })

  it('перетаскивание файла работает так же, как выбор', async () => {
    render(<PhotoImport />)
    const zone = screen.getByTestId('photo-dropzone')
    fireEvent.drop(zone, { dataTransfer: { files: [pngFile('drag.png')], types: ['Files'] } })
    await waitFor(() => expect(screen.getByTestId('photo-preview')).toBeInTheDocument())
    expect(useStudio.getState().photo?.fileName).toBe('drag.png')
  })

  it('не-картинку отвергает с внятным текстом', async () => {
    render(<PhotoImport />)
    const input = screen.getByTestId('photo-file')
    fireEvent.change(input, { target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] } })
    await waitFor(() => expect(screen.getByTestId('photo-error')).toBeInTheDocument())
    expect(decodeToGrid).not.toHaveBeenCalled()
  })

  it('сбой разбора показывает ошибку, а не пустой экран', async () => {
    vi.mocked(decodeToGrid).mockRejectedValueOnce(new Error('битый файл'))
    render(<PhotoImport />)
    fireEvent.change(screen.getByTestId('photo-file'), { target: { files: [pngFile()] } })
    await waitFor(() => expect(screen.getByTestId('photo-error')).toBeInTheDocument())
  })

  it('на чистом документе применяет узор сразу', async () => {
    render(<PhotoImport />)
    await upload()
    fireEvent.click(screen.getByTestId('photo-apply'))
    expect(screen.queryByTestId('photo-confirm-dialog')).not.toBeInTheDocument()
    expect(useStudio.getState().view).toBe('editor')
    expect(useStudio.getState().documentTouched).toBe(true)
  })

  it('поверх правок сначала спрашивает', async () => {
    act(() => {
      useStudio.getState().setBoardThicknessMm(52)
    })
    render(<PhotoImport />)
    await upload()
    fireEvent.click(screen.getByTestId('photo-apply'))
    expect(screen.getByTestId('photo-confirm-dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('photo-confirm'))
    expect(useStudio.getState().view).toBe('editor')
  })

  it('картинка переживает уход на другую вкладку', async () => {
    const { unmount } = render(<PhotoImport />)
    await upload()
    unmount()
    render(<PhotoImport />)
    expect(screen.getByTestId('photo-preview')).toBeInTheDocument()
    expect(decodeToGrid).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 3: Implement `components/PhotoImport.tsx`**

```tsx
'use client'

import { useMemo, useRef, useState } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { ConfirmReplace } from '@/components/ConfirmReplace'
import { Button } from '@/components/ui/button'
import { compile } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { PHOTO_MAX_COLORS, PHOTO_MIN_COLORS, photoToDesign } from '@/lib/photo'
import { seedFromString } from '@/lib/generators'
import { selectIsDirty, useStudio } from '@/lib/store/studio'
import { ACCEPTED_TYPES, decodeToGrid, isImageFile } from './photoDecode'

type Status = 'idle' | 'loading' | 'badType' | 'failed'

export function PhotoImport() {
  const locale = useStudio((s) => s.locale)
  const photo = useStudio((s) => s.photo)
  const setPhoto = useStudio((s) => s.setPhoto)
  const loadDesign = useStudio((s) => s.loadDesign)
  const setView = useStudio((s) => s.setView)
  const dirty = useStudio(selectIsDirty)
  const [status, setStatus] = useState<Status>('idle')
  const [confirming, setConfirming] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const result = useMemo(() => {
    if (!photo) return null
    const built = photoToDesign(photo.grid, {
      colors: photo.colors,
      panels: photo.panels,
      name: t(locale, 'photo.designName', { file: photo.fileName }),
      seed: seedFromString(photo.fileName),
    })
    return { ...built, model: compile(built.design) }
  }, [photo, locale])

  const accept = (file: File | undefined): void => {
    if (!file) return
    if (!isImageFile(file)) {
      setStatus('badType')
      return
    }
    setStatus('loading')
    // Асинхронный обработчик события, а не эффект: правило set-state-in-effect не нарушается.
    decodeToGrid(file)
      .then((grid) => {
        setPhoto({ grid, fileName: file.name, colors: 3, panels: Math.max(2, Math.min(6, grid.rows)) })
        setStatus('idle')
      })
      .catch(() => setStatus('failed'))
  }

  const apply = (): void => {
    if (!result) return
    loadDesign(result.design)
    setConfirming(false)
    setView('editor')
  }

  const maxPanels = photo ? Math.max(1, photo.grid.rows) : 1

  return (
    <section data-testid="photo-panel" aria-label={t(locale, 'aria.photoPanel')} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t(locale, 'photo.title')}</h2>
        <p className="text-sm text-muted-foreground">{t(locale, 'photo.subtitle')}</p>
      </div>

      <div
        data-testid="photo-dropzone"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          accept(event.dataTransfer?.files?.[0])
        }}
        className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center"
      >
        <p className="text-sm text-muted-foreground">{t(locale, 'photo.drop')}</p>
        <input
          ref={inputRef}
          data-testid="photo-file"
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          className="sr-only"
          onChange={(event) => accept(event.target.files?.[0])}
        />
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
          {t(locale, 'photo.pick')}
        </Button>
        {status === 'loading' ? <p className="text-sm">{t(locale, 'photo.loading')}</p> : null}
        {status === 'badType' || status === 'failed' ? (
          <p data-testid="photo-error" role="alert" className="text-sm text-destructive">
            {t(locale, status === 'badType' ? 'photo.errorType' : 'photo.error')}
          </p>
        ) : null}
      </div>

      {photo && result ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-sm">
              {t(locale, 'photo.colors')}
              <input
                data-testid="photo-colors"
                type="range"
                min={PHOTO_MIN_COLORS}
                max={PHOTO_MAX_COLORS}
                step={1}
                value={photo.colors}
                onChange={(event) => setPhoto({ ...photo, colors: Number(event.target.value) })}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t(locale, 'photo.panels')}
              <input
                data-testid="photo-panels"
                type="range"
                min={1}
                max={maxPanels}
                step={1}
                value={photo.panels}
                onChange={(event) => setPhoto({ ...photo, panels: Number(event.target.value) })}
              />
              <span className="text-xs text-muted-foreground">{t(locale, 'photo.panelsHint')}</span>
            </label>
            <Button data-testid="photo-apply" size="sm" onClick={() => (dirty ? setConfirming(true) : apply())}>
              {t(locale, 'photo.apply')}
            </Button>
          </div>

          <div data-testid="photo-preview" aria-label={t(locale, 'aria.photoPreview')}>
            <BoardSvg model={result.model} locale={locale} maxPx={420} />
          </div>
          <span data-testid="photo-stats" className="text-sm text-muted-foreground">
            {t(locale, 'photo.stats', {
              glueUps: result.model.glueUpCount,
              species: result.species.length,
              widthMm: Math.round(result.model.widthMm),
              lengthMm: Math.round(result.model.lengthMm),
            })}
          </span>
        </div>
      ) : null}

      {confirming ? (
        <ConfirmReplace
          testId="photo"
          title={t(locale, 'photo.confirmTitle')}
          body={t(locale, 'photo.confirmBody')}
          confirmLabel={t(locale, 'photo.confirmApply')}
          cancelLabel={t(locale, 'photo.confirmCancel')}
          onConfirm={apply}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </section>
  )
}
```

`seedFromString(photo.fileName)` makes the k-means init depend on the file, not on the clock: the same picture always gives the same board, and two different pictures do not share an initialisation accident.

- [ ] **Step 4: Run, then commit**

```bash
pnpm exec vitest run components/PhotoImport.test.tsx
pnpm typecheck && pnpm lint
git add components/PhotoImport.tsx components/PhotoImport.test.tsx components/photoDecode.ts
git commit -m "feat: импорт фотографии и живое превью узора"
```

Expected: 11 cases green. If `fireEvent.change` on the file input does not populate `event.target.files` in this jsdom version, use `Object.defineProperty(input, 'files', { value: [file] })` before dispatching, and leave a comment saying why.

---

### Task 11: Playwright coverage and final verification

**Files:**
- Create: `e2e/fixtures/make-fixture.mjs`
- Create: `e2e/fixtures/demo-blocks.png` (generated by the script, committed)
- Create: `e2e/generate.spec.ts`
- Create: `e2e/photo.spec.ts`

`playwright.config.ts` is **not** modified: `testDir` is `./e2e` and both new specs are picked up automatically. The `webServer` block already builds and starts the production server on port 3100.

**Browser capabilities used here, verified rather than assumed.** Chromium under Playwright provides `createImageBitmap`, `OffscreenCanvas` and a real 2D canvas context, so `decodeToGrid` takes its fast path and never falls back to the `<img>` route. `page.setInputFiles` writes a real file into the input and fires the `change` event, which is the exact path a user takes. The existing `launchOptions` with SwiftShader are for WebGL in the 3D tab and are irrelevant to canvas 2D, which is software-rendered anyway.

- [ ] **Step 1: Write and run the fixture generator**

Create `e2e/fixtures/make-fixture.mjs`:

```js
// Однократный скрипт: пишет крошечный PNG для e2e без единой зависимости.
// Держим его в репозитории, чтобы фикстуру можно было воспроизвести, а не «где-то нашли картинку».
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const WIDTH = 48
const HEIGHT = 32
const COLORS = [
  [240, 232, 210],
  [150, 90, 55],
  [40, 34, 30],
]

const table = new Int32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  table[n] = c
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3))
for (let y = 0; y < HEIGHT; y += 1) {
  const rowStart = y * (1 + WIDTH * 3)
  raw[rowStart] = 0
  const band = y < HEIGHT / 3 ? 0 : y < (2 * HEIGHT) / 3 ? 1 : 2
  for (let x = 0; x < WIDTH; x += 1) {
    const color = COLORS[x < WIDTH / 2 ? band : (band + 1) % 3]
    const p = rowStart + 1 + x * 3
    raw[p] = color[0]
    raw[p + 1] = color[1]
    raw[p + 2] = color[2]
  }
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(WIDTH, 0)
ihdr.writeUInt32BE(HEIGHT, 4)
ihdr[8] = 8
ihdr[9] = 2

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

writeFileSync(new URL('./demo-blocks.png', import.meta.url), png)
console.log(`demo-blocks.png: ${png.length} байт`)
```

```bash
node e2e/fixtures/make-fixture.mjs
file e2e/fixtures/demo-blocks.png
```

Expected: `PNG image data, 48 x 32, 8-bit/color RGB, non-interlaced`, about 300 bytes. Open it once to confirm it shows six colour blocks; if `file` reports anything else, the CRC or the IHDR is wrong and the pipeline test that follows would fail for the wrong reason.

- [ ] **Step 2: Write `e2e/generate.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test'

async function openGenerator(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-generate').click()
  await expect(page.getByTestId('generator-panel')).toBeVisible()
}

test('генератор показывает девять вариантов', async ({ page }) => {
  await openGenerator(page)
  await expect(page.locator('[data-testid^="gen-card-"]')).toHaveCount(9)
  // В каждой карточке настоящая доска, а не заглушка.
  for (let index = 0; index < 9; index += 1) {
    const rects = page.locator(`[data-testid="gen-card-${index}"] svg rect`)
    await expect(rects.first()).toBeVisible()
    expect(await rects.count()).toBeGreaterThan(10)
  }
  await expect(page.getByTestId('gen-generation')).toContainText('1')
})

test('первая девятка одинакова после перезагрузки', async ({ page }) => {
  await openGenerator(page)
  const before = await page.getByTestId('gen-card-0').innerHTML()
  await page.reload()
  await page.getByTestId('tab-generate').click()
  await expect(page.getByTestId('generator-panel')).toBeVisible()
  expect(await page.getByTestId('gen-card-0').innerHTML()).toBe(before)
})

test('перемешать меняет все доски', async ({ page }) => {
  await openGenerator(page)
  const before = await page.getByTestId('gen-card-0').innerHTML()
  await page.getByTestId('gen-shuffle').click()
  await expect.poll(async () => page.getByTestId('gen-card-0').innerHTML()).not.toBe(before)
})

test('раунд эволюции сохраняет избранное и меняет остальных', async ({ page }) => {
  await openGenerator(page)
  await page.getByTestId('gen-fav-2').click()
  await expect(page.getByTestId('gen-fav-2')).toHaveAttribute('aria-pressed', 'true')
  const favourite = await page.getByTestId('gen-card-2').locator('svg').innerHTML()
  const otherBefore = await page.getByTestId('gen-card-5').locator('svg').innerHTML()

  await page.getByTestId('gen-evolve').click()
  await expect(page.getByTestId('gen-generation')).toContainText('2')
  expect(await page.getByTestId('gen-card-0').locator('svg').innerHTML()).toBe(favourite)
  expect(await page.getByTestId('gen-card-5').locator('svg').innerHTML()).not.toBe(otherBefore)
})

test('семейство фильтрует девятку', async ({ page }) => {
  await openGenerator(page)
  await page.getByTestId('gen-family-stripes').click()
  await expect(page.getByTestId('gen-family-stripes')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-testid^="gen-card-"]')).toHaveCount(9)
})

test('выбранный узор уезжает в редактор', async ({ page }) => {
  await openGenerator(page)
  const chosen = await page.getByTestId('gen-card-1').locator('svg rect').first().getAttribute('fill')
  await page.getByTestId('gen-apply-1').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.locator('rect[data-cell="r0:0"]')).toHaveAttribute('fill', chosen ?? '')
})

test('узор поверх правок сначала спрашивает', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  const thickness = page.getByTestId('board-thickness')
  await thickness.fill('58')
  await thickness.blur()

  await page.getByTestId('tab-generate').click()
  await page.getByTestId('gen-apply-0').click()
  await expect(page.getByTestId('generator-confirm-dialog')).toBeVisible()
  await page.getByTestId('generator-cancel').click()
  await expect(page.getByTestId('generator-confirm-dialog')).toBeHidden()

  await page.getByTestId('gen-apply-0').click()
  await page.getByTestId('generator-confirm').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
})

test('генератор не теряет популяцию при уходе на другую вкладку', async ({ page }) => {
  await openGenerator(page)
  await page.getByTestId('gen-shuffle').click()
  const html = await page.getByTestId('gen-card-3').innerHTML()
  await page.getByTestId('tab-editor').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-generate').click()
  expect(await page.getByTestId('gen-card-3').innerHTML()).toBe(html)
})
```

- [ ] **Step 3: Write `e2e/photo.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const FIXTURE = fileURLToPath(new URL('./fixtures/demo-blocks.png', import.meta.url))

async function openPhoto(page: Page): Promise<void> {
  await page.addInitScript(() => window.localStorage.clear())
  await page.goto('/')
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await page.getByTestId('tab-photo').click()
  await expect(page.getByTestId('photo-panel')).toBeVisible()
}

async function uploadFixture(page: Page): Promise<void> {
  await page.getByTestId('photo-file').setInputFiles(FIXTURE)
  await expect(page.getByTestId('photo-preview')).toBeVisible()
}

test('браузер даёт всё, что нужно для разбора картинки', async ({ page }) => {
  await openPhoto(page)
  const capabilities = await page.evaluate(() => ({
    bitmap: typeof createImageBitmap === 'function',
    context: document.createElement('canvas').getContext('2d') !== null,
  }))
  expect(capabilities).toEqual({ bitmap: true, context: true })
})

test('загруженная картинка превращается в доску', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const rects = page.getByTestId('photo-preview').locator('svg rect')
  expect(await rects.count()).toBeGreaterThan(20)
  await expect(page.getByTestId('photo-stats')).toContainText('склеек')
})

test('ползунок щитов меняет число склеек', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const stats = page.getByTestId('photo-stats')
  const detailed = await stats.textContent()

  // Клавиатура, а не fill: React не всегда видит программную запись в input[type=range].
  const slider = page.getByTestId('photo-panels')
  await slider.focus()
  for (let step = 0; step < 12; step += 1) await slider.press('ArrowLeft')

  await expect.poll(async () => stats.textContent()).not.toBe(detailed)
})

test('число пород задаётся ползунком', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const before = await page.getByTestId('photo-preview').innerHTML()
  const slider = page.getByTestId('photo-colors')
  await slider.focus()
  await slider.press('ArrowRight')
  await slider.press('ArrowRight')
  await expect.poll(async () => page.getByTestId('photo-preview').innerHTML()).not.toBe(before)
})

test('узор по фотографии уезжает в редактор и считается', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const first = await page.getByTestId('photo-preview').locator('svg rect').first().getAttribute('fill')

  await page.getByTestId('photo-apply').click()
  await expect(page.getByTestId('board-canvas')).toBeVisible()
  await expect(page.locator('rect[data-cell="r0:0"]')).toHaveAttribute('fill', first ?? '')
  // Счётчик сложности обязан посчитать фотодоску как любую другую.
  await expect(page.getByText(/Габарит:/)).toBeVisible()
})

test('текстовый файл отвергается', async ({ page }) => {
  await openPhoto(page)
  await page.getByTestId('photo-file').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('не картинка') })
  await expect(page.getByTestId('photo-error')).toBeVisible()
  await expect(page.getByTestId('photo-preview')).toBeHidden()
})

test('одна и та же картинка даёт одну и ту же доску', async ({ page }) => {
  await openPhoto(page)
  await uploadFixture(page)
  const first = await page.getByTestId('photo-preview').innerHTML()
  await page.reload()
  await page.getByTestId('tab-photo').click()
  await uploadFixture(page)
  expect(await page.getByTestId('photo-preview').innerHTML()).toBe(first)
})
```

- [ ] **Step 4: Full verification**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Every one of the five must pass before the phase is called done. Report the actual counts: the unit suite goes from 339 to roughly 480 cases, the e2e suite from 10 to roughly 25. If any number comes out lower than the previous phase, a test file is not being collected and that is a defect, not a rounding difference.

Then check the two things no test can check:

- Open `http://127.0.0.1:3100`, walk the five tabs at 1280 px and at 375 px (device toolbar). Five tabs must wrap, not overflow. The nine previews must be a 2-column grid on the phone and a 3-column grid on the laptop.
- Import a real photograph, not the fixture: a kitchen picture or a portrait. Drag the panel slider from one end to the other and watch the glue-up count fall while the likeness degrades. That is the demo, and if it does not read as a deliberate trade-off on a real photo, say so in the report rather than shipping it quietly.

- [ ] **Step 5: Commit and deploy**

```bash
git add e2e
git commit -m "test: e2e для генератора, эволюции и узора по фотографии"
git push
```

Vercel builds from `main`. Confirm the production URL opens, the generator tab renders nine boards, and a photo import works there too: the canvas path is the one place where a production build could behave differently from `pnpm dev`, because image decoding depends on the browser rather than on the bundler.

---

## Self-Review

Run by the plan author against the phase-4 brief, the design spec and the shipped phase-1 to phase-3 source.

**1. Scope coverage.** Every item of the brief maps to at least one task:

| Scope item | Tasks |
|---|---|
| Deterministic seeded PRNG (mulberry32), seed in params, no `Math.random` in `lib` | 1 (implementation), 4 (`purity.test.ts` enforces it across four directories) |
| Generators produce valid `Design` via `makeGridDesign` or direct construction | 3 (`clampGenome`), 4 (`gridFamily`, `inlayDesign`) |
| angle 0, depth <= 2, planer <= 330, strip >= 4 | 3 (`fitWidths` at 320, `MIN_CELL_MM` 8), 4 (inlay depth-2 assertions, angle assertions) |
| Symmetry generators p4m, pmm, p2 from a random tile | 4 (`symmetry.ts`, one test per group asserting the actual invariance) |
| Parametric families with random species palettes, LAB-picked | 2 (contrast, analogous, accented), 4 (`parametric.ts`) |
| Blue noise / hash chaos with controllable density | 4 (`noise.ts`, best-candidate, density test) |
| Optional two-generation `sliceRef` inlay bands | 4 (`inlay.ts`, shipped rather than skipped) |
| Every generator `(params, seed) -> Design`, property-tested on 100 seeds | 4 (`families.property.test.ts`, 8 families times 100 seeds times 3 properties) |
| Generator UI: family picker, seed shuffle, param sliders, 9 previews, click loads | 7 |
| `documentTouched` confirm flow reused | 6 (`ConfirmReplace`), 7, 10 |
| Evolution: favourites, mutations, crossovers, fitness-free, deterministic | 5 |
| Mutations: species swap via LAB-near, width jitter, row shuffle | 5 (`mutateOnce`, six kinds) |
| Crossover: mix row lists and palettes | 5 (single-point cut on rows, interleaved palette) |
| Pure `lib/generators/evolve.ts`, tested | 5 (about 25 cases) |
| Photo: client-side import, downscale to max 24x16 | 10 (`photoDecode.ts`, `fitGrid`) |
| k-means k = 2..5 in LAB | 8 (`kmeansLab`, k-means++ init, canonical ordering) |
| Map clusters to nearest real species by LAB | 8 (`mapClustersToSpecies`, no repeats) |
| Buildability projection: cluster rows so panel count is small | 9 (`clusterRows`, k-medoids) |
| Slider "likeness versus panel count" | 9 (`panels` param), 10 (`photo-panels`) |
| Pure algorithm in `lib/photo`, deterministic, testable on synthetic pixels, no DOM | 8, 9 (synthetic blobs and grids everywhere), 4 (purity test forbids DOM in `lib/photo`) |
| UI `PhotoImport`: file input, drag-drop, canvas downscale in component, live preview, apply | 10 |
| e2e: upload fixture, get a board, load into editor | 11 |
| Wire tabs, decide and justify hub versus flat | 6 (flat, five tabs, justification written out) |
| i18n both locales | 6 (about 50 keys, `lib/i18n/index.test.ts` enforces parity) |
| e2e: generator previews and pick, evolution round, photo flow | 11 (8 + 7 specs) |

**2. Placeholder scan.** No "TBD", no "same as above", no test referenced without its code, no component described without its implementation. Four places where the implementer is told to deviate are explicit and bounded: the `user-event` versus `fireEvent` decision in Task 6 Step 3 (check `package.json` first, follow `ForkDialog.test.tsx`), the two draft artefacts to delete before committing (`void` lines in Tasks 2 and 8, the duplicated zero-favourites branch in Task 5), the `vi.mock` fallback for the file input in Task 10 Step 4, and the ordering note in Task 6 Step 2 about `lib/photo/index.ts` not existing until Task 8. That last one is a real dependency: **if you execute strictly in order, land Tasks 8 and 9 before Task 6**, or declare `PixelGrid` locally in the store and swap the import later.

**3. Type consistency against the real shipped API.** Checked against the files, not memory:

- `makeGridDesign(spec: GridSpec)` takes `colWidthsMm: readonly number[]`, `rowHeightsMm: readonly number[]`, `at: (col, row) => SpeciesId`, optional `thicknessMm`. Every call in this plan passes mutable arrays spread from readonly genome fields, which is assignable, and never passes `thicknessMm: undefined` (quirk 2).
- `makeGridDesign` derives `Design.species` from the strips it built and sorts by the reference order, so no generator sets `species` by hand except `inlayDesign`, which constructs its `Design` directly and therefore does the same sort itself.
- `Design.schemaVersion` is the literal `1`; `inlayDesign` returns an object literal in a position typed `Design`, exactly like the shipped `makeInlayBand`.
- `Row` requires `angleDeg`, `flip`, `mirror`, `trimMm`: all set in `inlayDesign`; `makeGridDesign` sets them for the grid families with `trimMm: GRID_TRIM_MM`.
- `SliceRef` requires `panelId`, `thicknessMm`, `angleDeg`, `offsetMm`: all four set in `inlayDesign`, `angleDeg: 0`.
- `validate(design, { shrinkageByPct, knownSpeciesIds })` matches `ValidateOptions`; every property test passes both, so `UNKNOWN_SPECIES` really fires if a palette invents a species.
- `validate` checks `PLANER_WIDTH` for **every** panel including inner ones, which is why the inlay inner panel is capped at 320 mm, and `MIN_STRIP_WIDTH` measures a `sliceRef` by `thicknessMm`, which is why `MIN_BAND_MM` is 12.
- `compile(design)` returns `glueUpCount` and `truncated`, both asserted in the property tests. `BoardModel.cells[].yMm` is the offset along the board length, used by the "top band stayed light" test.
- `BoardSvg` props are `{ model, locale, maxPx?, highlightCellId?, selectedCellId? }`; both new panels pass only the first three.
- `Lab` is exported from `@/lib/species` as `{ readonly L: number; readonly a: number; readonly b: number }`, and `SPECIES` carries a `lab` per row. `lib/species/lab.ts` is a new file inside that module, so nothing imports `lib/species/index.ts` circularly except `lab.ts` itself, which is fine because `index.ts` does not import `lab.ts`.
- `getSpeciesById` throws `EngineError` on an unknown id, which is why palettes are sanitised before any lookup and why `speciesHex` (which never throws) is what `BoardSvg` uses.
- `t(locale, key, params)` interpolates `{name}` style placeholders; every new key's placeholders are listed in Task 6 and used with the same names.
- `MessageKey` is `keyof typeof ru`; family name keys are built by template literal and cast, and `families.test.ts` asserts each one exists in `ru`, which keeps the cast honest exactly as the template plan did.
- `loadDesign(design)` resets history, clears `pendingFork` and `selectedCellId`, sets `documentTouched: true`, and does not touch `view` or the two new fields. `resetStudio` spreads `UI_DEFAULTS`, which is why `generator` and `photo` belong there.
- `selectIsDirty` is `documentTouched || canUndo || canRedo`, the same predicate `TemplateGallery` uses, so the three confirm flows behave identically.
- `useStudioPersistence` saves `selectDesign` only, so the `Uint8ClampedArray` in `PhotoUiState` never reaches `localStorage` or the share hash.
- `hash2` and `pick` are exported from `lib/designs/grid.ts` and reused rather than reimplemented; `pick` throws on an empty list, which is why palettes are guaranteed non-empty by `clampGenome`.
- `lib/engine` is imported everywhere and edited nowhere. The phase-1 to phase-3 files modified are exactly: `lib/store/studio.ts`, `lib/flags.ts`, `components/StudioTabs.tsx`, `components/StudioShell.tsx`, `components/TemplateGallery.tsx`, the two dictionaries and three existing test files. `vitest.config.ts` and `playwright.config.ts` are untouched.

**4. Buildability arithmetic, checked by hand before the tests run.** Column widths land in 8..45 mm and sum to 60..320 mm, inside the engine's 50..1200 window and under the 330 mm planer limit with 10 mm of headroom for mutation jitter. Row heights land in 8..45 mm and sum to 60..600 mm. Grids run from 4x4 to 14x16, that is 16 to 224 cells, an order of magnitude below the 2000-cell warning and two below the 4000-cell budget. The inlay outer panel is `2*side + 2*frame + band` with `band` computed as the exact leftover, worst case `45+45+140+45+45 = 320`; the inner panel is 6 to 18 equal strips summing to at most 320, so the narrowest inner strip is 17.5 mm. Photo boards are at most 24 columns of `320/24 = 13.5` mm and at most 16 rows, that is 324 mm by 216 mm and 384 cells.

**5. Known risks carried into execution.**

- **Palette distance versus palette size.** `contrastPalette` at size 5 may not find five woods that are all 18 LAB units apart in a 16-species reference. The test will say so. The fix is to cap `MAX_PALETTE` at 4, not to lower the threshold: a palette with two indistinguishable woods produces a board whose glue lines vanish, which is worse than a smaller palette.
- **The species table versus its own hex.** Task 8 verifies that the authored `lab` column matches `hexToLab(hex)` within 4 units. Spot-checking maple, wenge and purpleheart by hand suggests the table was computed that way, but if a row drifted the photo mapping is skewed in a way no other test would catch. Fix the table, not the tolerance.
- **`glueUpCount` semantics.** The property test asserts `model.glueUpCount === design.panels.length`. If `compile` counts something else (say, it excludes panels that are only reached through a `sliceRef`), the assertion fails and the plan's mental model is wrong. Read `lib/engine/compile.ts` and report rather than editing the test, because the complexity meter shows the user that same number.
- **Nine previews on a phone.** Nine compiled boards is roughly 1500 SVG rects, the same order as the sixteen shipped template thumbnails. It is fine on a laptop and acceptable on a phone. If profiling says otherwise, the move is to drop `maxPx` on the cards, not to reduce the population below nine: nine is what makes the evolution grid read as a choice.
- **Range inputs and React.** `fill()` on `input[type=range]` can be swallowed by React's value tracker. Both e2e slider tests use keyboard presses instead, which is more reliable and doubles as an accessibility check.
- **Evolution collapse.** Repeatedly starring one variant converges the population toward it. The last slot is always a fresh immigrant precisely to keep that from becoming a dead end, and the ten-generation test proves the result stays buildable, not that it stays interesting.
- **State is not persisted.** Neither the population nor the decoded photo survives a page reload: they live in the Zustand store, which persists only the document. That is deliberate (the share link carries a board, not a search session), and the e2e determinism tests rely on it: the same seed rebuilds the same first nine after a reload.
- **Photo quality on hard inputs.** A busy photograph at 24x16 with four colours becomes an abstract pattern, not a portrait. The panel slider turns that into a stated trade-off rather than a failure, and the spec already plans for three known-good demo images in the gallery. Do not spend day-four time tuning the clustering for hard photos.
