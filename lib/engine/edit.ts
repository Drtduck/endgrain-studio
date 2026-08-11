import { EngineError } from './errors'
import { elementExtentMm, getElement, getPanel, isStrip, nextPanelId, panelLengthMm, slicesOfPanel, usageCount } from './panels'
import type { Cell, Design, Panel, PanelElement, PanelId, SpeciesId } from './types'

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
