import type { jsPDF } from 'jspdf'
import type { BoardModel, Design } from '@/lib/engine'
import type { CalcResult } from '@/lib/calc'
import { designDisplayName } from '@/lib/designs/name'
import { t, type Locale } from '@/lib/i18n'
import { speciesHex } from '@/lib/species'
import { buildCutPlan, buildGlueUpSteps, type CutPlan, type GlueUpStep, type PanelCutPlan } from './cutlist'
import { PDF_FONT_FAMILY, registerCyrillicFont } from './pdfFont'
import { renderBoardSvg } from './svg'
import { areaMm2, bothUnits, speciesName } from './format'

// svg2pdf.js расширяет jsPDF методом .svg() как побочный эффект своего импорта (см. node_modules/svg2pdf.js/types.d.ts).
// Динамический импорт ниже подтягивает эту декларацию в программу TypeScript, поэтому doc.svg() типизирован без каста.

const PAGE = { widthMm: 210, heightMm: 297, marginMm: 14 } as const
const LINE_MM = 5.2
const BOTTOM_RESERVE_MM = 30

// Единый колонтитул: сверху логотип-текст + разделительная линейка, снизу линейка + адрес + номер страницы.
// Контент сдвинут вниз до CONTENT_TOP_MM ради шапки; снизу для подвала уже есть свободная
// зона - BOTTOM_RESERVE_MM ниже отсекает контент раньше нижнего поля, туда и вписан футер.
const HEADER_TEXT_Y = PAGE.marginMm + 5
const HEADER_RULE_Y = PAGE.marginMm + 8
const CONTENT_TOP_MM = PAGE.marginMm + 13
const FOOTER_RULE_Y = PAGE.heightMm - PAGE.marginMm - 12
const FOOTER_TEXT_Y = PAGE.heightMm - PAGE.marginMm - 7
const PROMO_Y = PAGE.heightMm - PAGE.marginMm - 1

const SITE_URL = 'endgrain.app'
const BRAND_COLOR = '#6d4426'
const RULE_COLOR = '#cccccc'

/** Единая типографика: не более пары размеров на блок, см. правку тех. долга #16. */
const FONT = {
  h1: 14, // заголовок страницы (название проекта, "Схема распила", "Порядок сборки")
  h2: 11, // подзаголовок секции (щит, "Порода древесины", ряды)
  body: 9.5,
  caption: 7.5,
} as const

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export interface PdfInput {
  readonly design: Design
  readonly model: BoardModel
  readonly calc: CalcResult
  readonly locale: Locale
  /** Без Pro в подвале последней страницы появляется одна промо-строка. */
  readonly pro: boolean
}

interface PdfContext {
  readonly doc: jsPDF
  readonly family: string
  readonly locale: Locale
  readonly design: Design
  readonly model: BoardModel
  readonly calc: CalcResult
  readonly plan: CutPlan
  readonly steps: readonly GlueUpStep[]
}

export async function buildInstructionPdf(input: PdfInput): Promise<Blob> {
  // Динамический импорт: jspdf со svg2pdf это около 350 КБ, и в первом бандле страницы им делать нечего.
  const { jsPDF } = await import('jspdf')
  await import('svg2pdf.js') // побочный эффект: добавляет doc.svg()

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const hasCyrillic = await registerCyrillicFont(doc)
  // Без кириллического шрифта русский текст вышел бы пустыми глифами.
  // Честнее отдать читаемый английский PDF, чем красивый пустой.
  const locale: Locale = hasCyrillic ? input.locale : 'en'
  const family = hasCyrillic ? PDF_FONT_FAMILY : 'helvetica'

  const plan = buildCutPlan(input.design, locale)
  const steps = buildGlueUpSteps(plan, locale)
  const ctx: PdfContext = { doc, family, locale, design: input.design, model: input.model, calc: input.calc, plan, steps }

  await drawOverviewPage(ctx)
  doc.addPage()
  drawCutMapPage(ctx)
  doc.addPage()
  drawStepsPage(ctx)

  // Мягкий гейт, см. комментарий в ExportPanel. Строка не увечит инструкцию,
  // она подписывает её: PDF уходит в чужую мастерскую и работает как визитка.
  // Пишется на текущей (последней) странице - переполнение cut map / steps может
  // добавить страниц сверх трёх исходных, и промо должно остаться на самой последней.
  if (!input.pro) {
    text(ctx, t(locale, 'export.pdfPromo'), PAGE.marginMm, PROMO_Y, { size: FONT.caption, color: '#888888' })
  }

  // Колонтитул печатается финальным проходом по уже готовым страницам: до этого момента
  // их итоговое число неизвестно (ensureRoom могла добавить лишние).
  const projectName = designDisplayName(input.design, locale)
  const totalPages = doc.getNumberOfPages()
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    drawHeader(ctx, projectName)
    drawFooter(ctx, page, totalPages)
  }

  return doc.output('blob')
}

interface TextOptions {
  readonly size?: number
  readonly style?: 'normal' | 'bold'
  readonly color?: string
  readonly align?: 'left' | 'center' | 'right'
}

/**
 * Единая точка печати текста: ставит семейство шрифта на каждый вызов.
 * jsPDF сбрасывается на helvetica охотнее, чем говорит документация,
 * и один пропущенный setFont даёт одну невидимую строку посреди русской страницы.
 */
function text(ctx: PdfContext, value: string, x: number, y: number, options: TextOptions = {}): void {
  const { doc, family } = ctx
  doc.setFont(family, options.style ?? 'normal')
  doc.setFontSize(options.size ?? 10)
  doc.setTextColor(options.color ?? '#111111')
  doc.text(value, x, y, options.align === undefined ? undefined : { align: options.align })
}

/** Переход на новую страницу, если под needed мм уже не остаётся места до нижнего поля. Возвращает актуальный y. */
function ensureRoom(ctx: PdfContext, y: number, needed: number): number {
  if (y + needed <= PAGE.heightMm - PAGE.marginMm - BOTTOM_RESERVE_MM) return y
  ctx.doc.addPage()
  return CONTENT_TOP_MM
}

/** Колонтитул: слева текстовый логотип, справа название проекта, снизу - линейка-разделитель. */
function drawHeader(ctx: PdfContext, projectName: string): void {
  const { doc } = ctx
  text(ctx, 'Endgrain', PAGE.marginMm, HEADER_TEXT_Y, { size: FONT.h2, style: 'bold', color: BRAND_COLOR })
  text(ctx, projectName, PAGE.widthMm - PAGE.marginMm, HEADER_TEXT_Y, { size: FONT.body, color: '#555555', align: 'right' })
  doc.setDrawColor(RULE_COLOR)
  doc.setLineWidth(0.2)
  doc.line(PAGE.marginMm, HEADER_RULE_Y, PAGE.widthMm - PAGE.marginMm, HEADER_RULE_Y)
}

/** Подвал: линейка-разделитель, адрес сайта слева, номер страницы справа. */
function drawFooter(ctx: PdfContext, page: number, totalPages: number): void {
  const { doc } = ctx
  doc.setDrawColor(RULE_COLOR)
  doc.setLineWidth(0.2)
  doc.line(PAGE.marginMm, FOOTER_RULE_Y, PAGE.widthMm - PAGE.marginMm, FOOTER_RULE_Y)
  text(ctx, SITE_URL, PAGE.marginMm, FOOTER_TEXT_Y, { size: FONT.caption, color: '#888888' })
  text(ctx, `${page} / ${totalPages}`, PAGE.widthMm - PAGE.marginMm, FOOTER_TEXT_Y, { size: FONT.caption, color: '#888888', align: 'right' })
}

/** Колонка значений выровнена по правому краю сетки - число видно с одного взгляда, а не вычитывается из строки. */
function drawKeyValues(ctx: PdfContext, startY: number, rows: ReadonlyArray<readonly [string, string]>): number {
  let y = startY
  const valueX = PAGE.widthMm - PAGE.marginMm
  for (const [label, value] of rows) {
    text(ctx, label, PAGE.marginMm, y, { size: FONT.body })
    text(ctx, value, valueX, y, { size: FONT.body, align: 'right' })
    y += LINE_MM
  }
  return y
}

/**
 * svg2pdf требует настоящий Element, а не строку, и для getBBox узел должен быть в документе.
 * Держим его в скрытом контейнере ровно на время отрисовки.
 */
async function drawSvg(doc: jsPDF, svg: string, x: number, y: number, width: number, height: number): Promise<void> {
  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-10000px'
  host.style.top = '0'
  host.innerHTML = svg
  document.body.appendChild(host)
  try {
    const element = host.firstElementChild
    if (!(element instanceof SVGElement)) throw new Error('svg root missing')
    await doc.svg(element, { x, y, width, height })
  } finally {
    host.remove()
  }
}

async function drawOverviewPage(ctx: PdfContext): Promise<void> {
  const { doc, locale, model, calc, design } = ctx
  let y: number = CONTENT_TOP_MM

  text(ctx, designDisplayName(design, locale), PAGE.marginMm, y, { size: FONT.h1, style: 'bold' })
  y += 8
  text(ctx, t(locale, 'app.tagline'), PAGE.marginMm, y, { size: FONT.caption, color: '#666666' })
  y += 8

  if (model.truncated) {
    text(ctx, t(locale, 'cut.truncated'), PAGE.marginMm, y, { size: FONT.body, color: '#b00020' })
    y += 6
  }

  // Векторная доска: единственный вызов svg2pdf во всём документе.
  // Всё остальное рисуется примитивами jsPDF, поэтому капризность svg2pdf к трансформациям
  // может испортить максимум одну картинку, а не весь PDF.
  const maxWidthMm = PAGE.widthMm - PAGE.marginMm * 2
  const maxHeightMm = 120
  const rendered = renderBoardSvg(model, { maxPx: 1000 })
  const aspect = rendered.heightPx === 0 ? 1 : rendered.widthPx / rendered.heightPx
  const drawWidth = Math.min(maxWidthMm, maxHeightMm * aspect)
  const drawHeight = drawWidth / aspect
  await drawSvg(doc, rendered.svg, (PAGE.widthMm - drawWidth) / 2, y, drawWidth, drawHeight)
  y += drawHeight + 8

  y = drawKeyValues(ctx, y, [
    [t(locale, 'board.width'), bothUnits(model.widthMm, locale, 0)],
    [t(locale, 'board.length'), bothUnits(model.lengthMm, locale, 0)],
    [t(locale, 'board.thickness'), bothUnits(model.thicknessMm, locale, 0)],
    [t(locale, 'board.kerf'), bothUnits(design.kerfMm, locale, 1)],
    [t(locale, 'board.allowance'), bothUnits(design.planingAllowanceMm, locale, 1)],
    [t(locale, 'board.planerWidth'), bothUnits(design.planerWidthMm, locale, 0)],
    [t(locale, 'meter.glueUps'), String(calc.glueUpCount)],
    [t(locale, 'meter.cuts'), String(calc.cutCount)],
    [t(locale, 'meter.waste'), `${calc.wastePct.toFixed(1)} %`],
    [t(locale, 'meter.boardFeet'), `${calc.totalBoardFeet.toFixed(2)} ${t(locale, 'units.bf')}`],
    [t(locale, 'meter.cost'), usd.format(calc.totalCostUsd)],
    [t(locale, 'meter.weight'), `${calc.totalWeightKg.toFixed(2)} ${t(locale, 'units.kg')}`],
  ])

  y += 4
  text(ctx, t(locale, 'meter.lumberBySpecies'), PAGE.marginMm, y, { size: FONT.h2, style: 'bold' })
  y += LINE_MM
  for (const need of calc.bySpecies) {
    doc.setFillColor(speciesHex(need.speciesId))
    doc.rect(PAGE.marginMm, y - 3.2, 4, 4, 'F')
    text(
      ctx,
      // Та же строка, что и в счётчике сложности: единицы живут в i18n, а не в вёрстке PDF.
      t(locale, 'meter.speciesRow', {
        name: speciesName(need.speciesId, locale),
        meters: need.linearMeters.toFixed(2),
        boardFeet: need.boardFeet.toFixed(2),
        costUsd: usd.format(need.costUsd),
      }),
      PAGE.marginMm + 6,
      y,
      { size: FONT.body },
    )
    y += LINE_MM
  }
}

function drawStripStack(ctx: PdfContext, panel: PanelCutPlan, y: number): number {
  const { doc } = ctx
  const usableMm = PAGE.widthMm - PAGE.marginMm * 2
  const barHeight = 12
  const scale = panel.widthMm > 0 ? usableMm / panel.widthMm : 0
  let x = PAGE.marginMm
  for (const piece of panel.pieces) {
    const extent = piece.kind === 'strip' ? piece.widthMm : piece.thicknessMm
    const w = extent * scale
    doc.setFillColor(piece.kind === 'strip' ? speciesHex(piece.speciesId) : '#dddddd')
    doc.setDrawColor('#333333')
    doc.setLineWidth(0.2)
    doc.rect(x, y, w, barHeight, 'FD')
    // Подпись влезает не всегда: узкие полосы всё равно перечислены списком ниже.
    if (w > 9) text(ctx, extent.toFixed(0), x + w / 2, y + barHeight / 2 + 1, { size: 7, align: 'center' })
    x += w
  }
  return y + barHeight + 4
}

function drawCutMapPage(ctx: PdfContext): void {
  const { locale, plan } = ctx
  let y: number = CONTENT_TOP_MM

  text(ctx, t(locale, 'cut.title'), PAGE.marginMm, y, { size: FONT.h1, style: 'bold' })
  y += 8

  for (const panel of plan.panels) {
    y = ensureRoom(ctx, y, 30)
    text(ctx, t(locale, 'cut.panel', { panel: panel.panelId }), PAGE.marginMm, y, { size: FONT.h2, style: 'bold' })
    y += LINE_MM

    y = ensureRoom(ctx, y, 20)
    y = drawStripStack(ctx, panel, y)

    for (const piece of panel.pieces) {
      y = ensureRoom(ctx, y, LINE_MM)
      const line =
        piece.kind === 'strip'
          ? t(locale, 'cut.strip', { index: piece.elementIndex + 1, species: speciesName(piece.speciesId, locale), width: bothUnits(piece.widthMm, locale) })
          : t(locale, 'cut.sliceIn', { source: piece.sourcePanelId, thickness: bothUnits(piece.thicknessMm, locale) })
      text(ctx, line, PAGE.marginMm, y, { size: FONT.body })
      y += LINE_MM
    }

    y = ensureRoom(ctx, y, LINE_MM)
    text(
      ctx,
      t(locale, 'cut.panelSummary', { width: bothUnits(panel.widthMm, locale), length: bothUnits(panel.lengthMm, locale), thickness: bothUnits(panel.planedThicknessMm, locale) }),
      PAGE.marginMm,
      y,
      { size: FONT.body, color: '#444444' },
    )
    y += LINE_MM

    panel.crosscuts.forEach((cut, index) => {
      y = ensureRoom(ctx, y, LINE_MM)
      const line =
        cut.rowNumber === null
          ? t(locale, 'cut.crosscutInlay', { index: index + 1, thickness: bothUnits(cut.thicknessMm, locale), panel: panel.panelId })
          : t(locale, 'cut.crosscutRow', { index: index + 1, thickness: bothUnits(cut.thicknessMm, locale), row: cut.rowNumber })
      // Угловой рез получает явную приписку "рез под углом X°" и честную длину заготовки
      // (sourceWidthMm / cos φ вместо просто ширины щита): превью не должно расходиться со схемой.
      const angleNote = cut.angleDeg === 0 ? '' : `, ${t(locale, 'cut.angleColumn', { angleDeg: cut.angleDeg })}, ${bothUnits(cut.lengthMm, locale)}`
      text(ctx, line + angleNote, PAGE.marginMm, y, { size: FONT.body })
      y += LINE_MM
    })

    if (panel.angledWasteMm2 > 0) {
      y = ensureRoom(ctx, y, LINE_MM)
      text(ctx, t(locale, 'cut.wasteAngled', { panel: panel.panelId, waste: areaMm2(panel.angledWasteMm2, locale) }), PAGE.marginMm, y, {
        size: FONT.body,
        color: '#b00020',
      })
      y += LINE_MM
    }

    y += 4
  }

  y = ensureRoom(ctx, y, LINE_MM)
  text(ctx, t(locale, 'cut.totals', { strips: plan.stripCount, cuts: plan.crosscutCount, glueUps: ctx.calc.glueUpCount }), PAGE.marginMm, y, {
    size: FONT.body,
    style: 'bold',
  })
}

function drawStepsPage(ctx: PdfContext): void {
  const { doc, locale, plan } = ctx
  const usableMm = PAGE.widthMm - PAGE.marginMm * 2
  let y: number = CONTENT_TOP_MM

  text(ctx, t(locale, 'steps.title'), PAGE.marginMm, y, { size: FONT.h1, style: 'bold' })
  y += 8

  for (const step of ctx.steps) {
    const line = `${step.number}. ${t(locale, step.messageKey, step.params)}`
    doc.setFont(ctx.family, 'normal')
    doc.setFontSize(FONT.body)
    const wrapped: string[] = doc.splitTextToSize(line, usableMm)
    y = ensureRoom(ctx, y, wrapped.length * LINE_MM)
    for (const part of wrapped) {
      text(ctx, part, PAGE.marginMm, y, { size: FONT.body })
      y += LINE_MM
    }
  }

  y += 6
  y = ensureRoom(ctx, y, plan.rows.length * 7 + 20)
  text(ctx, t(locale, 'rows.title'), PAGE.marginMm, y, { size: FONT.h2, style: 'bold' })
  y += 7

  const maxThickness = Math.max(1, ...plan.rows.map((row) => row.thicknessMm))
  const barMaxHeight = 10
  const labelWidth = 14
  const markWidth = 10
  const barWidth = usableMm - labelWidth - markWidth

  for (const row of plan.rows) {
    y = ensureRoom(ctx, y, 8)
    const barHeight = Math.max(2, (row.thicknessMm / maxThickness) * barMaxHeight)
    text(ctx, String(row.number), PAGE.marginMm, y + barHeight / 2 + 1, { size: 8, align: 'left' })
    doc.setFillColor('#eaeaea')
    doc.setDrawColor('#333333')
    doc.setLineWidth(0.2)
    doc.rect(PAGE.marginMm + labelWidth, y, barWidth, barHeight, 'FD')
    // Буквы, а не значки: запасной helvetica не гарантирует ничего, кроме ASCII.
    const marks = `${row.flip ? 'F' : ''}${row.mirror ? 'M' : ''}`
    if (marks !== '') text(ctx, marks, PAGE.marginMm + labelWidth + barWidth + 2, y + barHeight / 2 + 1, { size: 8 })
    y += Math.max(barHeight, 6) + 1.5
  }

  y += 4
  y = ensureRoom(ctx, y, LINE_MM)
  text(ctx, `${t(locale, 'steps.flipMark')}. ${t(locale, 'steps.mirrorMark')}.`, PAGE.marginMm, y, { size: 8, color: '#666666' })
}
