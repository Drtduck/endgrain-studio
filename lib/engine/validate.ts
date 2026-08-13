import { compile } from './compile'
import { angledWasteMm2, elementExtentMm, findPanel, isSliceRef, isStrip, panelLengthMm, panelWidthMm } from './panels'
import {
  ANGLE_WASTE_WARN_PCT,
  BOARD_MAX_MM,
  BOARD_MIN_MM,
  GEOM_EPS_MM,
  MAX_CELLS,
  MAX_SLICE_ANGLE_DEG,
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

interface ShrinkPairEntry {
  readonly a: string
  readonly b: string
  readonly deltaPp: number
  count: number
}

export function validate(design: Design, opts: ValidateOptions = {}): Diagnostic[] {
  const out: Diagnostic[] = []
  const { board } = design
  const knownSpecies = opts.knownSpeciesIds ? new Set(opts.knownSpeciesIds) : undefined
  /** Дедуп SHRINKAGE_MISMATCH на уровне всего проекта: одна запись на неупорядоченную пару пород. */
  const shrinkPairs = new Map<string, ShrinkPairEntry>()

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

      const angleInRange = Number.isFinite(el.angleDeg) && Math.abs(el.angleDeg) <= MAX_SLICE_ANGLE_DEG
      if (!angleInRange) {
        out.push(
          diag(
            'ANGLE_RANGE',
            'error',
            { angleDeg: el.angleDeg, maxDeg: MAX_SLICE_ANGLE_DEG },
            { panelId: panel.id, elementIndex },
          ),
        )
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

      // Срез, снятый с inner под углом el.angleDeg, вклеивается колонкой в panel.id и физически
      // обязан покрывать всю длину panel.id (иначе колонка окажется короче доски). При phi=0 эта
      // проверка существовала неявно (щит просто должен был совпасть по ширине), угол делает
      // срез длиннее (1/cos), так что чаще будет ловить старые документы, а не новые.
      if (angleInRange) {
        const sourceWidthMm = panelWidthMm(inner)
        const sliceLenMm = sourceWidthMm / Math.cos((el.angleDeg * Math.PI) / 180)
        const requiredLenMm = panelLengthMm(design, panel.id)
        if (sliceLenMm < requiredLenMm - GEOM_EPS_MM) {
          out.push(
            diag(
              'SLICE_TOO_SHORT',
              'error',
              { sliceLengthMm: sliceLenMm, requiredMm: requiredLenMm },
              { panelId: panel.id, elementIndex },
            ),
          )
        }
      }
    })

    // Отход на торцевые клинья при угловых резах, снятых С этой панели (panel.id как источник).
    const wasteMm2 = angledWasteMm2(design, panel.id)
    if (wasteMm2 > 0) {
      const panelAreaMm2 = widthMm * panelLengthMm(design, panel.id)
      if (panelAreaMm2 > 0 && (wasteMm2 / panelAreaMm2) * 100 > ANGLE_WASTE_WARN_PCT) {
        out.push(
          diag(
            'ANGLE_WASTE',
            'warning',
            { panelId: panel.id, wastePct: Math.round((wasteMm2 / panelAreaMm2) * 1000) / 10, limitPct: ANGLE_WASTE_WARN_PCT },
            { panelId: panel.id },
          ),
        )
      }
    }

    const shrink = opts.shrinkageByPct
    if (shrink) {
      for (let i = 1; i < panel.elements.length; i += 1) {
        const a = panel.elements[i - 1]
        const b = panel.elements[i]
        if (!a || !b || !isStrip(a) || !isStrip(b)) continue
        const sa = shrink[a.speciesId]
        const sb = shrink[b.speciesId]
        if (sa === undefined || sb === undefined) continue
        const delta = Math.abs(sa - sb)
        if (delta > SHRINKAGE_DELTA_PP) {
          const [pairA, pairB] = [a.speciesId, b.speciesId].sort()
          const key = `${pairA}|${pairB}`
          const existing = shrinkPairs.get(key)
          if (existing) {
            existing.count += 1
          } else if (pairA !== undefined && pairB !== undefined) {
            shrinkPairs.set(key, { a: pairA, b: pairB, deltaPp: Math.round(delta * 10) / 10, count: 1 })
          }
        }
      }
    }
  }

  for (const entry of shrinkPairs.values()) {
    out.push(
      diag('SHRINKAGE_MISMATCH', 'warning', {
        a: entry.a,
        b: entry.b,
        deltaPp: entry.deltaPp,
        limitPp: SHRINKAGE_DELTA_PP,
        count: entry.count,
      }),
    )
  }

  const rowWidths: number[] = []
  for (const row of design.rows) {
    if (row.angleDeg !== 0) {
      out.push(diag('ANGLE_ROW_UNSUPPORTED', 'error', { angleDeg: row.angleDeg }, { rowId: row.id }))
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
