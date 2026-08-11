import { elementExtentMm, findPanel, isStrip, panelLengthMm, panelWidthMm, slicesOfPanel } from './panels'
import { GEOM_EPS_MM, MAX_CELLS, type BoardModel, type Cell, type Design, type PanelId, type Row, type SliceRef } from './types'

/** Мутируемый бюджет ячеек, общий на весь compile: останавливает генерацию до OOM. */
interface CellBudget {
  remaining: number
  truncated: boolean
}

function expandSliceRef(
  design: Design,
  ref: SliceRef,
  row: Row,
  outerPanelId: PanelId,
  elementIndex: number,
  xMm: number,
  rowTopMm: number,
  budget: CellBudget,
  out: Cell[],
): void {
  const inner = findPanel(design, ref.panelId)
  if (!inner) return
  const strips = inner.elements.map((el, index) => ({ el, index })).filter((e) => isStrip(e.el))
  if (strips.length !== inner.elements.length || strips.length === 0) return // глубина 3 или пустая панель

  const ordered = row.flip ? [...strips].reverse() : strips
  const cycleMm = ordered.reduce((sum, e) => sum + elementExtentMm(e.el), 0)
  if (cycleMm <= GEOM_EPS_MM) return

  const rowBottomMm = rowTopMm + row.thicknessMm
  let cursorMm = rowTopMm - ((((-ref.offsetMm) % cycleMm) + cycleMm) % cycleMm)

  for (let k = 0; cursorMm < rowBottomMm - GEOM_EPS_MM; k += 1) {
    if (budget.remaining <= 0) {
      budget.truncated = true
      return
    }
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
      budget.remaining -= 1
    }
    cursorMm += h
  }
}

export function compile(design: Design): BoardModel {
  const cells: Cell[] = []
  const budget: CellBudget = { remaining: MAX_CELLS, truncated: false }
  let yMm = 0
  let widthMm = 0

  rows: for (const row of design.rows) {
    const panel = findPanel(design, row.panelId)
    if (!panel) continue

    widthMm = Math.max(widthMm, panelWidthMm(panel))

    const ordered = panel.elements.map((el, index) => ({ el, index }))
    if (row.mirror) ordered.reverse()

    let xMm = 0
    for (const { el, index } of ordered) {
      const extent = elementExtentMm(el)
      if (budget.remaining <= 0) {
        budget.truncated = true
        break rows
      }
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
        budget.remaining -= 1
      } else {
        expandSliceRef(design, el, row, panel.id, index, xMm, yMm, budget, cells)
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
    truncated: budget.truncated,
  }
}
