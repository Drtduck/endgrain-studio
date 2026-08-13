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
 * Полезная длина углового среза вдоль реза, мм: параллелограмм-заготовка держит полную
 * ширину t только на части своей диагонали - правый край сдвинут относительно левого на
 * t·tan φ (см. expandSliceRef в compile.ts), поэтому на концах остаются треугольные "недорезы",
 * которых не хватает на полную толщину. Полезная длина = диагональ минус этот сдвиг:
 * W / cos φ - t · tan φ. При φ = 0 совпадает с sliceLengthMm (сдвига нет).
 */
export function usableSliceLengthMm(sourceWidthMm: number, thicknessMm: number, angleDeg: number): number {
  const phi = toRad(angleDeg)
  return sourceWidthMm / Math.cos(phi) - thicknessMm * Math.abs(Math.tan(phi))
}

/**
 * Резы одной панели в порядке фактического изготовления: сгруппированы по углу (все резы
 * одного угла подряд, салазки настраиваются один раз на группу), группы идут по возрастанию
 * угла. Array.prototype.sort стабилен, поэтому порядок внутри группы (совпадающий угол)
 * не меняется - важно только относительно ЧЕГО считать клинья на переходах между группами.
 */
function sortedByAngle(slices: readonly PanelSlice[]): PanelSlice[] {
  return [...slices].sort((a, b) => a.angleDeg - b.angleDeg)
}

/**
 * Торцевые клинья на переходах между настройками угла, в порядке отсортированной по углу
 * последовательности резов. Первый ненулевой угол в последовательности даёт один клин-
 * треугольник (катеты W и W·|tan φ|, площадь W²·|tan φ| / 2): режется край щита под этим
 * углом впервые, отход только с одной стороны. Каждый следующий переход к другому углу
 * (включая переход обратно к 0°) даёт вдвое больше - клин нужно снять с ОБЕИХ сторон стыка
 * (снять предыдущий угол и вырезать новый), длина 2·W·|tan φ|, площадь W²·|tan φ|.
 * При единственном ненулевом угле это даёт ровно старую (дораспределённую) формулу -
 * поведение при одном угле не меняется, расхождение проявляется только при 2+ различных углах.
 */
function angledTransitionWasteMm(widthMm: number, angles: readonly number[]): { lengthMm: number; areaMm2: number } {
  const distinctSorted = [...new Set(angles)].sort((a, b) => a - b)
  let lengthMm = 0
  let areaMm2 = 0
  distinctSorted.forEach((angleDeg, index) => {
    const wedgeMm = widthMm * Math.abs(Math.tan(toRad(angleDeg)))
    const factor = index === 0 ? 1 : 2
    lengthMm += factor * wedgeMm
    areaMm2 += (factor * widthMm * wedgeMm) / 2
  })
  return { lengthMm, areaMm2 }
}

/**
 * Площадь торцевых клиньев, теряемых на щите panelId при угловых резах, мм². Считается по
 * переходам фактической последовательности резов (сгруппированных по углу, см. sortedByAngle
 * и angledTransitionWasteMm) - не по количеству различных углов напрямую, потому что каждый
 * переход между углами (кроме самого первого) стоит вдвое дороже одного клина.
 */
export function angledWasteMm2(design: Design, panelId: PanelId): number {
  const slices = sortedByAngle(slicesOfPanel(design, panelId))
  const widthMm = slices[0]?.sourceWidthMm ?? 0
  return angledTransitionWasteMm(
    widthMm,
    slices.map((s) => s.angleDeg),
  ).areaMm2
}

/**
 * Длина панели первой склейки, мм. Резы берутся в порядке фактического изготовления
 * (сгруппированы по углу, sortedByAngle) - от этого порядка зависит, какой рез "первый"
 * (его kerf не считается) и какие клинья ложатся на переходы между углами.
 * Сумма (толщина среза + припуск на строгание + торцевой припуск) / cos φ, плюс
 * kerf / cos φ между резами (n - 1 штук), плюс торцевые клинья на переходах между углами
 * (angledTransitionWasteMm). При всех φ = 0 сворачивается в сегодняшнюю формулу дословно:
 * cos 0 = 1, деления нет, клиньев нет, kerf * (n - 1) как раньше.
 */
export function panelLengthMm(design: Design, panelId: PanelId): number {
  const slices = sortedByAngle(slicesOfPanel(design, panelId))
  if (slices.length === 0) return 0
  const cut = slices.reduce(
    (sum, s) => sum + (s.thicknessMm + design.planingAllowanceMm + s.trimMm) / Math.cos(toRad(s.angleDeg)),
    0,
  )
  const kerfSum = slices.slice(1).reduce((sum, s) => sum + design.kerfMm / Math.cos(toRad(s.angleDeg)), 0)
  const widthMm = slices[0]?.sourceWidthMm ?? 0
  const wasteLenMm = angledTransitionWasteMm(
    widthMm,
    slices.map((s) => s.angleDeg),
  ).lengthMm
  return cut + kerfSum + wasteLenMm
}

/** Экспорт для lib/export/cutlist.ts: тот же принцип группировки клиньев нужен в отчёте по резам. */
export { sortedByAngle, angledTransitionWasteMm }

export function usageCount(design: Design, panelId: PanelId): number {
  return slicesOfPanel(design, panelId).length
}

export function nextPanelId(design: Design): PanelId {
  let n = design.panels.length + 1
  const taken = new Set(design.panels.map((p) => p.id))
  while (taken.has(`P${n}`)) n += 1
  return `P${n}`
}
