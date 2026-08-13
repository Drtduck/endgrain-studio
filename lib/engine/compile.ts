import { clipHalfPlane, polygonBbox, rectPoly, type Pt } from './geometry'
import { elementExtentMm, findPanel, isStrip, panelLengthMm, panelWidthMm, slicesOfPanel } from './panels'
import {
  GEOM_EPS_MM,
  MAX_CELLS,
  type BoardModel,
  type Cell,
  type Design,
  type Panel,
  type PanelId,
  type Row,
  type RowId,
  type SliceRef,
} from './types'

/** Градусы в радианы. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Вертикальная полоса одного ряда доски: верхняя граница и высота, мм. Используется для меток рядов в UI. */
export interface RowBand {
  readonly id: RowId
  readonly topMm: number
  readonly heightMm: number
}

/** Горизонтальная полоса одной колонки доски: левая граница и ширина, мм. Используется для меток колонок в UI. */
export interface ColBand {
  readonly leftMm: number
  readonly widthMm: number
}

/**
 * Границы рядов сверху вниз: тот же обход, что и compile, но без геометрии ячеек.
 * Ряды со ссылкой на несуществующую панель пропускаются (как и в compile), поэтому
 * длина результата может быть меньше design.rows.length, а нумерация в UI идёт по этому списку.
 */
export function rowBandsMm(design: Design): RowBand[] {
  const out: RowBand[] = []
  let yMm = 0
  for (const row of design.rows) {
    const panel = findPanel(design, row.panelId)
    if (!panel) continue
    out.push({ id: row.id, topMm: yMm, heightMm: row.thicknessMm })
    yMm += row.thicknessMm
  }
  return out
}

/**
 * Границы колонок слева направо. Колонки строго определены только когда у всех используемых
 * рядами панелей одинаковая раскладка (после правки A с addColumn так и есть). Как честный
 * дефолт для рассинхронизированных случаев берём самую широкую из используемых панелей: так
 * колонки не проваливаются под правым краем узких панелей.
 */
export function colBandsMm(design: Design): ColBand[] {
  const usedPanelIds = new Set<PanelId>()
  for (const row of design.rows) {
    if (findPanel(design, row.panelId)) usedPanelIds.add(row.panelId)
  }
  let widest: Panel | undefined
  let widestWidthMm = -1
  for (const panel of design.panels) {
    if (!usedPanelIds.has(panel.id)) continue
    const widthMm = panelWidthMm(panel)
    if (widthMm > widestWidthMm) {
      widestWidthMm = widthMm
      widest = panel
    }
  }
  if (!widest) return []
  const out: ColBand[] = []
  let xMm = 0
  for (const el of widest.elements) {
    const widthMm = elementExtentMm(el)
    out.push({ leftMm: xMm, widthMm })
    xMm += widthMm
  }
  return out
}

/** Мутируемый бюджет ячеек, общий на весь compile: останавливает генерацию до OOM. */
interface CellBudget {
  remaining: number
  truncated: boolean
}

/**
 * Раскладывает вклеенный срез (SliceRef) как колонку доски. Внутренняя панель ref.panelId
 * повторяется вдоль длины доски (Y) циклически со сдвигом offsetMm. Для прямого реза
 * (ref.angleDeg === 0) граница полос горизонтальна, и этот случай считается ДОСЛОВНО тем же
 * кодом, что и до угловой поддержки, чтобы гарантировать побитовую регрессию (инвариант 1).
 * Для углового реза граница полос это прямая y = cursor + (x - xMm) * sSigned, ячейка -
 * отсечение прямоугольника колонки двумя полуплоскостями этой прямой.
 */
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

  const refFlip = ref.flip ?? false
  const flipXor = row.flip !== refFlip
  const ordered = flipXor ? [...strips].reverse() : strips

  const c = Math.cos(toRad(ref.angleDeg))
  // Знак наклона переворачивается при отражении доски (row.mirror) и при двойном/одинарном
  // флипе среза (row.flip XOR ref.flip): без этого зеркальная доска ехала бы в ту же сторону.
  const signMultiplier = (row.mirror ? -1 : 1) * (flipXor ? -1 : 1)
  const sSigned = Math.tan(toRad(ref.angleDeg)) * signMultiplier

  const cycleMm = ordered.reduce((sum, e) => sum + elementExtentMm(e.el) / c, 0)
  if (cycleMm <= GEOM_EPS_MM) return

  const rowBottomMm = rowTopMm + row.thicknessMm
  const cursorStartMm = rowTopMm - ((((-ref.offsetMm) % cycleMm) + cycleMm) % cycleMm)

  if (sSigned === 0) {
    // Прямой рез: код дословно тот же, что был до угловой поддержки, cursorStartMm выше
    // (сырой ref.offsetMm) используется как есть. При angleDeg = 0 signMultiplier ни на что
    // не влияет (tan 0 = 0), эффективный offset ниже не считается вовсе - это и есть
    // физическая гарантия побитовой регрессии при phi = 0 (инвариант 1).
    let cursorMm = cursorStartMm
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
    return
  }

  // offsetMm в документе выведен генератором для канонической раскладки - без mirror и без
  // флипа (см. lib/generators/angled.ts chevronColumns: base_{k+1} = base_k + t_k * tan(angleDeg_k)).
  // row.mirror и флип среза (row.flip XOR ref.flip) каждый по отдельности меняют фактическую
  // раскладку колонки при рендере, и сырой ref.offsetMm перестаёт совпадать с ней - линия V на
  // стыке соседних колонок расходится (проверено численно: сцепка держится только когда обе
  // поправки применяются независимо друг от друга, а не только при развороте знака наклона).
  // Эффективный offset компенсирует это для рендера, не трогая хранимое значение в документе:
  // - mirror переставляет порядок колонок в ряду (см. `ordered.reverse()` в compile() выше),
  //   поэтому эта колонка сцепляется с соседом по ДРУГУЮ сторону - поправка - фазовый сдвиг
  //   на шаг канонической сцепки в противоположную сторону: + ref.thicknessMm * tan(angleDeg);
  // - флип разворачивает порядок полос внутри самого среза (`ordered` двумя строками выше),
  //   поэтому интервал целиком отражается относительно границ ряда (rowTopMm + rowBottomMm),
  //   а не сдвигается на константу.
  let effectiveOffsetMm = ref.offsetMm
  if (row.mirror) effectiveOffsetMm += ref.thicknessMm * Math.tan(toRad(ref.angleDeg))
  if (flipXor) effectiveOffsetMm = rowTopMm + rowBottomMm - effectiveOffsetMm
  const angledCursorStartMm = rowTopMm - ((((-effectiveOffsetMm) % cycleMm) + cycleMm) % cycleMm)

  // Угловой рез: старт может понадобиться раньше исторического, потому что на правом краю
  // колонки (x = xMm + t) граница сдвинута на t * sSigned относительно левого.
  const shearMm = ref.thicknessMm * Math.abs(sSigned)
  const n = ordered.length
  let k = 0
  let cursorMm = angledCursorStartMm
  while (cursorMm > rowTopMm - shearMm + GEOM_EPS_MM) {
    k -= 1
    const idx = ((k % n) + n) % n
    const entry = ordered[idx]!
    cursorMm -= elementExtentMm(entry.el) / c
  }

  const rect = rectPoly(xMm, rowTopMm, ref.thicknessMm, row.thicknessMm)

  for (; cursorMm < rowBottomMm + shearMm - GEOM_EPS_MM; k += 1) {
    if (budget.remaining <= 0) {
      budget.truncated = true
      return
    }
    const idx = ((k % n) + n) % n
    const entry = ordered[idx]!
    const h = elementExtentMm(entry.el) / c
    const base = cursorMm
    // v(x,y) = y - (x - xMm) * sSigned. Полоса занимает v в [base, base + h].
    // v >= base  =>  sSigned*x - y <= sSigned*xMm - base
    const lower = clipHalfPlane(rect, sSigned, -1, sSigned * xMm - base)
    // v <= base + h  =>  -sSigned*x + y <= (base + h) - sSigned*xMm
    const cellPoly = clipHalfPlane(lower, -sSigned, 1, base + h - sSigned * xMm)
    if (cellPoly.length >= 3 && isStrip(entry.el)) {
      const bbox = polygonBbox(cellPoly)
      out.push({
        id: `${row.id}:${elementIndex}:${k}`,
        xMm: bbox.xMm,
        yMm: bbox.yMm,
        widthMm: bbox.widthMm,
        heightMm: bbox.heightMm,
        poly: cellPoly as readonly Pt[],
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
