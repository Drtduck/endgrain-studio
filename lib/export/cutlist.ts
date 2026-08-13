import {
  angledWasteMm2,
  compile,
  isSliceRef,
  isStrip,
  panelLengthMm,
  panelWidthMm,
  rowBandsMm,
  sliceLengthMm,
  slicesOfPanel,
  type Design,
  type Panel,
  type PanelId,
  type PanelSlice,
  type RowId,
  type SpeciesId,
} from '@/lib/engine'
import { designDisplayName } from '@/lib/designs/name'
import { plural, t, type Locale, type MessageKey } from '@/lib/i18n'
import { bothUnits, speciesName } from './format'

export interface StripPiece {
  readonly kind: 'strip'
  readonly elementIndex: number
  readonly speciesId: SpeciesId
  readonly widthMm: number
}
export interface SlicePiece {
  readonly kind: 'sliceRef'
  readonly elementIndex: number
  readonly sourcePanelId: PanelId
  readonly thicknessMm: number
  readonly offsetMm: number
  /** Угол реза, под которым срез снят с исходной панели. 0 у прямого среза. */
  readonly angleDeg: number
  /** Зеркалит порядок полос внутри среза перед вклейкой. */
  readonly flip: boolean
}
export type PanelPiece = StripPiece | SlicePiece

export interface SpeciesTally {
  readonly speciesId: SpeciesId
  readonly pieceCount: number
  readonly totalWidthMm: number
}

/** Один поперечный рез панели: либо ряд готовой доски, либо вклейка в другую панель. */
export interface Crosscut {
  readonly thicknessMm: number
  readonly trimMm: number
  /** Угол реза, градусы. 0 у прямого поперечного реза. */
  readonly angleDeg: number
  /** Длина заготовки вдоль реза, мм: sourceWidthMm / cos(angleDeg). Прямой рез даёт ширину щита. */
  readonly lengthMm: number
  /** Номер ряда доски (1-based, нумерация rowBandsMm) либо null для вклейки. */
  readonly rowNumber: number | null
  readonly consumer: PanelSlice['consumer']
}

export interface PanelCutPlan {
  readonly panelId: PanelId
  readonly pieces: readonly PanelPiece[]
  readonly bySpecies: readonly SpeciesTally[]
  /** Ширина склеенного щита, мм. */
  readonly widthMm: number
  /** Длина щита, мм. Уже включает kerf, припуск на строгание и торцевые припуски. */
  readonly lengthMm: number
  /** Толщина строгания щита: board.thicknessMm + planingAllowanceMm. */
  readonly planedThicknessMm: number
  readonly crosscuts: readonly Crosscut[]
  /** Есть ли внутри вклеенные срезы: определяет порядок шагов. */
  readonly hasInlay: boolean
  /** Площадь торцевых клиньев, теряемых на щите при угловых резах, мм². 0 для прямых узоров. */
  readonly angledWasteMm2: number
  /** Длина торцевых клиньев вдоль щита (сумма по различным ненулевым углам резов), мм. */
  readonly endWasteMm: number
}

export interface RowPlan {
  readonly number: number
  readonly rowId: RowId
  readonly panelId: PanelId
  readonly thicknessMm: number
  readonly flip: boolean
  readonly mirror: boolean
  readonly trimMm: number
  readonly topMm: number
}

export interface CutPlan {
  readonly designName: string
  /** Панели в порядке изготовления: вложенные раньше внешних. */
  readonly panels: readonly PanelCutPlan[]
  readonly rows: readonly RowPlan[]
  readonly kerfMm: number
  readonly planingAllowanceMm: number
  readonly boardWidthMm: number
  readonly boardLengthMm: number
  readonly boardThicknessMm: number
  readonly stripCount: number
  readonly crosscutCount: number
  /** true, если хотя бы один поперечный рез проекта выполняется под углом. */
  readonly hasAngledCuts: boolean
}

/**
 * Порядок изготовления панелей: сначала те, что ни на кого не ссылаются,
 * потом те, что вклеивают чужие срезы. Движок ограничивает вложенность двумя уровнями,
 * поэтому двух проходов достаточно и полноценная топологическая сортировка не нужна.
 */
function manufacturingOrder(design: Design): readonly Panel[] {
  const plain = design.panels.filter((p) => !p.elements.some(isSliceRef))
  const nested = design.panels.filter((p) => p.elements.some(isSliceRef))
  return [...plain, ...nested]
}

function tally(panel: Panel): SpeciesTally[] {
  const acc = new Map<SpeciesId, { pieceCount: number; totalWidthMm: number }>()
  for (const el of panel.elements) {
    if (!isStrip(el)) continue
    const prev = acc.get(el.speciesId) ?? { pieceCount: 0, totalWidthMm: 0 }
    acc.set(el.speciesId, { pieceCount: prev.pieceCount + 1, totalWidthMm: prev.totalWidthMm + el.widthMm })
  }
  return [...acc.entries()]
    .map(([speciesId, v]) => ({ speciesId, ...v }))
    .sort((a, b) => b.totalWidthMm - a.totalWidthMm || a.speciesId.localeCompare(b.speciesId))
}

function pieces(panel: Panel): PanelPiece[] {
  return panel.elements.map((el, elementIndex) =>
    isStrip(el)
      ? { kind: 'strip', elementIndex, speciesId: el.speciesId, widthMm: el.widthMm }
      : {
          kind: 'sliceRef',
          elementIndex,
          sourcePanelId: el.panelId,
          thicknessMm: el.thicknessMm,
          offsetMm: el.offsetMm,
          angleDeg: el.angleDeg,
          flip: el.flip ?? false,
        },
  )
}

/** Градусы в радианы. */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Длина торцевых клиньев вдоль щита, мм: сумма по различным ненулевым углам резов
 * widthMm · |tan φ|. Тот же принцип группировки, что и в lib/engine/panels.panelLengthMm -
 * подряд идущие резы одного угла режутся с одной настройки салазок, клин один на группу.
 */
function endWasteMm(widthMm: number, angles: readonly number[]): number {
  const distinct = new Set(angles.filter((a) => a !== 0))
  let sum = 0
  for (const angleDeg of distinct) sum += widthMm * Math.abs(Math.tan(toRad(angleDeg)))
  return sum
}

/** Локаль нужна только имени документа: остальной план цифровой и от языка не зависит. */
export function buildCutPlan(design: Design, locale: Locale): CutPlan {
  // Нумерация рядов берётся у rowBandsMm, а не у design.rows: движок пропускает
  // ряды с несуществующей панелью, и на холсте пользователь видит именно эту нумерацию.
  const bands = rowBandsMm(design)
  // Габариты итоговой доски берутся из скомпилированной модели, а не из design.board.target*:
  // пользователь может подвинуть слайдер размера, не подгоняя полосы под него, и тогда
  // фактическая доска после сборки будет отличаться от заданной цели. PDF, SVG-превью и
  // финальный шаг склейки должны показывать одну и ту же цифру, поэтому источник один - compile().
  const compiledModel = compile(design)
  const rowNumberById = new Map<RowId, number>(bands.map((b, index) => [b.id, index + 1]))

  const rows: RowPlan[] = bands.flatMap((band, index) => {
    const row = design.rows.find((r) => r.id === band.id)
    if (!row) return []
    return [{
      number: index + 1,
      rowId: row.id,
      panelId: row.panelId,
      thicknessMm: row.thicknessMm,
      flip: row.flip,
      mirror: row.mirror,
      trimMm: row.trimMm,
      topMm: band.topMm,
    }]
  })

  const panels: PanelCutPlan[] = manufacturingOrder(design).map((panel) => {
    const widthMm = panelWidthMm(panel)
    const crosscuts: Crosscut[] = slicesOfPanel(design, panel.id).map((slice: PanelSlice) => ({
      thicknessMm: slice.thicknessMm,
      trimMm: slice.trimMm,
      angleDeg: slice.angleDeg,
      lengthMm: sliceLengthMm(slice),
      rowNumber: slice.consumer.kind === 'row' ? rowNumberById.get(slice.consumer.rowId) ?? null : null,
      consumer: slice.consumer,
    }))
    return {
      panelId: panel.id,
      pieces: pieces(panel),
      bySpecies: tally(panel),
      widthMm,
      lengthMm: panelLengthMm(design, panel.id),
      planedThicknessMm: design.board.thicknessMm + design.planingAllowanceMm,
      crosscuts,
      hasInlay: panel.elements.some(isSliceRef),
      angledWasteMm2: angledWasteMm2(design, panel.id),
      endWasteMm: endWasteMm(widthMm, crosscuts.map((c) => c.angleDeg)),
    }
  })

  return {
    designName: designDisplayName(design, locale),
    panels,
    rows,
    kerfMm: design.kerfMm,
    planingAllowanceMm: design.planingAllowanceMm,
    boardWidthMm: compiledModel.widthMm,
    boardLengthMm: compiledModel.lengthMm,
    boardThicknessMm: design.board.thicknessMm,
    stripCount: panels.reduce((s, p) => s + p.pieces.filter((x) => x.kind === 'strip').length, 0),
    crosscutCount: panels.reduce((s, p) => s + p.crosscuts.length, 0),
    hasAngledCuts: panels.some((p) => p.crosscuts.some((c) => c.angleDeg !== 0)),
  }
}

export type GlueUpStepKind =
  | 'rip'
  | 'inlay'
  | 'glue-panel'
  | 'plane'
  | 'angled-setup'
  | 'crosscut'
  | 'arrange'
  | 'final-glue'
  | 'flatten'

export interface GlueUpStep {
  readonly number: number
  readonly kind: GlueUpStepKind
  readonly messageKey: MessageKey
  readonly params: Readonly<Record<string, string | number>>
  readonly panelId?: PanelId
}

function describePieces(panel: PanelCutPlan, locale: Locale): string {
  const pcs = t(locale, 'cut.pcs')
  return panel.bySpecies.map((s) => `${speciesName(s.speciesId, locale)} ${s.pieceCount} ${pcs}`).join(', ')
}

/**
 * Пошаговая инструкция по проекту. Шаги идут в порядке изготовления:
 * вложенные щиты собираются раньше внешних, финальная склейка всегда последняя.
 * Все размеры уже превращены в строки (мм и дюймы), потому что t() округляет числа до сотых.
 */
export function buildGlueUpSteps(plan: CutPlan, locale: Locale): readonly GlueUpStep[] {
  const out: Array<Omit<GlueUpStep, 'number'>> = []
  const push = (kind: GlueUpStepKind, messageKey: MessageKey, params: Record<string, string | number>, panelId?: PanelId): void => {
    out.push({ kind, messageKey, params, ...(panelId === undefined ? {} : { panelId }) })
  }

  for (const panel of plan.panels) {
    push('rip', 'steps.rip', {
      panel: panel.panelId,
      pieces: describePieces(panel, locale),
      length: bothUnits(panel.lengthMm, locale),
      thickness: bothUnits(panel.planedThicknessMm, locale),
    }, panel.panelId)

    for (const piece of panel.pieces) {
      if (piece.kind !== 'sliceRef') continue
      // Перевёрнутый срез (SliceRef.flip) вклеивается зеркально: отдельный текст шага,
      // а не приписка к существующему, чтобы перевод оставался цельным предложением.
      push('inlay', piece.flip ? 'steps.inlayFlipped' : 'steps.inlay', {
        source: piece.sourcePanelId,
        panel: panel.panelId,
        thickness: bothUnits(piece.thicknessMm, locale),
        offset: bothUnits(piece.offsetMm, locale),
      }, panel.panelId)
    }

    push('glue-panel', 'steps.gluePanel', {
      panel: panel.panelId,
      count: panel.pieces.length,
      // "из N X": предлог требует родительного падежа. У родительного падежа своя пара форм -
      // единственное для 1 ("заготовки") и множественное для остальных ("заготовок"),
      // трёхчленное деление one/few/many тут вырождается в двухчленное.
      countWord: plural(locale, panel.pieces.length, { ru: ['заготовки', 'заготовок', 'заготовок'], en: ['piece', 'pieces'] }),
      width: bothUnits(panel.widthMm, locale),
    }, panel.panelId)

    push('plane', 'steps.plane', {
      panel: panel.panelId,
      thickness: bothUnits(panel.planedThicknessMm, locale),
    }, panel.panelId)

    // Угловые резы этой панели: один шаг angled-setup на каждый различный ненулевой угол,
    // в порядке первого появления, перед самим шагом поперечного роспуска - салазки
    // выставляются один раз на группу резов одного угла.
    const seenAngles = new Set<number>()
    for (const cut of panel.crosscuts) {
      if (cut.angleDeg === 0 || seenAngles.has(cut.angleDeg)) continue
      seenAngles.add(cut.angleDeg)
      push('angled-setup', 'steps.angledSetup', {
        panel: panel.panelId,
        angleDeg: cut.angleDeg,
        waste: bothUnits(panel.widthMm * Math.abs(Math.tan((cut.angleDeg * Math.PI) / 180)), locale),
      }, panel.panelId)
    }

    const hasAngled = panel.crosscuts.some((c) => c.angleDeg !== 0)
    push('crosscut', hasAngled ? 'steps.crosscutAngled' : 'steps.crosscut', {
      panel: panel.panelId,
      count: panel.crosscuts.length,
      countWord: plural(locale, panel.crosscuts.length, { ru: ['срез', 'среза', 'срезов'], en: ['slice', 'slices'] }),
      list: panel.crosscuts
        .map((c) => {
          const base = c.rowNumber === null ? bothUnits(c.thicknessMm, locale) : `${bothUnits(c.thicknessMm, locale)} -> ${c.rowNumber}`
          if (c.angleDeg === 0) return base
          return `${base} (${t(locale, 'cut.angleColumn', { angleDeg: c.angleDeg })}, ${bothUnits(c.lengthMm, locale)})`
        })
        .join('; '),
      kerf: bothUnits(plan.kerfMm, locale),
    }, panel.panelId)
  }

  const none = t(locale, 'steps.none')
  const flipped = plan.rows.filter((r) => r.flip).map((r) => r.number)
  const mirrored = plan.rows.filter((r) => r.mirror).map((r) => r.number)
  push('arrange', 'steps.arrange', {
    count: plan.rows.length,
    flip: flipped.length === 0 ? none : flipped.join(', '),
    mirror: mirrored.length === 0 ? none : mirrored.join(', '),
  })

  push('final-glue', 'steps.finalGlue', {
    width: bothUnits(plan.boardWidthMm, locale),
    length: bothUnits(plan.boardLengthMm, locale),
  })

  push('flatten', 'steps.flatten', { thickness: bothUnits(plan.boardThicknessMm, locale) })

  return out.map((step, index) => ({ ...step, number: index + 1 }))
}
