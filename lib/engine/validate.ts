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
  /** Справочник допустимых пород. Когда задан, полосы с неизвестным speciesId помечаются UNKNOWN_SPECIES. */
  readonly knownSpeciesIds?: readonly SpeciesId[]
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
  const knownSpecies = opts.knownSpeciesIds ? new Set(opts.knownSpeciesIds) : undefined

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
        if (knownSpecies && !knownSpecies.has(el.speciesId)) {
          out.push(
            diag(
              'UNKNOWN_SPECIES',
              'error',
              { panelId: panel.id, speciesId: el.speciesId },
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

  const model = compile(design)
  const cellCount = model.cells.length
  if (model.truncated) {
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
