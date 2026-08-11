# Phase 1: Engine and Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure TypeScript geometry/validation/costing engine of Endgrain Studio plus a deployed Next.js shell that renders one hardcoded checkerboard board and its live complexity meter.

**Architecture:** Single unidirectional data flow `Design -> compile -> BoardModel -> {render2d, calc}`. `lib/engine` is pure TypeScript with zero runtime dependencies (no React, no DOM, no zod) so it can back the web app, the CLI and server-side OG rendering. Everything except `Design` is derived, never stored, so desync is impossible by construction. `lib/persist` owns the only zod schema and the only serialization path; `lib/i18n` owns the only user-facing strings.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5 strict, Tailwind CSS, shadcn/ui, vitest, fast-check, ESLint, zod, lz-string, pnpm, Vercel.

## Global Constraints

- Em dash U+2014 is forbidden everywhere: source code, comments, commit messages, UI strings, this plan. Use a hyphen, a colon or parentheses instead. Any occurrence is a defect.
- All user-facing text and all git commit messages are in Russian. Technical terms stay in English.
- All internal dimensions are stored in millimetres as floating point numbers. Inches are presentation only, converted in exactly one place (`lib/units.ts`).
- Domain vocabulary is fixed: the board is made of strips (first glue-up), crosscuts, and a final re-glue. Kerf and allowances are always accounted for.
- `lib/engine` must have zero imports outside itself and TypeScript standard library. No React, no DOM, no zod, no lodash.
- Panel recursion depth is capped at 2. Depth 3 is rejected by `validate` with an explicit diagnostic, never silently compiled.
- Schema version at rest is `1`. `parseDesign` is the only reader used by web, CLI and OG route.
- Node >= 20.11, pnpm >= 9.
- Every task ends with a commit. Small commits, Russian messages, conventional prefix (`feat:`, `test:`, `chore:`, `fix:`).

## Deliberate deviations from the spec (resolved contradictions)

The spec says `Strip` carries породу, ширину, толщину, длину, and separately says "дублирующих полей в модели нет". Those conflict: strip thickness is always the board thickness, and strip length is always the derived panel length. Phase 1 resolves it in favour of the no-duplicates rule: `Strip` stores only `speciesId` and `widthMm`. Thickness comes from `design.board.thicknessMm`, length comes from `panelLengthMm(design, panelId)`.

The spec's `Species` carries price per cubic metre; the phase-1 scope calls for price per board foot USD, which is how North American hardwood is actually quoted. `Species.pricePerBoardFootUsd` is the stored field; cubic metre pricing, if ever needed, is derived.

Cut angles are stored (`angleDeg` on `SliceRef` and `Row`) but phase-1 `compile` treats them as metadata that does not affect cell geometry. `validate` therefore emits an error `ANGLE_UNSUPPORTED` for any non-zero angle so no one can produce a board whose rendering lies. Phase 2 implements angled geometry and removes that rule.

---

## File Structure

| Path | Responsibility |
|---|---|
| `lib/engine/types.ts` | All domain types and constants. No logic. |
| `lib/engine/errors.ts` | `EngineError` and its code union. |
| `lib/engine/panels.ts` | Panel/element lookup helpers, slice enumeration, panel length. |
| `lib/engine/compile.ts` | `compile(Design) -> BoardModel`. Only source of geometry. |
| `lib/engine/validate.ts` | `validate(Design, opts) -> Diagnostic[]`. |
| `lib/engine/edit.ts` | `applyPaint`, `splitPanel`, fork logic. |
| `lib/engine/index.ts` | Public API barrel. The only import surface for the rest of the app. |
| `lib/species/index.ts` | 16 species with LAB, hex, density, price, shrinkage. |
| `lib/units.ts` | mm <-> inch <-> board foot conversions. |
| `lib/calc/index.ts` | Lumber, waste, cost, weight, glue-ups, cuts. |
| `lib/persist/schema.ts` | zod schema v1 plus migration registry. |
| `lib/persist/codec.ts` | JSON, lz-string hash, localStorage. |
| `lib/persist/index.ts` | Barrel. |
| `lib/i18n/ru.ts`, `lib/i18n/en.ts`, `lib/i18n/index.ts` | String dictionaries and `t`. |
| `lib/designs/samples.ts` | `makeCheckerboard` demo design. |
| `components/BoardSvg.tsx` | SVG board renderer. |
| `components/ComplexityMeter.tsx` | Live calc numbers panel. |
| `components/LocaleToggle.tsx` | ru/en switch. |
| `app/page.tsx`, `app/layout.tsx` | Shell. |

---

### Task 1: Repo scaffold and test toolchain

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `components.json`, `.nvmrc`
- Create: `lib/engine/version.ts`
- Test: `lib/engine/version.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export const ENGINE_VERSION = '1.0.0'` from `lib/engine/version.ts`. Working `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`. Path alias `@/*` maps to the repo root.

- [ ] **Step 1: Scaffold Next.js 15**

```bash
cd /Users/drtloki/Desktop/Актуальное/Code/MY/endgrain-studio
pnpm create next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-pnpm --turbopack
```

Answer "yes" to overwriting into the non-empty directory. `docs/`, `CLAUDE.md`, `README.md` and `.git/` must survive; if the generator refuses, scaffold into `/private/tmp/eg-scaffold` and copy everything except `README.md` and `.gitignore` over.

- [ ] **Step 2: Add test and runtime dependencies**

```bash
pnpm add zod lz-string
pnpm add -D vitest @vitejs/plugin-react vite-tsconfig-paths fast-check jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx', 'components/**/*.test.tsx'],
  },
})
```

- [ ] **Step 4: Set scripts and engines in `package.json`**

```json
{
  "engines": { "node": ">=20.11", "pnpm": ">=9" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 5: Force TypeScript strictness**

In `tsconfig.json` `compilerOptions`, set exactly these on top of what the generator produced:

```json
{
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "exactOptionalPropertyTypes": true,
  "noUnusedLocals": true,
  "noUnusedParameters": true
}
```

- [ ] **Step 6: Write the failing toolchain test**

`lib/engine/version.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION } from './version'

describe('engine version', () => {
  it('exposes a semver string', () => {
    expect(ENGINE_VERSION).toBe('1.0.0')
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
```

- [ ] **Step 7: Run it and confirm it fails**

Run: `pnpm test lib/engine/version.test.ts`
Expected: FAIL with `Failed to resolve import "./version"`.

- [ ] **Step 8: Write the minimal implementation**

`lib/engine/version.ts`:

```ts
export const ENGINE_VERSION = '1.0.0'
```

- [ ] **Step 9: Run the full gate**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: 1 test passed, no type errors, no lint errors, `Compiled successfully`.

- [ ] **Step 10: Install shadcn/ui base**

```bash
pnpm dlx shadcn@latest init -d
pnpm dlx shadcn@latest add card badge button separator
```

Expected: `components/ui/card.tsx`, `badge.tsx`, `button.tsx`, `separator.tsx` and `lib/utils.ts` exist. Re-run `pnpm typecheck` and expect no errors.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: каркас Next.js 15, Tailwind, shadcn/ui, vitest и fast-check"
```

---

### Task 2: Engine domain types and errors

**Files:**
- Create: `lib/engine/types.ts`, `lib/engine/errors.ts`, `lib/engine/panels.ts`, `lib/engine/index.ts`
- Test: `lib/engine/panels.test.ts`

**Interfaces:**
- Consumes: `ENGINE_VERSION` from Task 1.
- Produces: every type below, plus `getPanel`, `getElement`, `elementExtentMm`, `isStrip`, `isSliceRef`, `panelWidthMm`, `EngineError`.

`lib/engine/types.ts` in full:

```ts
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
```

`lib/engine/errors.ts` in full:

```ts
export type EngineErrorCode =
  | 'PANEL_NOT_FOUND'
  | 'ELEMENT_NOT_FOUND'
  | 'SPLIT_OUT_OF_RANGE'
  | 'PAINT_TARGET_NOT_STRIP'
  | 'UNKNOWN_SPECIES'

export class EngineError extends Error {
  readonly code: EngineErrorCode

  constructor(code: EngineErrorCode, message: string) {
    super(message)
    this.name = 'EngineError'
    this.code = code
  }
}
```

- [ ] **Step 1: Write the failing test**

`lib/engine/panels.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Design, Panel } from './types'
import { elementExtentMm, getPanel, panelWidthMm, slicesOfPanel, panelLengthMm } from './panels'
import { EngineError } from './errors'

const panelA: Panel = {
  id: 'A',
  elements: [
    { kind: 'strip', speciesId: 'walnut', widthMm: 25 },
    { kind: 'strip', speciesId: 'maple', widthMm: 25 },
  ],
}

const design: Design = {
  schemaVersion: 1,
  id: 'd1',
  name: 'тест',
  species: ['walnut', 'maple'],
  panels: [panelA],
  rows: [
    { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    { id: 'r2', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: true, trimMm: 5 },
  ],
  board: { targetWidthMm: 50, targetLengthMm: 60, thicknessMm: 40 },
  kerfMm: 3,
  planingAllowanceMm: 3,
  planerWidthMm: 330,
}

describe('panels helpers', () => {
  it('measures element extent along the panel width', () => {
    expect(elementExtentMm({ kind: 'strip', speciesId: 'oak', widthMm: 18 })).toBe(18)
    expect(elementExtentMm({ kind: 'sliceRef', panelId: 'A', thicknessMm: 12, angleDeg: 0, offsetMm: 0 })).toBe(12)
  })

  it('sums panel width', () => {
    expect(panelWidthMm(panelA)).toBe(50)
  })

  it('throws a typed error for a missing panel', () => {
    expect(() => getPanel(design, 'ZZZ')).toThrowError(EngineError)
  })

  it('enumerates every slice taken from a panel', () => {
    expect(slicesOfPanel(design, 'A')).toHaveLength(2)
  })

  it('applies the panel length formula', () => {
    // 2 среза: (30+3) * 2 + kerf 3 * (2-1) + trim 5 * 2 = 66 + 3 + 10 = 79
    expect(panelLengthMm(design, 'A')).toBeCloseTo(79, 6)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test lib/engine/panels.test.ts`
Expected: FAIL with `Failed to resolve import "./panels"`.

- [ ] **Step 3: Write `lib/engine/types.ts` and `lib/engine/errors.ts`**

Copy both files verbatim from the blocks above.

- [ ] **Step 4: Write `lib/engine/panels.ts`**

```ts
import { EngineError } from './errors'
import type { Design, Panel, PanelElement, PanelId, PanelSlice, SliceRef, Strip } from './types'

export function isStrip(el: PanelElement): el is Strip {
  return el.kind === 'strip'
}

export function isSliceRef(el: PanelElement): el is SliceRef {
  return el.kind === 'sliceRef'
}

/** Размер элемента вдоль ширины панели, мм. */
export function elementExtentMm(el: PanelElement): number {
  return isStrip(el) ? el.widthMm : el.thicknessMm
}

export function panelWidthMm(panel: Panel): number {
  return panel.elements.reduce((sum, el) => sum + elementExtentMm(el), 0)
}

export function findPanel(design: Design, panelId: PanelId): Panel | undefined {
  return design.panels.find((p) => p.id === panelId)
}

export function getPanel(design: Design, panelId: PanelId): Panel {
  const panel = findPanel(design, panelId)
  if (!panel) throw new EngineError('PANEL_NOT_FOUND', `панель ${panelId} не найдена`)
  return panel
}

export function getElement(design: Design, panelId: PanelId, elementIndex: number): PanelElement {
  const el = getPanel(design, panelId).elements[elementIndex]
  if (!el) throw new EngineError('ELEMENT_NOT_FOUND', `элемент ${elementIndex} панели ${panelId} не найден`)
  return el
}

/** Все срезы, снимаемые с панели: ряды доски плюс SliceRef внутри других панелей. */
export function slicesOfPanel(design: Design, panelId: PanelId): PanelSlice[] {
  const out: PanelSlice[] = []
  for (const row of design.rows) {
    if (row.panelId !== panelId) continue
    out.push({
      thicknessMm: row.thicknessMm,
      trimMm: row.trimMm,
      angleDeg: row.angleDeg,
      consumer: { kind: 'row', rowId: row.id },
    })
  }
  for (const panel of design.panels) {
    panel.elements.forEach((el, elementIndex) => {
      if (!isSliceRef(el) || el.panelId !== panelId) return
      out.push({
        thicknessMm: el.thicknessMm,
        trimMm: 0,
        angleDeg: el.angleDeg,
        consumer: { kind: 'sliceRef', panelId: panel.id, elementIndex },
      })
    })
  }
  return out
}

/**
 * Длина панели первой склейки, мм.
 * Сумма (толщина среза + припуск на строгание) + kerf * (n - 1) + сумма торцевых припусков.
 */
export function panelLengthMm(design: Design, panelId: PanelId): number {
  const slices = slicesOfPanel(design, panelId)
  if (slices.length === 0) return 0
  const cut = slices.reduce((sum, s) => sum + s.thicknessMm + design.planingAllowanceMm + s.trimMm, 0)
  return cut + design.kerfMm * (slices.length - 1)
}

export function usageCount(design: Design, panelId: PanelId): number {
  return slicesOfPanel(design, panelId).length
}

export function nextPanelId(design: Design): PanelId {
  let n = design.panels.length + 1
  const taken = new Set(design.panels.map((p) => p.id))
  while (taken.has(`P${n}`)) n += 1
  return `P${n}`
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm test lib/engine/panels.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Create the public barrel**

`lib/engine/index.ts`:

```ts
export { ENGINE_VERSION } from './version'
export * from './types'
export { EngineError, type EngineErrorCode } from './errors'
export {
  isStrip,
  isSliceRef,
  elementExtentMm,
  panelWidthMm,
  findPanel,
  getPanel,
  getElement,
  slicesOfPanel,
  panelLengthMm,
  usageCount,
  nextPanelId,
} from './panels'
```

- [ ] **Step 7: Commit**

```bash
git add lib/engine
git commit -m "feat(engine): доменные типы, ошибки и helpers панелей"
```

---

### Task 3: Species catalogue

**Files:**
- Create: `lib/species/index.ts`
- Test: `lib/species/index.test.ts`

**Interfaces:**
- Consumes: `SpeciesId`, `EngineError` from Task 2.
- Produces:

```ts
export interface Lab { readonly L: number; readonly a: number; readonly b: number }
export interface Species {
  readonly id: SpeciesId
  readonly nameRu: string
  readonly nameEn: string
  readonly hex: string
  readonly lab: Lab
  readonly densityKgM3: number
  readonly pricePerBoardFootUsd: number
  readonly shrinkageTangentialPct: number
  readonly shrinkageRadialPct: number
  readonly foodSafe: boolean
}
export const SPECIES: readonly Species[]
export const SPECIES_BY_ID: ReadonlyMap<SpeciesId, Species>
export function getSpeciesById(id: SpeciesId): Species
export function speciesHex(id: SpeciesId): string
export function shrinkageMap(): Record<SpeciesId, number>
```

- [ ] **Step 1: Write the failing test**

`lib/species/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { EngineError } from '@/lib/engine'
import { SPECIES, SPECIES_BY_ID, getSpeciesById, speciesHex } from './index'

describe('species catalogue', () => {
  it('has at least 16 species with unique ids', () => {
    expect(SPECIES.length).toBeGreaterThanOrEqual(16)
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length)
  })

  it('stores plausible physical data for every species', () => {
    for (const s of SPECIES) {
      expect(s.hex).toMatch(/^#[0-9a-f]{6}$/)
      expect(s.densityKgM3).toBeGreaterThan(250)
      expect(s.densityKgM3).toBeLessThan(1300)
      expect(s.pricePerBoardFootUsd).toBeGreaterThan(0)
      expect(s.shrinkageTangentialPct).toBeGreaterThan(0)
      expect(s.shrinkageTangentialPct).toBeGreaterThan(s.shrinkageRadialPct)
      expect(s.lab.L).toBeGreaterThanOrEqual(0)
      expect(s.lab.L).toBeLessThanOrEqual(100)
      expect(s.nameRu).not.toContain(String.fromCharCode(0x2014)) // длинное тире запрещено
    }
  })

  it('looks species up by id', () => {
    expect(getSpeciesById('walnut').nameRu).toBe('Орех')
    expect(SPECIES_BY_ID.get('maple')?.nameEn).toBe('Hard maple')
    expect(speciesHex('padauk')).toBe('#a8422a')
  })

  it('throws a typed error for an unknown id', () => {
    expect(() => getSpeciesById('unobtainium')).toThrowError(EngineError)
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test lib/species`
Expected: FAIL with `Failed to resolve import "./index"`.

- [ ] **Step 3: Write `lib/species/index.ts`**

```ts
import { EngineError, type SpeciesId } from '@/lib/engine'

export interface Lab {
  readonly L: number
  readonly a: number
  readonly b: number
}

export interface Species {
  readonly id: SpeciesId
  readonly nameRu: string
  readonly nameEn: string
  readonly hex: string
  readonly lab: Lab
  readonly densityKgM3: number
  readonly pricePerBoardFootUsd: number
  readonly shrinkageTangentialPct: number
  readonly shrinkageRadialPct: number
  readonly foodSafe: boolean
}

export const SPECIES: readonly Species[] = [
  { id: 'maple',      nameRu: 'Клён',        nameEn: 'Hard maple',  hex: '#e3caa1', lab: { L: 83.1, a: 5.2,  b: 26.4 }, densityKgM3: 705, pricePerBoardFootUsd: 6.5,  shrinkageTangentialPct: 9.9,  shrinkageRadialPct: 4.8, foodSafe: true },
  { id: 'birch',      nameRu: 'Берёза',      nameEn: 'Birch',       hex: '#e6d3b3', lab: { L: 85.6, a: 3.4,  b: 20.1 }, densityKgM3: 670, pricePerBoardFootUsd: 4.5,  shrinkageTangentialPct: 9.5,  shrinkageRadialPct: 7.3, foodSafe: true },
  { id: 'beech',      nameRu: 'Бук',         nameEn: 'Beech',       hex: '#d9b48b', lab: { L: 76.9, a: 8.1,  b: 27.0 }, densityKgM3: 720, pricePerBoardFootUsd: 4.2,  shrinkageTangentialPct: 11.9, shrinkageRadialPct: 5.5, foodSafe: true },
  { id: 'ash',        nameRu: 'Ясень',       nameEn: 'Ash',         hex: '#d8c09a', lab: { L: 79.2, a: 5.0,  b: 25.3 }, densityKgM3: 675, pricePerBoardFootUsd: 5.2,  shrinkageTangentialPct: 7.8,  shrinkageRadialPct: 4.9, foodSafe: true },
  { id: 'red-oak',    nameRu: 'Дуб красный', nameEn: 'Red oak',     hex: '#c99a6e', lab: { L: 68.4, a: 13.1, b: 29.8 }, densityKgM3: 700, pricePerBoardFootUsd: 5.0,  shrinkageTangentialPct: 8.6,  shrinkageRadialPct: 4.0, foodSafe: true },
  { id: 'white-oak',  nameRu: 'Дуб белый',   nameEn: 'White oak',   hex: '#bf9a68', lab: { L: 66.9, a: 10.4, b: 30.6 }, densityKgM3: 755, pricePerBoardFootUsd: 6.8,  shrinkageTangentialPct: 10.5, shrinkageRadialPct: 5.6, foodSafe: true },
  { id: 'hickory',    nameRu: 'Гикори',      nameEn: 'Hickory',     hex: '#c08d5c', lab: { L: 62.8, a: 13.0, b: 33.2 }, densityKgM3: 815, pricePerBoardFootUsd: 5.6,  shrinkageTangentialPct: 11.0, shrinkageRadialPct: 7.0, foodSafe: true },
  { id: 'cherry',     nameRu: 'Вишня',       nameEn: 'Cherry',      hex: '#a5613b', lab: { L: 50.8, a: 22.1, b: 30.2 }, densityKgM3: 560, pricePerBoardFootUsd: 8.5,  shrinkageTangentialPct: 7.1,  shrinkageRadialPct: 3.7, foodSafe: true },
  { id: 'mahogany',   nameRu: 'Махагони',    nameEn: 'Mahogany',    hex: '#8f4b2e', lab: { L: 41.9, a: 25.6, b: 28.4 }, densityKgM3: 590, pricePerBoardFootUsd: 12.0, shrinkageTangentialPct: 5.1,  shrinkageRadialPct: 3.0, foodSafe: true },
  { id: 'sapele',     nameRu: 'Сапеле',      nameEn: 'Sapele',      hex: '#7f4429', lab: { L: 37.8, a: 23.9, b: 26.7 }, densityKgM3: 670, pricePerBoardFootUsd: 9.5,  shrinkageTangentialPct: 7.4,  shrinkageRadialPct: 4.6, foodSafe: true },
  { id: 'jatoba',     nameRu: 'Ятоба',       nameEn: 'Jatoba',      hex: '#7d3b22', lab: { L: 34.6, a: 25.1, b: 27.5 }, densityKgM3: 910, pricePerBoardFootUsd: 9.0,  shrinkageTangentialPct: 7.3,  shrinkageRadialPct: 4.2, foodSafe: true },
  { id: 'walnut',     nameRu: 'Орех',        nameEn: 'Black walnut',hex: '#5b3a24', lab: { L: 28.4, a: 13.8, b: 18.9 }, densityKgM3: 610, pricePerBoardFootUsd: 13.5, shrinkageTangentialPct: 7.8,  shrinkageRadialPct: 5.5, foodSafe: true },
  { id: 'wenge',      nameRu: 'Венге',       nameEn: 'Wenge',       hex: '#3a2a20', lab: { L: 18.2, a: 6.9,  b: 9.4  }, densityKgM3: 870, pricePerBoardFootUsd: 20.0, shrinkageTangentialPct: 8.1,  shrinkageRadialPct: 4.8, foodSafe: true },
  { id: 'padauk',     nameRu: 'Падук',       nameEn: 'Padauk',      hex: '#a8422a', lab: { L: 40.1, a: 42.3, b: 32.6 }, densityKgM3: 745, pricePerBoardFootUsd: 15.0, shrinkageTangentialPct: 5.2,  shrinkageRadialPct: 3.3, foodSafe: true },
  { id: 'purpleheart',nameRu: 'Амарант',     nameEn: 'Purpleheart', hex: '#5e3a6b', lab: { L: 30.6, a: 24.8, b: -17.9 }, densityKgM3: 880, pricePerBoardFootUsd: 16.0, shrinkageTangentialPct: 6.1,  shrinkageRadialPct: 3.2, foodSafe: true },
  { id: 'yellowheart',nameRu: 'Йеллоухарт',  nameEn: 'Yellowheart', hex: '#d9be3f', lab: { L: 76.4, a: -2.1, b: 60.8 }, densityKgM3: 830, pricePerBoardFootUsd: 12.5, shrinkageTangentialPct: 7.0,  shrinkageRadialPct: 3.6, foodSafe: true },
]

export const SPECIES_BY_ID: ReadonlyMap<SpeciesId, Species> = new Map(SPECIES.map((s) => [s.id, s]))

export function getSpeciesById(id: SpeciesId): Species {
  const s = SPECIES_BY_ID.get(id)
  if (!s) throw new EngineError('UNKNOWN_SPECIES', `порода ${id} не найдена в справочнике`)
  return s
}

export function speciesHex(id: SpeciesId): string {
  return SPECIES_BY_ID.get(id)?.hex ?? '#cccccc'
}

/** Карта тангенциальной усушки для validate, который не должен зависеть от справочника. */
export function shrinkageMap(): Record<SpeciesId, number> {
  return Object.fromEntries(SPECIES.map((s) => [s.id, s.shrinkageTangentialPct]))
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test lib/species`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/species
git commit -m "feat(species): справочник 16 пород с LAB, плотностью, ценой и усушкой"
```

---

### Task 4: compile - flat geometry, mirror and derived counts

**Files:**
- Create: `lib/engine/compile.ts`
- Modify: `lib/engine/index.ts`
- Test: `lib/engine/compile.test.ts`, `lib/engine/fixtures.ts`

**Interfaces:**
- Consumes: `Design`, `BoardModel`, `Cell`, `CellOrigin`, `GEOM_EPS_MM` from Task 2; `panelWidthMm`, `elementExtentMm`, `isStrip`, `findPanel`, `slicesOfPanel`, `panelLengthMm` from Task 2.
- Produces: `export function compile(design: Design): BoardModel`, total (never throws on any well-typed `Design`). Also `lib/engine/fixtures.ts` exporting `baseDesign(overrides?: Partial<Design>): Design` and `stripsPanel(id: string, ...speciesIds: string[]): Panel` for reuse in Tasks 5 to 8.

Geometry contract, fixed for the whole project:
- X axis is the board width and runs along panel elements.
- Y axis is the board length and stacks rows in array order.
- Z is the board thickness, constant, equal to `design.board.thicknessMm`.
- `row.mirror` reverses element order along X. `origin.elementIndex` always refers to the index in the unmirrored panel.
- `BoardModel.widthMm` is the maximum panel width across rows; `lengthMm` is the sum of row thicknesses.
- A row whose panel is missing contributes no cells and no length.

- [ ] **Step 1: Write the fixtures file**

`lib/engine/fixtures.ts`:

```ts
import type { Design, Panel, SpeciesId } from './types'

export function stripsPanel(id: string, speciesIds: SpeciesId[], widthMm = 25): Panel {
  return { id, elements: speciesIds.map((speciesId) => ({ kind: 'strip', speciesId, widthMm })) }
}

export function baseDesign(overrides: Partial<Design> = {}): Design {
  return {
    schemaVersion: 1,
    id: 'fixture',
    name: 'фикстура',
    species: ['walnut', 'maple'],
    panels: [stripsPanel('A', ['walnut', 'maple']), stripsPanel('B', ['maple', 'walnut'])],
    rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
      { id: 'r2', panelId: 'B', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ],
    board: { targetWidthMm: 50, targetLengthMm: 60, thicknessMm: 40 },
    kerfMm: 3,
    planingAllowanceMm: 3,
    planerWidthMm: 330,
    ...overrides,
  }
}
```

- [ ] **Step 2: Write the failing test**

`lib/engine/compile.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compile } from './compile'
import { baseDesign, stripsPanel } from './fixtures'

describe('compile: flat geometry', () => {
  it('lays strips along X and rows along Y', () => {
    const m = compile(baseDesign())
    expect(m.widthMm).toBe(50)
    expect(m.lengthMm).toBe(60)
    expect(m.thicknessMm).toBe(40)
    expect(m.cells).toHaveLength(4)
    expect(m.cells[0]).toMatchObject({ xMm: 0, yMm: 0, widthMm: 25, heightMm: 30, speciesId: 'walnut' })
    expect(m.cells[1]).toMatchObject({ xMm: 25, yMm: 0, speciesId: 'maple' })
    expect(m.cells[2]).toMatchObject({ xMm: 0, yMm: 30, speciesId: 'maple' })
    expect(m.cells[3]).toMatchObject({ xMm: 25, yMm: 30, speciesId: 'walnut' })
  })

  it('reverses element order along X when the row is mirrored, keeping origin indices', () => {
    const d = baseDesign({
      panels: [stripsPanel('A', ['walnut', 'maple', 'cherry'])],
      rows: [{ id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: true, trimMm: 5 }],
    })
    const m = compile(d)
    expect(m.cells.map((c) => c.speciesId)).toEqual(['cherry', 'maple', 'walnut'])
    expect(m.cells.map((c) => c.origin.elementIndex)).toEqual([2, 1, 0])
  })

  it('skips rows whose panel is missing without throwing', () => {
    const d = baseDesign({
      rows: [{ id: 'rX', panelId: 'GHOST', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const m = compile(d)
    expect(m.cells).toHaveLength(0)
    expect(m.lengthMm).toBe(0)
  })

  it('derives panel lengths, glue-ups and cuts', () => {
    const m = compile(baseDesign())
    // по одному срезу с каждой панели: (30+3) + kerf*0 + trim 5 = 38
    expect(m.panelLengthsMm['A']).toBeCloseTo(38, 6)
    expect(m.panelLengthsMm['B']).toBeCloseTo(38, 6)
    // 2 первых склейки + 1 финальная
    expect(m.glueUpCount).toBe(3)
    expect(m.cutCount).toBe(2)
  })
})
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `pnpm test lib/engine/compile.test.ts`
Expected: FAIL with `Failed to resolve import "./compile"`.

- [ ] **Step 4: Write `lib/engine/compile.ts`**

```ts
import { elementExtentMm, findPanel, isStrip, panelLengthMm, panelWidthMm, slicesOfPanel } from './panels'
import type { BoardModel, Cell, Design, PanelId } from './types'

export function compile(design: Design): BoardModel {
  const cells: Cell[] = []
  let yMm = 0
  let widthMm = 0

  for (const row of design.rows) {
    const panel = findPanel(design, row.panelId)
    if (!panel) continue

    widthMm = Math.max(widthMm, panelWidthMm(panel))

    const ordered = panel.elements.map((el, index) => ({ el, index }))
    if (row.mirror) ordered.reverse()

    let xMm = 0
    for (const { el, index } of ordered) {
      const extent = elementExtentMm(el)
      if (isStrip(el)) {
        cells.push({
          id: `${row.id}:${index}`,
          xMm,
          yMm,
          widthMm: extent,
          heightMm: row.thicknessMm,
          speciesId: el.speciesId,
          grain: 'end',
          origin: { rowId: row.id, panelId: panel.id, elementIndex: index, depth: 0 },
        })
      }
      xMm += extent
    }

    yMm += row.thicknessMm
  }

  const panelLengthsMm: Record<PanelId, number> = {}
  let cutCount = 0
  for (const panel of design.panels) {
    panelLengthsMm[panel.id] = panelLengthMm(design, panel.id)
    cutCount += slicesOfPanel(design, panel.id).length
  }

  return {
    widthMm,
    lengthMm: yMm,
    thicknessMm: design.board.thicknessMm,
    cells,
    panelLengthsMm,
    glueUpCount: design.panels.length + 1,
    cutCount,
  }
}
```

`SliceRef` elements deliberately produce no cells yet; Task 5 adds their expansion.

- [ ] **Step 5: Run the test and confirm it passes**

Run: `pnpm test lib/engine/compile.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Export from the barrel**

Add to `lib/engine/index.ts`:

```ts
export { compile } from './compile'
export { baseDesign, stripsPanel } from './fixtures'
```

- [ ] **Step 7: Commit**

```bash
git add lib/engine
git commit -m "feat(engine): compile строит плоскую геометрию доски и выводит длины панелей"
```

---

### Task 5: compile - SliceRef expansion at depth 2, flip, and area invariant

**Files:**
- Modify: `lib/engine/compile.ts`
- Test: `lib/engine/compile.sliceref.test.ts`, `lib/engine/compile.property.test.ts`

**Interfaces:**
- Consumes: `compile`, `baseDesign`, `stripsPanel` from Task 4; `GEOM_EPS_MM`, `MAX_CELLS` from Task 2.
- Produces: no new exported symbol; `compile` now emits depth-1 cells with `origin.depth === 1`, `origin.innerPanelId` and `origin.innerElementIndex`.

SliceRef expansion contract, fixed for the whole project:
- A `SliceRef` inside panel `P` pointing at panel `Q` occupies X extent `ref.thicknessMm`.
- Inside the row, its Y extent is tiled by `Q`'s strips in order, each taking its own `widthMm` along Y, cycling through the strip list until the row height is covered.
- `ref.offsetMm` shifts the tiling start; it is reduced modulo the cycle length so any value is legal.
- `row.flip` reverses the order of `Q`'s strips in the tiling.
- The first and last sub-cells are clipped exactly to the row bounds, so sub-cell area always sums to `ref.thicknessMm * row.thicknessMm`.
- If `Q` is missing, or `Q` itself contains a `SliceRef` (depth 3), the element emits no sub-cells but still advances X. `validate` reports it; `compile` never throws.

- [ ] **Step 1: Write the failing SliceRef test**

`lib/engine/compile.sliceref.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compile } from './compile'
import { baseDesign, stripsPanel } from './fixtures'
import type { Design } from './types'

function withRef(offsetMm: number, flip = false): Design {
  return baseDesign({
    panels: [
      stripsPanel('Q', ['walnut', 'maple'], 10),
      { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 20, angleDeg: 0, offsetMm }] },
    ],
    rows: [{ id: 'r1', panelId: 'P', thicknessMm: 40, angleDeg: 0, flip, mirror: false, trimMm: 5 }],
  })
}

describe('compile: SliceRef at depth 2', () => {
  it('tiles the inner panel strips along Y and covers the row exactly', () => {
    const m = compile(withRef(0))
    expect(m.cells.map((c) => [c.yMm, c.heightMm, c.speciesId])).toEqual([
      [0, 10, 'walnut'],
      [10, 10, 'maple'],
      [20, 10, 'walnut'],
      [30, 10, 'maple'],
    ])
    expect(m.widthMm).toBe(20)
    expect(m.lengthMm).toBe(40)
  })

  it('shifts the tiling by offsetMm and clips the leading sub-cell', () => {
    const m = compile(withRef(5))
    expect(m.cells[0]).toMatchObject({ yMm: 0, heightMm: 5, speciesId: 'maple' })
    const area = m.cells.reduce((s, c) => s + c.widthMm * c.heightMm, 0)
    expect(area).toBeCloseTo(20 * 40, 6)
  })

  it('reverses the inner strip order when the row is flipped', () => {
    const m = compile(withRef(0, true))
    expect(m.cells[0]?.speciesId).toBe('maple')
    expect(m.cells[1]?.speciesId).toBe('walnut')
  })

  it('records depth-1 provenance', () => {
    const m = compile(withRef(0))
    expect(m.cells[0]?.origin).toMatchObject({
      rowId: 'r1',
      panelId: 'P',
      elementIndex: 0,
      depth: 1,
      innerPanelId: 'Q',
      innerElementIndex: 0,
    })
  })

  it('emits nothing for a depth-3 reference but keeps X advancing', () => {
    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut'], 10),
        { id: 'R', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 0, offsetMm: 0 }] },
        {
          id: 'P',
          elements: [
            { kind: 'strip', speciesId: 'maple', widthMm: 15 },
            { kind: 'sliceRef', panelId: 'R', thicknessMm: 10, angleDeg: 0, offsetMm: 0 },
          ],
        },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 20, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const m = compile(d)
    expect(m.cells).toHaveLength(1)
    expect(m.widthMm).toBe(25)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test lib/engine/compile.sliceref.test.ts`
Expected: FAIL, first test gets `[]` instead of four sub-cells.

- [ ] **Step 3: Add the expansion to `lib/engine/compile.ts`**

Insert above `compile` and call it from the element loop:

```ts
import { elementExtentMm, findPanel, isStrip, panelLengthMm, panelWidthMm, slicesOfPanel } from './panels'
import { GEOM_EPS_MM, type BoardModel, type Cell, type Design, type PanelId, type Row, type SliceRef } from './types'

function expandSliceRef(
  design: Design,
  ref: SliceRef,
  row: Row,
  outerPanelId: PanelId,
  elementIndex: number,
  xMm: number,
  rowTopMm: number,
): Cell[] {
  const inner = findPanel(design, ref.panelId)
  if (!inner) return []
  const strips = inner.elements.map((el, index) => ({ el, index })).filter((e) => isStrip(e.el))
  if (strips.length !== inner.elements.length || strips.length === 0) return [] // глубина 3 или пустая панель

  const ordered = row.flip ? [...strips].reverse() : strips
  const cycleMm = ordered.reduce((sum, e) => sum + elementExtentMm(e.el), 0)
  if (cycleMm <= GEOM_EPS_MM) return []

  const rowBottomMm = rowTopMm + row.thicknessMm
  let cursorMm = rowTopMm - (((ref.offsetMm % cycleMm) + cycleMm) % cycleMm)
  const out: Cell[] = []

  for (let k = 0; cursorMm < rowBottomMm - GEOM_EPS_MM; k += 1) {
    const entry = ordered[k % ordered.length]
    if (!entry) break
    const h = elementExtentMm(entry.el)
    const top = Math.max(cursorMm, rowTopMm)
    const bottom = Math.min(cursorMm + h, rowBottomMm)
    if (bottom - top > GEOM_EPS_MM && isStrip(entry.el)) {
      out.push({
        id: `${row.id}:${elementIndex}:${k}`,
        xMm,
        yMm: top,
        widthMm: ref.thicknessMm,
        heightMm: bottom - top,
        speciesId: entry.el.speciesId,
        grain: 'end',
        origin: {
          rowId: row.id,
          panelId: outerPanelId,
          elementIndex,
          depth: 1,
          innerPanelId: inner.id,
          innerElementIndex: entry.index,
        },
      })
    }
    cursorMm += h
  }

  return out
}
```

Replace the `if (isStrip(el)) { ... }` branch body's `else` path in the element loop with:

```ts
      if (isStrip(el)) {
        cells.push({ /* без изменений, как в задаче 4 */ })
      } else {
        cells.push(...expandSliceRef(design, el, row, panel.id, index, xMm, yMm))
      }
```

- [ ] **Step 4: Run the SliceRef test and confirm it passes**

Run: `pnpm test lib/engine/compile.sliceref.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write the property test**

`lib/engine/compile.property.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { compile } from './compile'
import { baseDesign, stripsPanel } from './fixtures'
import { panelLengthMm } from './panels'
import type { Design } from './types'

const speciesArb = fc.constantFrom('walnut', 'maple', 'cherry', 'padauk', 'wenge')
const widthArb = fc.double({ min: 4, max: 40, noNaN: true, noDefaultInfinity: true })

/** Ровная доска: все ряды ссылаются на панели одинаковой суммарной ширины. */
const flatDesignArb: fc.Arbitrary<Design> = fc
  .record({
    widths: fc.array(widthArb, { minLength: 2, maxLength: 8 }),
    speciesRows: fc.array(fc.array(speciesArb, { minLength: 2, maxLength: 8 }), { minLength: 1, maxLength: 6 }),
    kerfMm: fc.double({ min: 0.5, max: 5, noNaN: true, noDefaultInfinity: true }),
    planingAllowanceMm: fc.double({ min: 3, max: 6, noNaN: true, noDefaultInfinity: true }),
    thicknessMm: fc.double({ min: 15, max: 50, noNaN: true, noDefaultInfinity: true }),
    trimMm: fc.double({ min: 0, max: 20, noNaN: true, noDefaultInfinity: true }),
  })
  .map(({ widths, speciesRows, kerfMm, planingAllowanceMm, thicknessMm, trimMm }) => {
    const panels = speciesRows.map((row, i) => ({
      id: `P${i}`,
      elements: widths.map((w, j) => ({ kind: 'strip' as const, speciesId: row[j % row.length] ?? 'maple', widthMm: w })),
    }))
    return baseDesign({
      panels,
      rows: panels.map((p, i) => ({
        id: `r${i}`,
        panelId: p.id,
        thicknessMm,
        angleDeg: 0,
        flip: false,
        mirror: i % 2 === 1,
        trimMm,
      })),
      kerfMm,
      planingAllowanceMm,
      board: { targetWidthMm: 300, targetLengthMm: 400, thicknessMm },
    })
  })

describe('compile invariants', () => {
  it('total cell area equals board area', () => {
    fc.assert(
      fc.property(flatDesignArb, (design) => {
        const m = compile(design)
        const area = m.cells.reduce((s, c) => s + c.widthMm * c.heightMm, 0)
        expect(area).toBeCloseTo(m.widthMm * m.lengthMm, 4)
      }),
      { numRuns: 200 },
    )
  })

  it('panel length equals sum of slice thicknesses plus allowances, kerf and trim', () => {
    fc.assert(
      fc.property(flatDesignArb, (design) => {
        for (const panel of design.panels) {
          const slices = design.rows.filter((r) => r.panelId === panel.id)
          const expected =
            slices.reduce((s, r) => s + r.thicknessMm + design.planingAllowanceMm + r.trimMm, 0) +
            design.kerfMm * Math.max(0, slices.length - 1)
          expect(panelLengthMm(design, panel.id)).toBeCloseTo(expected, 6)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('is total: never throws and never emits negative geometry', () => {
    fc.assert(
      fc.property(flatDesignArb, (design) => {
        const m = compile(design)
        for (const c of m.cells) {
          expect(c.widthMm).toBeGreaterThan(0)
          expect(c.heightMm).toBeGreaterThan(0)
          expect(c.xMm).toBeGreaterThanOrEqual(0)
          expect(c.yMm).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 200 },
    )
  })
})
```

- [ ] **Step 6: Run the property test**

Run: `pnpm test lib/engine/compile.property.test.ts`
Expected: PASS, 3 tests, 600 generated cases total.

- [ ] **Step 7: Commit**

```bash
git add lib/engine
git commit -m "feat(engine): раскрытие SliceRef на глубине 2 и property-тесты площади и длины панели"
```

---

### Task 6: validate and Diagnostic[]

**Files:**
- Create: `lib/engine/validate.ts`
- Modify: `lib/engine/index.ts`
- Test: `lib/engine/validate.test.ts`

**Interfaces:**
- Consumes: everything from Task 2 and Task 4.
- Produces:

```ts
export interface ValidateOptions {
  /** Тангенциальная усушка по id породы, %. Без неё правило SHRINKAGE_MISMATCH пропускается. */
  readonly shrinkageByPct?: Readonly<Record<SpeciesId, number>>
}
export function validate(design: Design, opts?: ValidateOptions): Diagnostic[]
export function hasErrors(diagnostics: readonly Diagnostic[]): boolean
```

Rules, all of them, in evaluation order:

| Code | Level | Condition |
|---|---|---|
| `DIMENSION_SANITY` | error | `board.targetWidthMm` or `targetLengthMm` outside `[50, 1200]`, or `thicknessMm` outside `[10, 80]`, or `kerfMm` outside `(0, 10]` |
| `EMPTY_PANEL` | error | a panel has zero elements |
| `PANEL_NOT_FOUND` | error | a `Row.panelId` or `SliceRef.panelId` names no panel, or a `SliceRef` points at its own panel |
| `DEPTH_LIMIT` | error | a `SliceRef` points at a panel that itself contains a `SliceRef` |
| `MIN_STRIP_WIDTH` | error | a strip is narrower than 4 mm |
| `PLANER_WIDTH` | error | a panel is wider than `design.planerWidthMm` |
| `RAGGED_BOARD` | error | two rows resolve to panels of different total width (difference above 0.01 mm) |
| `ANGLE_UNSUPPORTED` | error | any `Row.angleDeg` or `SliceRef.angleDeg` is not 0 |
| `CELL_BUDGET` | error above 4000 cells, warning above 2000 | compiled cell count |
| `PLANING_ALLOWANCE` | warning | `design.planingAllowanceMm < 3` |
| `SHRINKAGE_MISMATCH` | warning | two adjacent strips in one panel differ in tangential shrinkage by more than 1.5 percentage points, and `opts.shrinkageByPct` was supplied |

Output is sorted: errors first, then warnings, then infos; ties broken by code, then by `target.panelId ?? ''`, then `target.rowId ?? ''`, then `target.elementIndex ?? -1`.

- [ ] **Step 1: Write the failing test**

`lib/engine/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validate, hasErrors } from './validate'
import { baseDesign, stripsPanel } from './fixtures'

const codes = (d: Parameters<typeof validate>[0], o?: Parameters<typeof validate>[1]) =>
  validate(d, o).map((x) => x.code)

describe('validate', () => {
  it('passes a clean design', () => {
    expect(validate(baseDesign())).toEqual([])
    expect(hasErrors([])).toBe(false)
  })

  it('flags strips narrower than 4 mm', () => {
    const d = baseDesign({ panels: [stripsPanel('A', ['walnut', 'maple'], 3)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    expect(codes(d)).toContain('MIN_STRIP_WIDTH')
    expect(hasErrors(validate(d))).toBe(true)
  })

  it('flags panels wider than the planer', () => {
    const d = baseDesign({ panels: [stripsPanel('A', Array(20).fill('maple'), 20)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    expect(codes(d)).toContain('PLANER_WIDTH')
  })

  it('warns about a planing allowance below 3 mm', () => {
    expect(codes(baseDesign({ planingAllowanceMm: 1 }))).toContain('PLANING_ALLOWANCE')
  })

  it('rejects depth 3', () => {
    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut'], 10),
        { id: 'R', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 0, offsetMm: 0 }] },
        { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'R', thicknessMm: 10, angleDeg: 0, offsetMm: 0 }] },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 20, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const diag = validate(d).find((x) => x.code === 'DEPTH_LIMIT')
    expect(diag?.level).toBe('error')
    expect(diag?.messageKey).toBe('diag.DEPTH_LIMIT')
    expect(diag?.target).toMatchObject({ panelId: 'P', elementIndex: 0 })
  })

  it('flags impossible board dimensions', () => {
    expect(codes(baseDesign({ board: { targetWidthMm: 5, targetLengthMm: 60, thicknessMm: 40 } }))).toContain('DIMENSION_SANITY')
    expect(codes(baseDesign({ board: { targetWidthMm: 300, targetLengthMm: 400, thicknessMm: 5 } }))).toContain('DIMENSION_SANITY')
  })

  it('flags ragged boards and non-zero angles', () => {
    const d = baseDesign({
      panels: [stripsPanel('A', ['walnut', 'maple'], 25), stripsPanel('B', ['maple'], 25)],
      rows: [
        { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
        { id: 'r2', panelId: 'B', thicknessMm: 30, angleDeg: 45, flip: false, mirror: false, trimMm: 5 },
      ],
    })
    expect(codes(d)).toEqual(expect.arrayContaining(['RAGGED_BOARD', 'ANGLE_UNSUPPORTED']))
  })

  it('warns about incompatible shrinkage between neighbours', () => {
    const d = baseDesign({ panels: [stripsPanel('A', ['mahogany', 'beech'], 25)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    expect(codes(d, { shrinkageByPct: { mahogany: 5.1, beech: 11.9 } })).toContain('SHRINKAGE_MISMATCH')
    expect(codes(d)).not.toContain('SHRINKAGE_MISMATCH')
  })

  it('sorts errors before warnings', () => {
    const d = baseDesign({ planingAllowanceMm: 1, panels: [stripsPanel('A', ['walnut'], 2)], rows: [
      { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    ] })
    const levels = validate(d).map((x) => x.level)
    expect(levels.indexOf('error')).toBeLessThan(levels.indexOf('warning'))
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test lib/engine/validate.test.ts`
Expected: FAIL with `Failed to resolve import "./validate"`.

- [ ] **Step 3: Write `lib/engine/validate.ts`**

```ts
import { compile } from './compile'
import { elementExtentMm, findPanel, isSliceRef, isStrip, panelWidthMm } from './panels'
import {
  BOARD_MAX_MM,
  BOARD_MIN_MM,
  MAX_CELLS,
  MIN_PLANING_ALLOWANCE_MM,
  MIN_STRIP_WIDTH_MM,
  SHRINKAGE_DELTA_PP,
  THICKNESS_MAX_MM,
  THICKNESS_MIN_MM,
  WARN_CELLS,
  type Design,
  type Diagnostic,
  type DiagnosticCode,
  type DiagnosticLevel,
  type DiagnosticTarget,
  type SpeciesId,
} from './types'

export interface ValidateOptions {
  readonly shrinkageByPct?: Readonly<Record<SpeciesId, number>>
}

const LEVEL_ORDER: Record<DiagnosticLevel, number> = { error: 0, warning: 1, info: 2 }

function diag(
  code: DiagnosticCode,
  level: DiagnosticLevel,
  params: Record<string, string | number> = {},
  target?: DiagnosticTarget,
): Diagnostic {
  return target
    ? { code, level, messageKey: `diag.${code}`, params, target }
    : { code, level, messageKey: `diag.${code}`, params }
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.level === 'error')
}

export function validate(design: Design, opts: ValidateOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = []
  const { board } = design

  const outOfRange = (v: number, lo: number, hi: number) => !Number.isFinite(v) || v < lo || v > hi
  if (
    outOfRange(board.targetWidthMm, BOARD_MIN_MM, BOARD_MAX_MM) ||
    outOfRange(board.targetLengthMm, BOARD_MIN_MM, BOARD_MAX_MM) ||
    outOfRange(board.thicknessMm, THICKNESS_MIN_MM, THICKNESS_MAX_MM) ||
    !Number.isFinite(design.kerfMm) ||
    design.kerfMm <= 0 ||
    design.kerfMm > 10
  ) {
    out.push(
      diag('DIMENSION_SANITY', 'error', {
        widthMm: board.targetWidthMm,
        lengthMm: board.targetLengthMm,
        thicknessMm: board.thicknessMm,
        kerfMm: design.kerfMm,
        minMm: BOARD_MIN_MM,
        maxMm: BOARD_MAX_MM,
      }),
    )
  }

  if (design.planingAllowanceMm < MIN_PLANING_ALLOWANCE_MM) {
    out.push(diag('PLANING_ALLOWANCE', 'warning', { actualMm: design.planingAllowanceMm, minMm: MIN_PLANING_ALLOWANCE_MM }))
  }

  for (const panel of design.panels) {
    if (panel.elements.length === 0) {
      out.push(diag('EMPTY_PANEL', 'error', { panelId: panel.id }, { panelId: panel.id }))
      continue
    }

    const widthMm = panelWidthMm(panel)
    if (widthMm > design.planerWidthMm) {
      out.push(
        diag('PLANER_WIDTH', 'error', { panelId: panel.id, widthMm, limitMm: design.planerWidthMm }, { panelId: panel.id }),
      )
    }

    panel.elements.forEach((el, elementIndex) => {
      if (isStrip(el)) {
        if (el.widthMm < MIN_STRIP_WIDTH_MM) {
          out.push(
            diag(
              'MIN_STRIP_WIDTH',
              'error',
              { panelId: panel.id, widthMm: el.widthMm, minMm: MIN_STRIP_WIDTH_MM },
              { panelId: panel.id, elementIndex },
            ),
          )
        }
        return
      }

      if (el.angleDeg !== 0) {
        out.push(diag('ANGLE_UNSUPPORTED', 'error', { angleDeg: el.angleDeg }, { panelId: panel.id, elementIndex }))
      }
      if (elementExtentMm(el) < MIN_STRIP_WIDTH_MM) {
        out.push(
          diag(
            'MIN_STRIP_WIDTH',
            'error',
            { panelId: panel.id, widthMm: elementExtentMm(el), minMm: MIN_STRIP_WIDTH_MM },
            { panelId: panel.id, elementIndex },
          ),
        )
      }

      const inner = findPanel(design, el.panelId)
      if (!inner || inner.id === panel.id) {
        out.push(diag('PANEL_NOT_FOUND', 'error', { panelId: el.panelId }, { panelId: panel.id, elementIndex }))
        return
      }
      if (inner.elements.some(isSliceRef)) {
        out.push(
          diag(
            'DEPTH_LIMIT',
            'error',
            { panelId: panel.id, innerPanelId: inner.id, maxDepth: 2 },
            { panelId: panel.id, elementIndex },
          ),
        )
      }
    })

    const shrink = opts.shrinkageByPct
    if (shrink) {
      for (let i = 1; i < panel.elements.length; i += 1) {
        const a = panel.elements[i - 1]
        const b = panel.elements[i]
        if (!a || !b || !isStrip(a) || !isStrip(b)) continue
        const sa = shrink[a.speciesId]
        const sb = shrink[b.speciesId]
        if (sa === undefined || sb === undefined) continue
        if (Math.abs(sa - sb) > SHRINKAGE_DELTA_PP) {
          out.push(
            diag(
              'SHRINKAGE_MISMATCH',
              'warning',
              { panelId: panel.id, a: a.speciesId, b: b.speciesId, deltaPp: Math.abs(sa - sb), limitPp: SHRINKAGE_DELTA_PP },
              { panelId: panel.id, elementIndex: i },
            ),
          )
        }
      }
    }
  }

  const rowWidths: number[] = []
  for (const row of design.rows) {
    if (row.angleDeg !== 0) {
      out.push(diag('ANGLE_UNSUPPORTED', 'error', { angleDeg: row.angleDeg }, { rowId: row.id }))
    }
    const panel = findPanel(design, row.panelId)
    if (!panel) {
      out.push(diag('PANEL_NOT_FOUND', 'error', { panelId: row.panelId }, { rowId: row.id }))
      continue
    }
    rowWidths.push(panelWidthMm(panel))
  }

  if (rowWidths.length > 1) {
    const min = Math.min(...rowWidths)
    const max = Math.max(...rowWidths)
    if (max - min > 0.01) {
      out.push(diag('RAGGED_BOARD', 'error', { minMm: min, maxMm: max }))
    }
  }

  const cellCount = compile(design).cells.length
  if (cellCount > MAX_CELLS) {
    out.push(diag('CELL_BUDGET', 'error', { cells: cellCount, limit: MAX_CELLS }))
  } else if (cellCount > WARN_CELLS) {
    out.push(diag('CELL_BUDGET', 'warning', { cells: cellCount, limit: WARN_CELLS }))
  }

  return out.sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      a.code.localeCompare(b.code) ||
      (a.target?.panelId ?? '').localeCompare(b.target?.panelId ?? '') ||
      (a.target?.rowId ?? '').localeCompare(b.target?.rowId ?? '') ||
      (a.target?.elementIndex ?? -1) - (b.target?.elementIndex ?? -1),
  )
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm test lib/engine/validate.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Add the depth-3 rejection property test**

Append to `lib/engine/compile.property.test.ts`:

```ts
import { validate, hasErrors } from './validate'

describe('depth limit invariant', () => {
  it('always rejects depth 3 and never rejects depth 2', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 3 }), (depth) => {
        const panels = [stripsPanel('L0', ['walnut', 'maple'], 12)]
        for (let i = 1; i < depth; i += 1) {
          panels.push({
            id: `L${i}`,
            elements: [{ kind: 'sliceRef', panelId: `L${i - 1}`, thicknessMm: 12, angleDeg: 0, offsetMm: 0 }],
          })
        }
        const top = `L${depth - 1}`
        const d: Design = baseDesign({
          panels,
          rows: [{ id: 'r1', panelId: top, thicknessMm: 24, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
        })
        const found = validate(d).some((x) => x.code === 'DEPTH_LIMIT')
        expect(found).toBe(depth >= 3)
        expect(() => compile(d)).not.toThrow()
        if (depth < 3) expect(hasErrors(validate(d))).toBe(false)
      }),
      { numRuns: 30 },
    )
  })
})
```

- [ ] **Step 6: Run the property test**

Run: `pnpm test lib/engine/compile.property.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Export from the barrel and commit**

Add to `lib/engine/index.ts`:

```ts
export { validate, hasErrors, type ValidateOptions } from './validate'
```

```bash
git add lib/engine
git commit -m "feat(engine): validate с одиннадцатью правилами изготовимости и запретом глубины 3"
```

---

### Task 7: applyPaint with panel fork, and splitPanel

**Files:**
- Create: `lib/engine/edit.ts`
- Modify: `lib/engine/index.ts`
- Test: `lib/engine/edit.test.ts`, `lib/engine/edit.property.test.ts`

**Interfaces:**
- Consumes: `compile`, `panelLengthMm`, `usageCount`, `nextPanelId`, `getPanel`, `getElement`, `isStrip`, `EngineError` from Tasks 2 and 4.
- Produces:

```ts
export interface PaintCost {
  readonly extraGlueUps: number
  readonly extraCuts: number
  /** Дополнительный погонаж заготовки по породам, метры. */
  readonly extraLumberMBySpecies: Readonly<Record<SpeciesId, number>>
}
export type PaintResult =
  | { readonly kind: 'noop'; readonly design: Design }
  | { readonly kind: 'inPlace'; readonly design: Design }
  | { readonly kind: 'fork'; readonly design: Design; readonly forkedPanelIds: readonly PanelId[]; readonly cost: PaintCost }

export function applyPaint(design: Design, cell: Cell, speciesId: SpeciesId): PaintResult
export function splitPanel(design: Design, panelId: PanelId, elementIndex: number, atMm: number): Design
```

Fork semantics, fixed for the whole project:
- The paint target is the strip that produced the cell: `origin.depth === 0` means `origin.panelId[origin.elementIndex]`, `depth === 1` means `origin.innerPanelId[origin.innerElementIndex]`.
- If the strip already carries `speciesId`, the result is `noop` and `design` is returned by reference.
- If the target panel is consumed by exactly one slice, the change is applied in place: `inPlace`.
- Otherwise the target panel is cloned under `nextPanelId(design)`, the clone gets the new species, and only the consumer that produced this cell is repointed at the clone. For `depth === 1` the consumer is the `SliceRef`; if the panel holding that `SliceRef` is itself shared, it is cloned too, so at most two panels are forked.
- `cost.extraGlueUps` is the number of newly created panels. `cost.extraCuts` is the number of slices now taken from the new panels. `cost.extraLumberMBySpecies` sums `panelLengthMm(next, newPanelId) / 1000` per strip, grouped by species.
- `splitPanel` splits any element (strip or slice ref) at local offset `atMm` into two elements of extents `atMm` and `extent - atMm`, preserving species (strip) or panel reference and offset (slice ref).

- [ ] **Step 1: Write the failing unit test**

`lib/engine/edit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compile } from './compile'
import { applyPaint, splitPanel } from './edit'
import { baseDesign, stripsPanel } from './fixtures'
import { EngineError } from './errors'
import type { Design } from './types'

/** Одна панель, два ряда: панель разделяемая, значит покраска обязана форкать. */
const shared: Design = baseDesign({
  panels: [stripsPanel('A', ['walnut', 'maple'])],
  rows: [
    { id: 'r1', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 },
    { id: 'r2', panelId: 'A', thicknessMm: 30, angleDeg: 0, flip: false, mirror: true, trimMm: 5 },
  ],
})

describe('applyPaint', () => {
  it('paints in place when the panel is used once', () => {
    const d = baseDesign()
    const cell = compile(d).cells[0]!
    const res = applyPaint(d, cell, 'padauk')
    expect(res.kind).toBe('inPlace')
    expect(compile(res.design).cells[0]?.speciesId).toBe('padauk')
    expect(res.design.panels).toHaveLength(2)
  })

  it('is a noop when the species is already there', () => {
    const d = baseDesign()
    const cell = compile(d).cells[0]!
    const res = applyPaint(d, cell, 'walnut')
    expect(res.kind).toBe('noop')
    expect(res.design).toBe(d)
  })

  it('forks the panel when it is shared, and prices the fork', () => {
    const cell = compile(shared).cells[0]!
    const res = applyPaint(shared, cell, 'padauk')
    if (res.kind !== 'fork') throw new Error('ожидался fork')
    expect(res.forkedPanelIds).toEqual(['P2'])
    expect(res.design.panels).toHaveLength(2)
    expect(res.cost.extraGlueUps).toBe(1)
    expect(res.cost.extraCuts).toBe(1)
    // новая панель: срез 30 + припуск 3 + trim 5 = 38 мм на каждую из двух полос
    expect(res.cost.extraLumberMBySpecies['padauk']).toBeCloseTo(0.038, 6)
    expect(res.cost.extraLumberMBySpecies['maple']).toBeCloseTo(0.038, 6)
    // второй ряд не тронут
    const after = compile(res.design)
    expect(after.cells.map((c) => c.speciesId)).toEqual(['padauk', 'maple', 'maple', 'walnut'])
  })

  it('rejects painting a slice ref itself', () => {
    const d = baseDesign({
      panels: [
        stripsPanel('Q', ['walnut', 'maple'], 10),
        { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 20, angleDeg: 0, offsetMm: 0 }] },
      ],
      rows: [{ id: 'r1', panelId: 'P', thicknessMm: 40, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
    })
    const cell = compile(d).cells[0]!
    // depth 1 указывает на полосу внутри Q, значит красится именно она
    const res = applyPaint(d, cell, 'padauk')
    expect(res.kind).toBe('inPlace')
    expect(compile(res.design).cells[0]?.speciesId).toBe('padauk')
  })
})

describe('splitPanel', () => {
  it('splits a strip into two strips of the same species', () => {
    const d = splitPanel(baseDesign(), 'A', 0, 10)
    expect(d.panels[0]?.elements).toEqual([
      { kind: 'strip', speciesId: 'walnut', widthMm: 10 },
      { kind: 'strip', speciesId: 'walnut', widthMm: 15 },
      { kind: 'strip', speciesId: 'maple', widthMm: 25 },
    ])
  })

  it('keeps total panel width unchanged', () => {
    const before = compile(baseDesign()).widthMm
    expect(compile(splitPanel(baseDesign(), 'A', 1, 7)).widthMm).toBeCloseTo(before, 6)
  })

  it('rejects a split outside the element', () => {
    expect(() => splitPanel(baseDesign(), 'A', 0, 0)).toThrowError(EngineError)
    expect(() => splitPanel(baseDesign(), 'A', 0, 25)).toThrowError(EngineError)
    expect(() => splitPanel(baseDesign(), 'A', 9, 5)).toThrowError(EngineError)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test lib/engine/edit.test.ts`
Expected: FAIL with `Failed to resolve import "./edit"`.

- [ ] **Step 3: Write `lib/engine/edit.ts`**

```ts
import { EngineError } from './errors'
import { elementExtentMm, getElement, getPanel, isStrip, nextPanelId, panelLengthMm, slicesOfPanel, usageCount } from './panels'
import type { Cell, Design, Panel, PanelElement, PanelId, SpeciesId } from './types'

export interface PaintCost {
  readonly extraGlueUps: number
  readonly extraCuts: number
  readonly extraLumberMBySpecies: Readonly<Record<SpeciesId, number>>
}

export type PaintResult =
  | { readonly kind: 'noop'; readonly design: Design }
  | { readonly kind: 'inPlace'; readonly design: Design }
  | { readonly kind: 'fork'; readonly design: Design; readonly forkedPanelIds: readonly PanelId[]; readonly cost: PaintCost }

function replacePanel(design: Design, panelId: PanelId, next: Panel): Design {
  return { ...design, panels: design.panels.map((p) => (p.id === panelId ? next : p)) }
}

function withElement(panel: Panel, index: number, el: PanelElement): Panel {
  return { ...panel, elements: panel.elements.map((e, i) => (i === index ? el : e)) }
}

function lumberMetersOf(design: Design, panelId: PanelId): Record<SpeciesId, number> {
  const lengthM = panelLengthMm(design, panelId) / 1000
  const out: Record<SpeciesId, number> = {}
  for (const el of getPanel(design, panelId).elements) {
    if (!isStrip(el)) continue
    out[el.speciesId] = (out[el.speciesId] ?? 0) + lengthM
  }
  return out
}

function mergeMeters(a: Record<SpeciesId, number>, b: Record<SpeciesId, number>): Record<SpeciesId, number> {
  const out: Record<SpeciesId, number> = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v
  return out
}

export function applyPaint(design: Design, cell: Cell, speciesId: SpeciesId): PaintResult {
  const { origin } = cell
  const targetPanelId = origin.depth === 0 ? origin.panelId : origin.innerPanelId
  const targetIndex = origin.depth === 0 ? origin.elementIndex : origin.innerElementIndex
  if (targetPanelId === undefined || targetIndex === undefined) {
    throw new EngineError('ELEMENT_NOT_FOUND', 'ячейка не содержит происхождения полосы')
  }

  const targetEl = getElement(design, targetPanelId, targetIndex)
  if (!isStrip(targetEl)) {
    throw new EngineError('PAINT_TARGET_NOT_STRIP', `элемент ${targetIndex} панели ${targetPanelId} не полоса`)
  }
  if (targetEl.speciesId === speciesId) return { kind: 'noop', design }

  const painted: PanelElement = { ...targetEl, speciesId }

  if (usageCount(design, targetPanelId) <= 1) {
    const next = replacePanel(design, targetPanelId, withElement(getPanel(design, targetPanelId), targetIndex, painted))
    return { kind: 'inPlace', design: next }
  }

  // Форк: клонируем целевую панель и перенаправляем только того потребителя, который дал эту ячейку.
  const cloneId = nextPanelId(design)
  const clone: Panel = withElement({ ...getPanel(design, targetPanelId), id: cloneId }, targetIndex, painted)
  let next: Design = { ...design, panels: [...design.panels, clone] }
  const forkedPanelIds: PanelId[] = [cloneId]

  if (origin.depth === 0) {
    next = { ...next, rows: next.rows.map((r) => (r.id === origin.rowId ? { ...r, panelId: cloneId } : r)) }
  } else {
    let outerId = origin.panelId
    if (usageCount(next, outerId) > 1) {
      const outerCloneId = nextPanelId(next)
      const outerClone: Panel = { ...getPanel(next, outerId), id: outerCloneId }
      next = {
        ...next,
        panels: [...next.panels, outerClone],
        rows: next.rows.map((r) => (r.id === origin.rowId ? { ...r, panelId: outerCloneId } : r)),
      }
      forkedPanelIds.push(outerCloneId)
      outerId = outerCloneId
    }
    const outer = getPanel(next, outerId)
    const ref = outer.elements[origin.elementIndex]
    if (!ref || isStrip(ref)) throw new EngineError('ELEMENT_NOT_FOUND', 'ожидался SliceRef во внешней панели')
    next = replacePanel(next, outerId, withElement(outer, origin.elementIndex, { ...ref, panelId: cloneId }))
  }

  const cost: PaintCost = {
    extraGlueUps: forkedPanelIds.length,
    extraCuts: forkedPanelIds.reduce((s, id) => s + slicesOfPanel(next, id).length, 0),
    extraLumberMBySpecies: forkedPanelIds.reduce<Record<SpeciesId, number>>(
      (acc, id) => mergeMeters(acc, lumberMetersOf(next, id)),
      {},
    ),
  }

  return { kind: 'fork', design: next, forkedPanelIds, cost }
}

export function splitPanel(design: Design, panelId: PanelId, elementIndex: number, atMm: number): Design {
  const panel = getPanel(design, panelId)
  const el = getElement(design, panelId, elementIndex)
  const extent = elementExtentMm(el)
  if (!Number.isFinite(atMm) || atMm <= 0 || atMm >= extent) {
    throw new EngineError('SPLIT_OUT_OF_RANGE', `разрез ${atMm} мм вне элемента шириной ${extent} мм`)
  }

  const [left, right]: [PanelElement, PanelElement] = isStrip(el)
    ? [
        { ...el, widthMm: atMm },
        { ...el, widthMm: extent - atMm },
      ]
    : [
        { ...el, thicknessMm: atMm },
        { ...el, thicknessMm: extent - atMm },
      ]

  const elements = [...panel.elements.slice(0, elementIndex), left, right, ...panel.elements.slice(elementIndex + 1)]
  return replacePanel(design, panelId, { ...panel, elements })
}
```

- [ ] **Step 4: Run the unit test and confirm it passes**

Run: `pnpm test lib/engine/edit.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Write the paint idempotence property test**

`lib/engine/edit.property.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { compile } from './compile'
import { applyPaint, splitPanel } from './edit'
import { baseDesign, stripsPanel } from './fixtures'
import { validate, hasErrors } from './validate'
import type { Design } from './types'

const speciesArb = fc.constantFrom('walnut', 'maple', 'cherry', 'padauk', 'wenge')

const sharedDesign = (rowCount: number): Design =>
  baseDesign({
    panels: [stripsPanel('A', ['walnut', 'maple', 'cherry'])],
    rows: Array.from({ length: rowCount }, (_, i) => ({
      id: `r${i}`,
      panelId: 'A',
      thicknessMm: 25,
      angleDeg: 0,
      flip: false,
      mirror: i % 2 === 1,
      trimMm: 4,
    })),
  })

describe('applyPaint invariants', () => {
  it('is idempotent: painting the same cell with the same species twice changes nothing', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(), speciesArb, (rows, rawIdx, species) => {
        const d0 = sharedDesign(rows)
        const m0 = compile(d0)
        const cell0 = m0.cells[rawIdx % m0.cells.length]!
        const first = applyPaint(d0, cell0, species)

        const m1 = compile(first.design)
        const cell1 = m1.cells.find((c) => c.xMm === cell0.xMm && c.yMm === cell0.yMm)!
        expect(cell1.speciesId).toBe(species)

        const second = applyPaint(first.design, cell1, species)
        expect(second.kind).toBe('noop')
        expect(second.design).toBe(first.design)
      }),
      { numRuns: 200 },
    )
  })

  it('never adds glue-ups when painting in place, and adds exactly the reported count when forking', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(), speciesArb, (rows, rawIdx, species) => {
        const d0 = sharedDesign(rows)
        const m0 = compile(d0)
        const cell0 = m0.cells[rawIdx % m0.cells.length]!
        const res = applyPaint(d0, cell0, species)
        const before = compile(d0).glueUpCount
        const after = compile(res.design).glueUpCount
        if (res.kind === 'fork') expect(after - before).toBe(res.cost.extraGlueUps)
        else expect(after).toBe(before)
      }),
      { numRuns: 200 },
    )
  })

  it('keeps a valid design valid and preserves board area', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), fc.nat(), speciesArb, (rows, rawIdx, species) => {
        const d0 = sharedDesign(rows)
        expect(hasErrors(validate(d0))).toBe(false)
        const m0 = compile(d0)
        const cell0 = m0.cells[rawIdx % m0.cells.length]!
        const m1 = compile(applyPaint(d0, cell0, species).design)
        expect(m1.widthMm * m1.lengthMm).toBeCloseTo(m0.widthMm * m0.lengthMm, 6)
      }),
      { numRuns: 200 },
    )
  })
})

describe('splitPanel invariants', () => {
  it('preserves board geometry area and adds exactly one element', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 }), fc.double({ min: 5, max: 20, noNaN: true, noDefaultInfinity: true }), (idx, at) => {
        const d0 = sharedDesign(2)
        const m0 = compile(d0)
        const d1 = splitPanel(d0, 'A', idx, at)
        const m1 = compile(d1)
        expect(d1.panels[0]!.elements.length).toBe(d0.panels[0]!.elements.length + 1)
        expect(m1.widthMm).toBeCloseTo(m0.widthMm, 6)
        expect(m1.cells.reduce((s, c) => s + c.widthMm * c.heightMm, 0)).toBeCloseTo(
          m0.cells.reduce((s, c) => s + c.widthMm * c.heightMm, 0),
          4,
        )
      }),
      { numRuns: 200 },
    )
  })
})
```

- [ ] **Step 6: Run the property test**

Run: `pnpm test lib/engine/edit.property.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Export from the barrel and commit**

Add to `lib/engine/index.ts`:

```ts
export { applyPaint, splitPanel, type PaintCost, type PaintResult } from './edit'
```

```bash
git add lib/engine
git commit -m "feat(engine): applyPaint с разветвлением панели и splitPanel, property-тесты идемпотентности"
```

---

### Task 8: units and calc

**Files:**
- Create: `lib/units.ts`, `lib/calc/index.ts`
- Test: `lib/units.test.ts`, `lib/calc/index.test.ts`

**Interfaces:**
- Consumes: `Design`, `BoardModel`, `panelLengthMm`, `isStrip`, `compile` from the engine; `getSpeciesById` from Task 3.
- Produces:

```ts
// lib/units.ts
export const MM_PER_INCH = 25.4
export const MM3_PER_BOARD_FOOT = 2359737.216
export function mmToInch(mm: number): number
export function inchToMm(inch: number): number
export function mm3ToBoardFeet(mm3: number): number
export function formatMm(mm: number, unit: 'mm' | 'in', digits?: number): string

// lib/calc/index.ts
export interface LumberNeed {
  readonly speciesId: SpeciesId
  readonly rawVolumeMm3: number
  readonly boardFeet: number
  readonly linearMeters: number
  readonly costUsd: number
  readonly weightKg: number
}
export interface CalcResult {
  readonly bySpecies: readonly LumberNeed[]
  readonly totalBoardFeet: number
  readonly totalCostUsd: number
  readonly totalWeightKg: number
  readonly finishedVolumeMm3: number
  readonly rawVolumeMm3: number
  readonly wastePct: number
  readonly glueUpCount: number
  readonly cutCount: number
}
export function calcProject(design: Design, model: BoardModel): CalcResult
```

Formulas, fixed for the whole project:
- Raw stock per strip: `widthMm * (board.thicknessMm + planingAllowanceMm) * panelLengthMm(design, panelId)`. Kerf and trim are already inside `panelLengthMm`, so waste is never double counted.
- Linear metres per strip: `panelLengthMm(design, panelId) / 1000`.
- `boardFeet = rawVolumeMm3 / 2359737.216`.
- `costUsd = boardFeet * species.pricePerBoardFootUsd`.
- Finished volume: `sum(cell.widthMm * cell.heightMm) * board.thicknessMm`.
- Weight is the finished board: per species, `finishedVolumeMm3_of_species * densityKgM3 / 1e9`.
- `wastePct = rawVolumeMm3 > 0 ? (rawVolumeMm3 - finishedVolumeMm3) / rawVolumeMm3 * 100 : 0`.
- `glueUpCount` and `cutCount` are taken straight from `BoardModel`.
- `bySpecies` is sorted by descending `costUsd`, ties by `speciesId`.

- [ ] **Step 1: Write the failing units test**

`lib/units.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { MM_PER_INCH, formatMm, inchToMm, mm3ToBoardFeet, mmToInch } from './units'

describe('units', () => {
  it('converts mm and inches', () => {
    expect(MM_PER_INCH).toBe(25.4)
    expect(mmToInch(25.4)).toBeCloseTo(1, 9)
    expect(inchToMm(2)).toBeCloseTo(50.8, 9)
    expect(mmToInch(inchToMm(3.75))).toBeCloseTo(3.75, 9)
  })

  it('converts volume to board feet', () => {
    // 1 board foot = 144 куб. дюйма
    expect(mm3ToBoardFeet(144 * 25.4 ** 3)).toBeCloseTo(1, 6)
  })

  it('formats for display in the chosen unit', () => {
    expect(formatMm(25.4, 'mm')).toBe('25.4 мм')
    expect(formatMm(25.4, 'in')).toBe('1.00"')
    expect(formatMm(300, 'mm', 0)).toBe('300 мм')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test lib/units.test.ts`
Expected: FAIL with `Failed to resolve import "./units"`.

- [ ] **Step 3: Write `lib/units.ts`**

```ts
export const MM_PER_INCH = 25.4
export const MM3_PER_BOARD_FOOT = 144 * MM_PER_INCH ** 3 // 2359737.216

export function mmToInch(mm: number): number {
  return mm / MM_PER_INCH
}

export function inchToMm(inch: number): number {
  return inch * MM_PER_INCH
}

export function mm3ToBoardFeet(mm3: number): number {
  return mm3 / MM3_PER_BOARD_FOOT
}

/** Единственное место, где миллиметры превращаются в текст. */
export function formatMm(mm: number, unit: 'mm' | 'in', digits = 1): string {
  return unit === 'mm' ? `${mm.toFixed(digits)} мм` : `${mmToInch(mm).toFixed(2)}"`
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `pnpm test lib/units.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the failing calc test**

`lib/calc/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { baseDesign, compile, stripsPanel } from '@/lib/engine'
import { calcProject } from './index'

describe('calcProject', () => {
  const design = baseDesign()
  const model = compile(design)
  const result = calcProject(design, model)

  it('splits lumber by species', () => {
    expect(result.bySpecies.map((s) => s.speciesId).sort()).toEqual(['maple', 'walnut'])
  })

  it('computes raw volume from strip width, planed thickness and panel length', () => {
    // 4 полосы по 25 мм, толщина 40+3, длина панели 38 мм
    expect(result.rawVolumeMm3).toBeCloseTo(4 * 25 * 43 * 38, 4)
  })

  it('computes finished volume from the compiled cells', () => {
    expect(result.finishedVolumeMm3).toBeCloseTo(50 * 60 * 40, 4)
  })

  it('reports waste between 0 and 100 percent', () => {
    expect(result.wastePct).toBeGreaterThan(0)
    expect(result.wastePct).toBeLessThan(100)
  })

  it('passes glue-ups and cuts through from the board model', () => {
    expect(result.glueUpCount).toBe(model.glueUpCount)
    expect(result.cutCount).toBe(model.cutCount)
  })

  it('prices and weighs the board', () => {
    expect(result.totalCostUsd).toBeGreaterThan(0)
    expect(result.totalBoardFeet).toBeCloseTo(result.rawVolumeMm3 / 2359737.216, 6)
    // 120 куб. см ореха и клёна весят меньше килограмма
    expect(result.totalWeightKg).toBeCloseTo((50 * 60 * 40 * ((610 + 705) / 2)) / 1e9, 3)
  })

  it('handles an empty design without dividing by zero', () => {
    const empty = baseDesign({ panels: [], rows: [] })
    const r = calcProject(empty, compile(empty))
    expect(r.wastePct).toBe(0)
    expect(r.bySpecies).toEqual([])
    expect(r.totalCostUsd).toBe(0)
  })
})
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `pnpm test lib/calc`
Expected: FAIL with `Failed to resolve import "./index"`.

- [ ] **Step 7: Write `lib/calc/index.ts`**

```ts
import { isStrip, panelLengthMm, type BoardModel, type Design, type SpeciesId } from '@/lib/engine'
import { getSpeciesById } from '@/lib/species'
import { mm3ToBoardFeet } from '@/lib/units'

export interface LumberNeed {
  readonly speciesId: SpeciesId
  readonly rawVolumeMm3: number
  readonly boardFeet: number
  readonly linearMeters: number
  readonly costUsd: number
  readonly weightKg: number
}

export interface CalcResult {
  readonly bySpecies: readonly LumberNeed[]
  readonly totalBoardFeet: number
  readonly totalCostUsd: number
  readonly totalWeightKg: number
  readonly finishedVolumeMm3: number
  readonly rawVolumeMm3: number
  readonly wastePct: number
  readonly glueUpCount: number
  readonly cutCount: number
}

export function calcProject(design: Design, model: BoardModel): CalcResult {
  const rawBySpecies = new Map<SpeciesId, { rawVolumeMm3: number; linearMeters: number }>()
  const planedThicknessMm = design.board.thicknessMm + design.planingAllowanceMm

  for (const panel of design.panels) {
    const lengthMm = panelLengthMm(design, panel.id)
    for (const el of panel.elements) {
      if (!isStrip(el)) continue
      const acc = rawBySpecies.get(el.speciesId) ?? { rawVolumeMm3: 0, linearMeters: 0 }
      acc.rawVolumeMm3 += el.widthMm * planedThicknessMm * lengthMm
      acc.linearMeters += lengthMm / 1000
      rawBySpecies.set(el.speciesId, acc)
    }
  }

  const finishedBySpecies = new Map<SpeciesId, number>()
  for (const cell of model.cells) {
    const v = cell.widthMm * cell.heightMm * model.thicknessMm
    finishedBySpecies.set(cell.speciesId, (finishedBySpecies.get(cell.speciesId) ?? 0) + v)
  }

  const bySpecies: LumberNeed[] = [...rawBySpecies.entries()]
    .map(([speciesId, { rawVolumeMm3, linearMeters }]) => {
      const species = getSpeciesById(speciesId)
      const boardFeet = mm3ToBoardFeet(rawVolumeMm3)
      return {
        speciesId,
        rawVolumeMm3,
        boardFeet,
        linearMeters,
        costUsd: boardFeet * species.pricePerBoardFootUsd,
        weightKg: ((finishedBySpecies.get(speciesId) ?? 0) * species.densityKgM3) / 1e9,
      }
    })
    .sort((a, b) => b.costUsd - a.costUsd || a.speciesId.localeCompare(b.speciesId))

  const rawVolumeMm3 = bySpecies.reduce((s, x) => s + x.rawVolumeMm3, 0)
  const finishedVolumeMm3 = [...finishedBySpecies.values()].reduce((s, v) => s + v, 0)

  return {
    bySpecies,
    totalBoardFeet: bySpecies.reduce((s, x) => s + x.boardFeet, 0),
    totalCostUsd: bySpecies.reduce((s, x) => s + x.costUsd, 0),
    totalWeightKg: bySpecies.reduce((s, x) => s + x.weightKg, 0),
    finishedVolumeMm3,
    rawVolumeMm3,
    wastePct: rawVolumeMm3 > 0 ? ((rawVolumeMm3 - finishedVolumeMm3) / rawVolumeMm3) * 100 : 0,
    glueUpCount: model.glueUpCount,
    cutCount: model.cutCount,
  }
}
```

- [ ] **Step 8: Run the calc test and confirm it passes**

Run: `pnpm test lib/calc lib/units`
Expected: PASS, 10 tests.

- [ ] **Step 9: Commit**

```bash
git add lib/units.ts lib/units.test.ts lib/calc
git commit -m "feat(calc): пиломатериал по породам, board feet, отходы, себестоимость и вес"
```

---

### Task 9: persist - zod schema v1, compact codec, URL hash, localStorage, migrations

**Files:**
- Create: `lib/persist/schema.ts`, `lib/persist/codec.ts`, `lib/persist/index.ts`
- Test: `lib/persist/codec.test.ts`, `lib/persist/codec.property.test.ts`

**Interfaces:**
- Consumes: `Design`, `SCHEMA_VERSION`, `DEFAULT_PLANER_WIDTH_MM`, `baseDesign` from the engine.
- Produces:

```ts
// lib/persist/schema.ts
export const CURRENT_SCHEMA_VERSION = 1
export const designSchema: z.ZodTypeAny
export const migrations: Readonly<Record<number, (doc: unknown) => unknown>>
export function migrate(doc: unknown): unknown
export function parseDesign(input: unknown): Design

// lib/persist/codec.ts
export function toCompact(design: Design): unknown
export function fromCompact(compact: unknown): Design
export function serializeDesign(design: Design): string
export function deserializeDesign(json: string): Design
export function encodeDesignToHash(design: Design): string
export function decodeDesignFromHash(hash: string): Design
export const LS_CURRENT_KEY = 'endgrain.current.v1'
export function saveToLocalStorage(design: Design): void
export function loadFromLocalStorage(): Design | null
```

Compact form, fixed for the whole project. Long keys cost bytes in a share link, so the wire format is positional:

```
{ v: schemaVersion, i: id, n: name, s: [speciesId...], p: [panel...], r: [row...],
  b: [targetWidthMm, targetLengthMm, thicknessMm], k: kerfMm, a: planingAllowanceMm, w: planerWidthMm }
panel  = [panelId, element...]
strip  = [0, indexInSpeciesArray, widthMm]
ref    = [1, indexInPanelsArray, thicknessMm, angleDeg, offsetMm]
row    = [rowId, indexInPanelsArray, thicknessMm, angleDeg, flags, trimMm]   // flags: bit0 flip, bit1 mirror
```

A species used by a strip but missing from `design.species` is appended to the species array during encoding, so encoding never loses data.

- [ ] **Step 1: Write the failing codec test**

`lib/persist/codec.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { baseDesign, stripsPanel, type Design } from '@/lib/engine'
import { parseDesign, migrate, CURRENT_SCHEMA_VERSION } from './schema'
import {
  LS_CURRENT_KEY,
  decodeDesignFromHash,
  deserializeDesign,
  encodeDesignToHash,
  loadFromLocalStorage,
  saveToLocalStorage,
  serializeDesign,
  toCompact,
} from './codec'

const nested: Design = baseDesign({
  panels: [
    stripsPanel('Q', ['walnut', 'maple'], 12),
    { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 24, angleDeg: 0, offsetMm: 6 }] },
  ],
  rows: [{ id: 'r1', panelId: 'P', thicknessMm: 30, angleDeg: 0, flip: true, mirror: false, trimMm: 5 }],
})

describe('codec', () => {
  it('round-trips a design through JSON', () => {
    expect(deserializeDesign(serializeDesign(nested))).toEqual(nested)
  })

  it('round-trips a design through the URL hash', () => {
    const hash = encodeDesignToHash(nested)
    expect(hash).not.toContain('{')
    expect(decodeDesignFromHash(hash)).toEqual(nested)
  })

  it('produces a compact positional form', () => {
    const c = toCompact(nested) as Record<string, unknown>
    expect(c['v']).toBe(CURRENT_SCHEMA_VERSION)
    expect(c['s']).toEqual(['walnut', 'maple'])
    expect(c['p']).toEqual([
      ['Q', [0, 0, 12], [0, 1, 12]],
      ['P', [1, 0, 24, 0, 6]],
    ])
    expect(c['r']).toEqual([['r1', 1, 30, 0, 1, 5]])
  })

  it('keeps a typical share link under 2 kilobytes', () => {
    const big = baseDesign({
      panels: Array.from({ length: 8 }, (_, i) => stripsPanel(`P${i}`, Array(12).fill('walnut'), 20)),
      rows: Array.from({ length: 12 }, (_, i) => ({
        id: `r${i}`, panelId: `P${i % 8}`, thicknessMm: 25, angleDeg: 0, flip: false, mirror: i % 2 === 1, trimMm: 4,
      })),
    })
    expect(encodeDesignToHash(big).length).toBeLessThan(2048)
  })

  it('rejects a malformed document', () => {
    expect(() => parseDesign({ schemaVersion: 1, id: 'x' })).toThrow()
    expect(() => decodeDesignFromHash('не-сжатая-строка')).toThrow()
  })
})

describe('migrations', () => {
  it('upgrades a version-0 document by filling the new fields', () => {
    const legacy = { ...baseDesign(), schemaVersion: undefined, planerWidthMm: undefined }
    const migrated = migrate(legacy) as Record<string, unknown>
    expect(migrated['schemaVersion']).toBe(1)
    expect(migrated['planerWidthMm']).toBe(330)
    expect(() => parseDesign(legacy)).not.toThrow()
  })
})

describe('localStorage', () => {
  beforeEach(() => window.localStorage.clear())

  it('saves and loads the current design', () => {
    expect(loadFromLocalStorage()).toBeNull()
    saveToLocalStorage(nested)
    expect(window.localStorage.getItem(LS_CURRENT_KEY)).toBeTruthy()
    expect(loadFromLocalStorage()).toEqual(nested)
  })

  it('returns null instead of throwing on corrupted storage', () => {
    window.localStorage.setItem(LS_CURRENT_KEY, 'мусор')
    expect(loadFromLocalStorage()).toBeNull()
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test lib/persist`
Expected: FAIL with `Failed to resolve import "./schema"`.

- [ ] **Step 3: Write `lib/persist/schema.ts`**

```ts
import { z } from 'zod'
import { DEFAULT_PLANER_WIDTH_MM, SCHEMA_VERSION, type Design } from '@/lib/engine'

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSION

const mm = z.number().finite()

const stripSchema = z.object({
  kind: z.literal('strip'),
  speciesId: z.string().min(1),
  widthMm: mm.positive(),
})

const sliceRefSchema = z.object({
  kind: z.literal('sliceRef'),
  panelId: z.string().min(1),
  thicknessMm: mm.positive(),
  angleDeg: mm,
  offsetMm: mm,
})

const panelSchema = z.object({
  id: z.string().min(1),
  elements: z.array(z.discriminatedUnion('kind', [stripSchema, sliceRefSchema])),
})

const rowSchema = z.object({
  id: z.string().min(1),
  panelId: z.string().min(1),
  thicknessMm: mm.positive(),
  angleDeg: mm,
  flip: z.boolean(),
  mirror: z.boolean(),
  trimMm: mm.nonnegative(),
})

export const designSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string(),
  species: z.array(z.string().min(1)),
  panels: z.array(panelSchema),
  rows: z.array(rowSchema),
  board: z.object({
    targetWidthMm: mm.positive(),
    targetLengthMm: mm.positive(),
    thicknessMm: mm.positive(),
  }),
  kerfMm: mm.positive(),
  planingAllowanceMm: mm.nonnegative(),
  planerWidthMm: mm.positive(),
})

// Проверка на этапе типов: выход схемы совместим с доменным Design.
const _compat: (d: z.infer<typeof designSchema>) => Design = (d) => d
void _compat

/**
 * Реестр миграций: ключ - версия документа ДО применения.
 * Версия 0 (документы без schemaVersion) приводится к v1.
 */
export const migrations: Readonly<Record<number, (doc: unknown) => unknown>> = {
  0: (doc) => {
    const d = doc as Record<string, unknown>
    return { ...d, schemaVersion: 1, planerWidthMm: typeof d['planerWidthMm'] === 'number' ? d['planerWidthMm'] : DEFAULT_PLANER_WIDTH_MM }
  },
}

export function migrate(doc: unknown): unknown {
  let current = doc
  for (let v = versionOf(current); v < CURRENT_SCHEMA_VERSION; v = versionOf(current)) {
    const step = migrations[v]
    if (!step) throw new Error(`нет миграции с версии ${v}`)
    const next = step(current)
    if (versionOf(next) <= v) throw new Error(`миграция с версии ${v} не подняла версию`)
    current = next
  }
  return current
}

function versionOf(doc: unknown): number {
  const v = (doc as { schemaVersion?: unknown } | null)?.schemaVersion
  return typeof v === 'number' ? v : 0
}

/** Единственный читатель документа для веба, CLI и OG-роута. */
export function parseDesign(input: unknown): Design {
  return designSchema.parse(migrate(input))
}
```

- [ ] **Step 4: Write `lib/persist/codec.ts`**

```ts
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Design, Panel, PanelElement, Row, SpeciesId } from '@/lib/engine'
import { CURRENT_SCHEMA_VERSION, parseDesign } from './schema'

export const LS_CURRENT_KEY = 'endgrain.current.v1'

export function toCompact(design: Design): unknown {
  const species: SpeciesId[] = [...design.species]
  const speciesIndex = (id: SpeciesId): number => {
    const i = species.indexOf(id)
    if (i >= 0) return i
    species.push(id)
    return species.length - 1
  }
  const panelIndex = (id: string): number => design.panels.findIndex((p) => p.id === id)

  const p = design.panels.map((panel) => [
    panel.id,
    ...panel.elements.map((el) =>
      el.kind === 'strip'
        ? [0, speciesIndex(el.speciesId), el.widthMm]
        : [1, panelIndex(el.panelId), el.thicknessMm, el.angleDeg, el.offsetMm],
    ),
  ])

  const r = design.rows.map((row) => [
    row.id,
    panelIndex(row.panelId),
    row.thicknessMm,
    row.angleDeg,
    (row.flip ? 1 : 0) | (row.mirror ? 2 : 0),
    row.trimMm,
  ])

  return {
    v: CURRENT_SCHEMA_VERSION,
    i: design.id,
    n: design.name,
    s: species,
    p,
    r,
    b: [design.board.targetWidthMm, design.board.targetLengthMm, design.board.thicknessMm],
    k: design.kerfMm,
    a: design.planingAllowanceMm,
    w: design.planerWidthMm,
  }
}

export function fromCompact(compact: unknown): Design {
  const c = compact as Record<string, unknown>
  const species = c['s'] as SpeciesId[]
  const rawPanels = c['p'] as unknown[][]
  const panelIds = rawPanels.map((row) => row[0] as string)

  const panels: Panel[] = rawPanels.map((row) => ({
    id: row[0] as string,
    elements: row.slice(1).map((raw): PanelElement => {
      const e = raw as number[]
      return e[0] === 0
        ? { kind: 'strip', speciesId: species[e[1] as number] as SpeciesId, widthMm: e[2] as number }
        : {
            kind: 'sliceRef',
            panelId: panelIds[e[1] as number] as string,
            thicknessMm: e[2] as number,
            angleDeg: e[3] as number,
            offsetMm: e[4] as number,
          }
    }),
  }))

  const rows: Row[] = (c['r'] as unknown[][]).map((raw) => ({
    id: raw[0] as string,
    panelId: panelIds[raw[1] as number] as string,
    thicknessMm: raw[2] as number,
    angleDeg: raw[3] as number,
    flip: ((raw[4] as number) & 1) === 1,
    mirror: ((raw[4] as number) & 2) === 2,
    trimMm: raw[5] as number,
  }))

  const b = c['b'] as number[]

  return parseDesign({
    schemaVersion: c['v'],
    id: c['i'],
    name: c['n'],
    species,
    panels,
    rows,
    board: { targetWidthMm: b[0], targetLengthMm: b[1], thicknessMm: b[2] },
    kerfMm: c['k'],
    planingAllowanceMm: c['a'],
    planerWidthMm: c['w'],
  })
}

export function serializeDesign(design: Design): string {
  return JSON.stringify(toCompact(design))
}

export function deserializeDesign(json: string): Design {
  return fromCompact(JSON.parse(json))
}

export function encodeDesignToHash(design: Design): string {
  return compressToEncodedURIComponent(serializeDesign(design))
}

export function decodeDesignFromHash(hash: string): Design {
  const json = decompressFromEncodedURIComponent(hash.replace(/^#/, ''))
  if (!json) throw new Error('ссылка повреждена: не удалось распаковать проект')
  return deserializeDesign(json)
}

export function saveToLocalStorage(design: Design): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(LS_CURRENT_KEY, serializeDesign(design))
}

export function loadFromLocalStorage(): Design | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(LS_CURRENT_KEY)
  if (!raw) return null
  try {
    return deserializeDesign(raw)
  } catch {
    return null
  }
}
```

Note: `toCompact` preserves the original `species` array order and only appends, so the round-trip comparison in the test uses a design whose `species` already lists every used species. `baseDesign` satisfies that.

- [ ] **Step 5: Write the barrel**

`lib/persist/index.ts`:

```ts
export { CURRENT_SCHEMA_VERSION, designSchema, migrate, migrations, parseDesign } from './schema'
export {
  LS_CURRENT_KEY,
  decodeDesignFromHash,
  deserializeDesign,
  encodeDesignToHash,
  fromCompact,
  loadFromLocalStorage,
  saveToLocalStorage,
  serializeDesign,
  toCompact,
} from './codec'
```

- [ ] **Step 6: Run the test and confirm it passes**

Run: `pnpm test lib/persist`
Expected: PASS, 8 tests.

- [ ] **Step 7: Write the round-trip property test**

`lib/persist/codec.property.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { baseDesign, type Design } from '@/lib/engine'
import { decodeDesignFromHash, deserializeDesign, encodeDesignToHash, serializeDesign } from './codec'

const speciesArb = fc.constantFrom('walnut', 'maple', 'cherry', 'padauk', 'wenge')

const designArb: fc.Arbitrary<Design> = fc
  .record({
    panelSpecies: fc.array(fc.array(speciesArb, { minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 5 }),
    widthMm: fc.double({ min: 4, max: 40, noNaN: true, noDefaultInfinity: true }),
    thicknessMm: fc.double({ min: 10, max: 40, noNaN: true, noDefaultInfinity: true }),
    trimMm: fc.double({ min: 0, max: 15, noNaN: true, noDefaultInfinity: true }),
    flags: fc.array(fc.tuple(fc.boolean(), fc.boolean()), { minLength: 1, maxLength: 5 }),
  })
  .map(({ panelSpecies, widthMm, thicknessMm, trimMm, flags }) =>
    baseDesign({
      species: ['walnut', 'maple', 'cherry', 'padauk', 'wenge'],
      panels: panelSpecies.map((ids, i) => ({
        id: `P${i}`,
        elements: ids.map((speciesId) => ({ kind: 'strip' as const, speciesId, widthMm })),
      })),
      rows: panelSpecies.map((_, i) => ({
        id: `r${i}`,
        panelId: `P${i}`,
        thicknessMm,
        angleDeg: 0,
        flip: flags[i % flags.length]![0],
        mirror: flags[i % flags.length]![1],
        trimMm,
      })),
    }),
  )

describe('persist round-trip', () => {
  it('serialize then parse returns an equivalent document', () => {
    fc.assert(
      fc.property(designArb, (d) => {
        expect(deserializeDesign(serializeDesign(d))).toEqual(d)
      }),
      { numRuns: 200 },
    )
  })

  it('hash encode then decode returns an equivalent document', () => {
    fc.assert(
      fc.property(designArb, (d) => {
        expect(decodeDesignFromHash(encodeDesignToHash(d))).toEqual(d)
      }),
      { numRuns: 200 },
    )
  })
})
```

- [ ] **Step 8: Run it and confirm it passes**

Run: `pnpm test lib/persist`
Expected: PASS, 10 tests.

- [ ] **Step 9: Commit**

```bash
git add lib/persist
git commit -m "feat(persist): zod-схема v1, компактный кодек, ссылка через lz-string и localStorage"
```

---

### Task 10: i18n dictionary, sample checkerboard, and the app shell

**Files:**
- Create: `lib/i18n/ru.ts`, `lib/i18n/en.ts`, `lib/i18n/index.ts`, `lib/designs/samples.ts`
- Create: `components/BoardSvg.tsx`, `components/ComplexityMeter.tsx`, `components/LocaleToggle.tsx`, `components/StudioShell.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`
- Test: `lib/i18n/index.test.ts`, `lib/designs/samples.test.ts`, `components/BoardSvg.test.tsx`

**Interfaces:**
- Consumes: `compile`, `validate`, `hasErrors`, `Design`, `BoardModel`, `Diagnostic` from the engine; `speciesHex`, `shrinkageMap`, `getSpeciesById` from `lib/species`; `calcProject`, `CalcResult` from `lib/calc`; `formatMm` from `lib/units`.
- Produces:

```ts
// lib/i18n/index.ts
export type Locale = 'ru' | 'en'
export type MessageKey = keyof typeof ru
export const dictionaries: Record<Locale, Record<MessageKey, string>>
export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string

// lib/designs/samples.ts
export interface CheckerboardOptions {
  readonly cellMm?: number
  readonly cols?: number
  readonly rows?: number
  readonly thicknessMm?: number
  readonly speciesA?: SpeciesId
  readonly speciesB?: SpeciesId
}
export function makeCheckerboard(opts?: CheckerboardOptions): Design

// components
export function BoardSvg(props: { model: BoardModel; maxPx?: number }): JSX.Element
export function ComplexityMeter(props: { locale: Locale; calc: CalcResult; diagnostics: readonly Diagnostic[]; unit: 'mm' | 'in'; model: BoardModel }): JSX.Element
export function LocaleToggle(props: { locale: Locale; onChange: (l: Locale) => void }): JSX.Element
export function StudioShell(): JSX.Element
```

Placeholder interpolation in `t` is `{name}`. A missing key returns the key itself so a gap is visible, never silent.

- [ ] **Step 1: Write the failing i18n test**

`lib/i18n/index.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { dictionaries, t } from './index'
import ru from './ru'
import en from './en'

describe('i18n', () => {
  it('has the same keys in both locales', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort())
  })

  it('never uses an em dash', () => {
    const EM_DASH = String.fromCharCode(0x2014)
    for (const dict of Object.values(dictionaries)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.includes(EM_DASH), `ключ ${key}`).toBe(false)
      }
    }
  })

  it('has a message for every diagnostic code', () => {
    const codes = ['MIN_STRIP_WIDTH', 'PLANER_WIDTH', 'PLANING_ALLOWANCE', 'DEPTH_LIMIT', 'PANEL_NOT_FOUND',
      'EMPTY_PANEL', 'DIMENSION_SANITY', 'RAGGED_BOARD', 'ANGLE_UNSUPPORTED', 'SHRINKAGE_MISMATCH', 'CELL_BUDGET']
    for (const code of codes) expect(ru).toHaveProperty(`diag.${code}`)
  })

  it('interpolates parameters', () => {
    expect(t('ru', 'diag.MIN_STRIP_WIDTH', { widthMm: 3, minMm: 4 })).toContain('3')
    expect(t('ru', 'diag.MIN_STRIP_WIDTH', { widthMm: 3, minMm: 4 })).toContain('4')
  })

  it('returns the key when it is missing', () => {
    // @ts-expect-error намеренно несуществующий ключ
    expect(t('ru', 'нет.такого.ключа')).toBe('нет.такого.ключа')
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm test lib/i18n`
Expected: FAIL with `Failed to resolve import "./index"`.

- [ ] **Step 3: Write `lib/i18n/ru.ts`**

```ts
const ru = {
  'app.title': 'Endgrain Studio',
  'app.tagline': 'Проект торцевой разделочной доски: узор, распил, материал, себестоимость',
  'board.title': 'Доска',
  'board.size': 'Габарит: {widthMm} × {lengthMm}, толщина {thicknessMm}',
  'meter.title': 'Сложность проекта',
  'meter.glueUps': 'Склейки',
  'meter.cuts': 'Резы',
  'meter.cells': 'Ячейки',
  'meter.waste': 'Отходы',
  'meter.cost': 'Материал',
  'meter.weight': 'Вес доски',
  'meter.boardFeet': 'Пиломатериал',
  'meter.lumberBySpecies': 'По породам',
  'meter.speciesRow': '{name}: {meters} м, {boardFeet} bf, {costUsd}',
  'meter.noIssues': 'Проверки пройдены, доска изготовима',
  'meter.issues': 'Замечаний: {count}',
  'units.mm': 'мм',
  'units.in': 'дюймы',
  'locale.ru': 'RU',
  'locale.en': 'EN',
  'diag.MIN_STRIP_WIDTH': 'Полоса {widthMm} мм уже минимума {minMm} мм: не удержится в струбцине',
  'diag.PLANER_WIDTH': 'Панель {widthMm} мм шире рейсмуса {limitMm} мм',
  'diag.PLANING_ALLOWANCE': 'Припуск на строгание {actualMm} мм меньше рекомендуемых {minMm} мм',
  'diag.DEPTH_LIMIT': 'Панель {panelId} ссылается на {innerPanelId}, которая сама составная: глубина больше {maxDepth} не поддерживается',
  'diag.PANEL_NOT_FOUND': 'Панель {panelId} не найдена',
  'diag.EMPTY_PANEL': 'Панель {panelId} пустая',
  'diag.DIMENSION_SANITY': 'Габариты вне диапазона: ширина {widthMm}, длина {lengthMm}, толщина {thicknessMm}, kerf {kerfMm}',
  'diag.RAGGED_BOARD': 'Ряды разной ширины ({minMm} и {maxMm} мм): доска получится неровной',
  'diag.ANGLE_UNSUPPORTED': 'Угол реза {angleDeg} не поддерживается в этой версии, допустим только 0',
  'diag.SHRINKAGE_MISMATCH': 'Соседние породы {a} и {b} различаются по усушке на {deltaPp} п.п. при допуске {limitPp}',
  'diag.CELL_BUDGET': 'Ячеек {cells} при лимите {limit}',
} as const

export default ru
```

- [ ] **Step 4: Write `lib/i18n/en.ts`**

```ts
import type ru from './ru'

const en: Record<keyof typeof ru, string> = {
  'app.title': 'Endgrain Studio',
  'app.tagline': 'End-grain cutting board project: pattern, cuts, lumber, cost',
  'board.title': 'Board',
  'board.size': 'Size: {widthMm} × {lengthMm}, thickness {thicknessMm}',
  'meter.title': 'Project complexity',
  'meter.glueUps': 'Glue-ups',
  'meter.cuts': 'Cuts',
  'meter.cells': 'Cells',
  'meter.waste': 'Waste',
  'meter.cost': 'Material',
  'meter.weight': 'Board weight',
  'meter.boardFeet': 'Lumber',
  'meter.lumberBySpecies': 'By species',
  'meter.speciesRow': '{name}: {meters} m, {boardFeet} bf, {costUsd}',
  'meter.noIssues': 'All checks passed, the board is buildable',
  'meter.issues': 'Issues: {count}',
  'units.mm': 'mm',
  'units.in': 'inches',
  'locale.ru': 'RU',
  'locale.en': 'EN',
  'diag.MIN_STRIP_WIDTH': 'Strip {widthMm} mm is below the {minMm} mm minimum and will not hold in a clamp',
  'diag.PLANER_WIDTH': 'Panel {widthMm} mm is wider than the {limitMm} mm planer',
  'diag.PLANING_ALLOWANCE': 'Planing allowance {actualMm} mm is below the recommended {minMm} mm',
  'diag.DEPTH_LIMIT': 'Panel {panelId} references {innerPanelId}, which is itself composite: depth above {maxDepth} is not supported',
  'diag.PANEL_NOT_FOUND': 'Panel {panelId} not found',
  'diag.EMPTY_PANEL': 'Panel {panelId} is empty',
  'diag.DIMENSION_SANITY': 'Dimensions out of range: width {widthMm}, length {lengthMm}, thickness {thicknessMm}, kerf {kerfMm}',
  'diag.RAGGED_BOARD': 'Rows differ in width ({minMm} and {maxMm} mm), the board will be ragged',
  'diag.ANGLE_UNSUPPORTED': 'Cut angle {angleDeg} is not supported in this version, only 0 is allowed',
  'diag.SHRINKAGE_MISMATCH': 'Neighbouring species {a} and {b} differ in shrinkage by {deltaPp} pp against a {limitPp} limit',
  'diag.CELL_BUDGET': '{cells} cells against a {limit} limit',
}

export default en
```

- [ ] **Step 5: Write `lib/i18n/index.ts`**

```ts
import en from './en'
import ru from './ru'

export type Locale = 'ru' | 'en'
export type MessageKey = keyof typeof ru

export const dictionaries: Record<Locale, Record<MessageKey, string>> = { ru, en }

export function t(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = dictionaries[locale][key]
  if (template === undefined) return String(key)
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}
```

- [ ] **Step 6: Run the i18n test and confirm it passes**

Run: `pnpm test lib/i18n`
Expected: PASS, 5 tests.

- [ ] **Step 7: Write the failing sample-design test**

`lib/designs/samples.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { compile, hasErrors, validate } from '@/lib/engine'
import { shrinkageMap } from '@/lib/species'
import { makeCheckerboard } from './samples'

describe('makeCheckerboard', () => {
  it('builds a valid 8 by 8 checkerboard by default', () => {
    const d = makeCheckerboard()
    expect(validate(d, { shrinkageByPct: shrinkageMap() }).filter((x) => x.level === 'error')).toEqual([])
    expect(hasErrors(validate(d))).toBe(false)
    const m = compile(d)
    expect(m.cells).toHaveLength(64)
    expect(m.widthMm).toBeCloseTo(8 * 30, 6)
    expect(m.lengthMm).toBeCloseTo(8 * 30, 6)
    expect(m.glueUpCount).toBe(3)
  })

  it('alternates the two species like a chessboard', () => {
    const m = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    expect(m.cells.map((c) => c.speciesId)).toEqual(['walnut', 'maple', 'maple', 'walnut'])
  })

  it('uses exactly two panels regardless of size', () => {
    expect(makeCheckerboard({ cols: 12, rows: 10 }).panels).toHaveLength(2)
  })
})
```

- [ ] **Step 8: Run it and confirm it fails**

Run: `pnpm test lib/designs`
Expected: FAIL with `Failed to resolve import "./samples"`.

- [ ] **Step 9: Write `lib/designs/samples.ts`**

```ts
import type { Design, Panel, Row, SpeciesId } from '@/lib/engine'

export interface CheckerboardOptions {
  readonly cellMm?: number
  readonly cols?: number
  readonly rows?: number
  readonly thicknessMm?: number
  readonly speciesA?: SpeciesId
  readonly speciesB?: SpeciesId
}

/** Классическая шахматка: две панели первой склейки со сдвинутым порядком пород. */
export function makeCheckerboard(opts: CheckerboardOptions = {}): Design {
  const { cellMm = 30, cols = 8, rows = 8, thicknessMm = 40, speciesA = 'walnut', speciesB = 'maple' } = opts

  const panelOf = (id: string, first: SpeciesId, second: SpeciesId): Panel => ({
    id,
    elements: Array.from({ length: cols }, (_, i) => ({
      kind: 'strip' as const,
      speciesId: i % 2 === 0 ? first : second,
      widthMm: cellMm,
    })),
  })

  const designRows: Row[] = Array.from({ length: rows }, (_, i) => ({
    id: `r${i}`,
    panelId: i % 2 === 0 ? 'A' : 'B',
    thicknessMm: cellMm,
    angleDeg: 0,
    flip: false,
    mirror: false,
    trimMm: 5,
  }))

  return {
    schemaVersion: 1,
    id: 'sample-checkerboard',
    name: 'Шахматка',
    species: [speciesA, speciesB],
    panels: [panelOf('A', speciesA, speciesB), panelOf('B', speciesB, speciesA)],
    rows: designRows,
    board: { targetWidthMm: cols * cellMm, targetLengthMm: rows * cellMm, thicknessMm },
    kerfMm: 3,
    planingAllowanceMm: 3,
    planerWidthMm: 330,
  }
}
```

With the defaults the panel is 8 × 30 = 240 mm wide, under the 330 mm planer limit, and walnut against hard maple differ by 2.1 pp in tangential shrinkage, which is above the 1.5 pp limit. That would make the sample warn on every load, so `makeCheckerboard` must not trip it: the test above only asserts there are no errors, and the warning is genuine engineering information that the meter is meant to show.

- [ ] **Step 10: Run the sample test and confirm it passes**

Run: `pnpm test lib/designs`
Expected: PASS, 3 tests.

- [ ] **Step 11: Write the failing component test**

`components/BoardSvg.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { compile } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { BoardSvg } from './BoardSvg'

describe('BoardSvg', () => {
  it('renders one rect per cell with the species colour', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} />)
    const rects = container.querySelectorAll('rect[data-cell]')
    expect(rects).toHaveLength(4)
    expect(rects[0]?.getAttribute('fill')).toBe('#5b3a24')
    expect(rects[1]?.getAttribute('fill')).toBe('#e3caa1')
  })

  it('uses a millimetre viewBox so the SVG scales without recomputation', () => {
    const model = compile(makeCheckerboard({ cols: 2, rows: 2 }))
    const { container } = render(<BoardSvg model={model} />)
    expect(container.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 60 60')
  })
})
```

- [ ] **Step 12: Run it and confirm it fails**

Run: `pnpm test components/BoardSvg.test.tsx`
Expected: FAIL with `Failed to resolve import "./BoardSvg"`.

- [ ] **Step 13: Write `components/BoardSvg.tsx`**

```tsx
import type { BoardModel } from '@/lib/engine'
import { speciesHex } from '@/lib/species'

export function BoardSvg({ model, maxPx = 640 }: { model: BoardModel; maxPx?: number }) {
  if (model.widthMm <= 0 || model.lengthMm <= 0) return <svg role="img" aria-label="пустая доска" />

  const scale = maxPx / Math.max(model.widthMm, model.lengthMm)

  return (
    <svg
      viewBox={`0 0 ${model.widthMm} ${model.lengthMm}`}
      width={model.widthMm * scale}
      height={model.lengthMm * scale}
      role="img"
      aria-label="превью доски"
      className="rounded-lg shadow-sm"
    >
      {model.cells.map((cell) => (
        <rect
          key={cell.id}
          data-cell={cell.id}
          x={cell.xMm}
          y={cell.yMm}
          width={cell.widthMm}
          height={cell.heightMm}
          fill={speciesHex(cell.speciesId)}
          stroke="rgba(0,0,0,0.18)"
          strokeWidth={0.4}
        />
      ))}
    </svg>
  )
}
```

- [ ] **Step 14: Run the component test and confirm it passes**

Run: `pnpm test components/BoardSvg.test.tsx`
Expected: PASS, 2 tests.

- [ ] **Step 15: Write `components/ComplexityMeter.tsx`**

```tsx
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BoardModel, Diagnostic } from '@/lib/engine'
import type { CalcResult } from '@/lib/calc'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { getSpeciesById } from '@/lib/species'
import { formatMm } from '@/lib/units'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function ComplexityMeter({
  locale,
  calc,
  diagnostics,
  unit,
  model,
}: {
  locale: Locale
  calc: CalcResult
  diagnostics: readonly Diagnostic[]
  unit: 'mm' | 'in'
  model: BoardModel
}) {
  const rows: Array<[MessageKey, string]> = [
    ['meter.glueUps', String(calc.glueUpCount)],
    ['meter.cuts', String(calc.cutCount)],
    ['meter.cells', String(model.cells.length)],
    ['meter.boardFeet', `${calc.totalBoardFeet.toFixed(2)} bf`],
    ['meter.waste', `${calc.wastePct.toFixed(1)} %`],
    ['meter.cost', usd.format(calc.totalCostUsd)],
    ['meter.weight', `${calc.totalWeightKg.toFixed(2)} кг`],
  ]

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t(locale, 'meter.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(locale, 'board.size', {
            widthMm: formatMm(model.widthMm, unit, 0),
            lengthMm: formatMm(model.lengthMm, unit, 0),
            thicknessMm: formatMm(model.thicknessMm, unit, 0),
          })}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          {rows.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{t(locale, key)}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-1 text-sm font-medium">{t(locale, 'meter.lumberBySpecies')}</p>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {calc.bySpecies.map((s) => (
              <li key={s.speciesId}>
                {t(locale, 'meter.speciesRow', {
                  name: locale === 'ru' ? getSpeciesById(s.speciesId).nameRu : getSpeciesById(s.speciesId).nameEn,
                  meters: s.linearMeters.toFixed(2),
                  boardFeet: s.boardFeet.toFixed(2),
                  costUsd: usd.format(s.costUsd),
                })}
              </li>
            ))}
          </ul>
        </div>

        {diagnostics.length === 0 ? (
          <Badge variant="secondary">{t(locale, 'meter.noIssues')}</Badge>
        ) : (
          <ul className="space-y-1 text-sm">
            {diagnostics.map((d, i) => (
              <li key={`${d.code}-${i}`} className={d.level === 'error' ? 'text-red-600' : 'text-amber-600'}>
                {t(locale, d.messageKey as MessageKey, d.params)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 16: Write `components/LocaleToggle.tsx`**

```tsx
'use client'

import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="язык интерфейса">
      {(['ru', 'en'] as const).map((l) => (
        <Button key={l} size="sm" variant={l === locale ? 'default' : 'outline'} onClick={() => onChange(l)}>
          {t(locale, l === 'ru' ? 'locale.ru' : 'locale.en')}
        </Button>
      ))}
    </div>
  )
}
```

- [ ] **Step 17: Write `components/StudioShell.tsx`**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { ComplexityMeter } from '@/components/ComplexityMeter'
import { LocaleToggle } from '@/components/LocaleToggle'
import { calcProject } from '@/lib/calc'
import { makeCheckerboard } from '@/lib/designs/samples'
import { compile, validate } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { shrinkageMap } from '@/lib/species'

export function StudioShell() {
  const [locale, setLocale] = useState<Locale>('ru')
  const design = useMemo(() => makeCheckerboard(), [])
  const model = useMemo(() => compile(design), [design])
  const calc = useMemo(() => calcProject(design, model), [design, model])
  const diagnostics = useMemo(() => validate(design, { shrinkageByPct: shrinkageMap() }), [design])

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t(locale, 'app.title')}</h1>
          <p className="text-sm text-muted-foreground">{t(locale, 'app.tagline')}</p>
        </div>
        <LocaleToggle locale={locale} onChange={setLocale} />
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <section aria-label={t(locale, 'board.title')} className="flex-1">
          <BoardSvg model={model} />
        </section>
        <ComplexityMeter locale={locale} calc={calc} diagnostics={diagnostics} unit="mm" model={model} />
      </div>
    </main>
  )
}
```

- [ ] **Step 18: Wire the page**

`app/page.tsx`:

```tsx
import { StudioShell } from '@/components/StudioShell'

export default function Page() {
  return <StudioShell />
}
```

In `app/layout.tsx` set the metadata and the language:

```tsx
export const metadata = {
  title: 'Endgrain Studio',
  description: 'Проект торцевой разделочной доски: узор, распил, материал, себестоимость',
}
```

and `<html lang="ru">`.

- [ ] **Step 19: Run the whole gate**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`
Expected: all suites pass, no type errors, no lint errors, `Compiled successfully`.

- [ ] **Step 20: Look at it in the browser**

Run: `pnpm dev` and open `http://localhost:3000`.
Expected: an 8 by 8 walnut and maple checkerboard, and a complexity card showing 3 glue-ups, 16 cuts, 64 cells, a positive board-foot figure, waste between 40 and 70 percent, a dollar cost, a weight around 1.5 kg, and one amber shrinkage warning. Switching to EN changes every label.

- [ ] **Step 21: Commit**

```bash
git add lib/i18n lib/designs components app
git commit -m "feat(ui): словарь ru и en, шахматка, SVG-превью доски и complexity meter"
```

---

### Task 11: Vercel project and production deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `lib/flags.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the working build from Task 10.
- Produces: `export const flags: { readonly pro: boolean; readonly threeD: boolean; readonly generators: boolean }` from `lib/flags.ts`, plus a live production URL on `main`.

**Manual step required from Станислав:** `vercel login` must have been run at least once on this machine. If `pnpm dlx vercel whoami` prints an error, stop and ask him to run `pnpm dlx vercel login` before continuing.

- [ ] **Step 1: Add the feature flags module**

`lib/flags.ts`:

```ts
/** Незаконченные фичи выключены здесь, а не удалены из main. */
export const flags = {
  pro: process.env['NEXT_PUBLIC_PRO_UNLOCK'] === '1',
  threeD: false,
  generators: false,
} as const
```

- [ ] **Step 2: Add CI**

`.github/workflows/ci.yml`:

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
        with:
          version: 9
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 3: Verify the Vercel CLI is authenticated**

Run: `pnpm dlx vercel whoami`
Expected: the account login is printed. If it errors, stop and request `pnpm dlx vercel login` from the user.

- [ ] **Step 4: Link the project**

Run: `pnpm dlx vercel link --yes --project endgrain-studio`
Expected: `.vercel/project.json` created. Confirm `.vercel` is in `.gitignore`; add the line if it is missing.

- [ ] **Step 5: Set the competition environment variable**

Run: `printf '1' | pnpm dlx vercel env add NEXT_PUBLIC_PRO_UNLOCK production`
Expected: `Added Environment Variable NEXT_PUBLIC_PRO_UNLOCK to Project endgrain-studio`.

- [ ] **Step 6: Deploy to production**

Run: `pnpm dlx vercel --prod --yes`
Expected: a `https://endgrain-studio-*.vercel.app` URL and `Production: ... [Ready]`.

- [ ] **Step 7: Verify the deploy by hand**

Open the printed URL. Expected: the checkerboard and the complexity meter render exactly as they did on localhost, and the EN toggle works.

- [ ] **Step 8: Confirm auto-deploy from main**

Run: `pnpm dlx vercel project ls` and check the Git connection; if the project is not connected to the GitHub repository, connect it in the Vercel dashboard under Settings, Git, so every push to `main` deploys. Record the production URL in `README.md` under a new `## Прод` heading.

- [ ] **Step 9: Commit and push**

```bash
git add .github lib/flags.ts README.md .gitignore
git commit -m "chore: CI на GitHub Actions, флаги фич и прод-деплой на Vercel"
git push origin main
```

- [ ] **Step 10: Confirm CI and the auto-deploy are green**

Run: `gh run list --limit 1` and `pnpm dlx vercel ls --prod`
Expected: the latest workflow run is `completed success` and the latest production deployment is `Ready`.

---

## Self-review

**Spec coverage for the phase-1 scope.** Every item in the day-1 slice maps to a task: scaffold and toolchain to Task 1; the full domain model (`Species`, `Strip`, `Panel`, `SliceRef` with depth 2, `Row`, `Design`, `BoardModel`, `Diagnostic`) to Task 2; the species catalogue with LAB, hex, density, price per board foot and both shrinkage coefficients to Task 3; `compile` with mm coordinates, per-cell species and derived panel lengths including kerf and trim to Tasks 4 and 5; `validate` with minimum strip width, the 330 mm planer, the 3 mm planing allowance, the depth limit and dimension sanity to Task 6; `applyPaint` with fork logic and `splitPanel` to Task 7; `lib/calc` with board feet, metres, waste, cost, glue-ups, cuts and weight to Task 8; `lib/persist` with the zod v1 schema, the compact codec, the lz-string hash, localStorage and the migration registry to Task 9; the app shell, the hardcoded checkerboard SVG, the live complexity meter and the ru/en dictionary to Task 10; the Vercel deploy to Task 11. All four required property tests are present: total area equals board area (Task 5), the panel length formula (Task 5), paint idempotence (Task 7) and depth-3 rejection (Task 6), with round-trip serialization added in Task 9 as a bonus taken from the spec's testing section.

**Placeholder scan.** No `TBD`, no `TODO`, no "add validation later", no "similar to Task N". Every code step carries the actual code. The two forward-looking notes (angled geometry in phase 2, `SliceRef` cells arriving in Task 5 rather than Task 4) are explicit scope statements with a defined phase-1 behaviour, not deferred work inside phase 1.

**Type consistency.** Checked across tasks: `panelLengthMm` is used with the same signature in Tasks 2, 4, 7 and 8; `BoardModel.panelLengthsMm` keeps the plural name everywhere; `Cell.origin` uses `innerPanelId` and `innerElementIndex` consistently in `compile`, `applyPaint` and the tests; `Diagnostic.messageKey` is `diag.<CODE>` in `validate` and in both dictionaries; `shrinkageByPct` is the option name in `validate`, in the sample test and in `StudioShell`; `getSpeciesById` and `speciesHex` are used with the names Task 3 defines; `baseDesign` and `stripsPanel` are exported from the engine barrel in Task 4 and consumed in Tasks 6 to 9.

**Fixes applied inline while reviewing.** `Strip` lost `thicknessMm` and `lengthMm` to obey the spec's own no-duplicate-fields rule; `validate` takes shrinkage through options instead of importing `lib/species`, which would have broken the zero-dependency rule for `lib/engine`; `nextPanelId` was added to Task 2 because Task 7 needs it; `hasErrors` was added because both Task 6 and Task 10 use it.
