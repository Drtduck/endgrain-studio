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
  let cursorMm = rowTopMm - ((((-ref.offsetMm) % cycleMm) + cycleMm) % cycleMm)
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
      } else {
        cells.push(...expandSliceRef(design, el, row, panel.id, index, xMm, yMm))
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
