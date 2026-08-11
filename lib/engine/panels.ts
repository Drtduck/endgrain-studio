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
