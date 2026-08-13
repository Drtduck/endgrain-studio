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

/** Градусы в радианы. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Все срезы, снимаемые с панели panelId: ряды доски плюс SliceRef внутри других панелей,
 * ссылающиеся на panelId как на внутреннюю панель. И то, и другое - срез, снятый с одного
 * и того же щита panelId, поэтому sourceWidthMm (ширина этого щита) у всех записей одна.
 */
export function slicesOfPanel(design: Design, panelId: PanelId): PanelSlice[] {
  const out: PanelSlice[] = []
  const sourcePanel = findPanel(design, panelId)
  const sourceWidthMm = sourcePanel ? panelWidthMm(sourcePanel) : 0
  for (const row of design.rows) {
    if (row.panelId !== panelId) continue
    out.push({
      thicknessMm: row.thicknessMm,
      trimMm: row.trimMm,
      angleDeg: row.angleDeg,
      sourceWidthMm,
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
        sourceWidthMm,
        consumer: { kind: 'sliceRef', panelId: panel.id, elementIndex },
      })
    })
  }
  return out
}

/**
 * Длина заготовки вдоль реза, мм. Прямой рез (φ = 0) даёт саму ширину щита; угловой рез
 * длиннее в 1 / cos φ раз, потому что режется наискось через тот же щит.
 */
export function sliceLengthMm(slice: PanelSlice): number {
  return slice.sourceWidthMm / Math.cos(toRad(slice.angleDeg))
}

/**
 * Площадь торцевых клиньев, теряемых на щите panelId при угловых резах, мм².
 * Один клин на каждый РАЗЛИЧНЫЙ ненулевой угол среди резов этого щита (не на каждый рез:
 * подряд идущие резы одного угла режутся с одной настройки салазок), катеты W и W·|tan φ|.
 */
export function angledWasteMm2(design: Design, panelId: PanelId): number {
  const slices = slicesOfPanel(design, panelId)
  const widthMm = slices[0]?.sourceWidthMm ?? 0
  const angles = new Set(slices.map((s) => s.angleDeg).filter((a) => a !== 0))
  let sum = 0
  for (const angleDeg of angles) sum += (widthMm * widthMm * Math.abs(Math.tan(toRad(angleDeg)))) / 2
  return sum
}

/**
 * Длина панели первой склейки, мм.
 * Сумма (толщина среза + припуск на строгание + торцевой припуск) / cos φ, плюс
 * kerf / cos φ между резами (n - 1 штук), плюс по одному торцевому клину на различный
 * ненулевой угол реза (W · |tan φ|). При всех φ = 0 сворачивается в сегодняшнюю формулу
 * дословно: cos 0 = 1, деления нет, клиньев нет, kerf * (n - 1) как раньше.
 */
export function panelLengthMm(design: Design, panelId: PanelId): number {
  const slices = slicesOfPanel(design, panelId)
  if (slices.length === 0) return 0
  const cut = slices.reduce(
    (sum, s) => sum + (s.thicknessMm + design.planingAllowanceMm + s.trimMm) / Math.cos(toRad(s.angleDeg)),
    0,
  )
  const kerfSum = slices.slice(1).reduce((sum, s) => sum + design.kerfMm / Math.cos(toRad(s.angleDeg)), 0)
  const widthMm = slices[0]?.sourceWidthMm ?? 0
  const angles = new Set(slices.map((s) => s.angleDeg).filter((a) => a !== 0))
  let wasteLenMm = 0
  for (const angleDeg of angles) wasteLenMm += widthMm * Math.abs(Math.tan(toRad(angleDeg)))
  return cut + kerfSum + wasteLenMm
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
