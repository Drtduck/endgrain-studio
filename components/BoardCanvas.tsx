'use client'

import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react'
import { useMemo } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { colBandsMm, rowBandsMm } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

/** Ищем ячейку по data-cell вверх по дереву: BoardSvg остаётся чистым рендерером без обработчиков. */
function cellIdOf(event: ReactPointerEvent<HTMLDivElement>): string | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  return target.closest('[data-cell]')?.getAttribute('data-cell') ?? null
}

/** Тот же приём для номера ряда: BoardSvg помечает его data-row, обработчик живёт здесь. */
function rowIdOf(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest('[data-row]')?.getAttribute('data-row') ?? null
}

/** И для номера колонки: BoardSvg помечает его data-col индексом полосы (позицией, не id). */
function colIndexOf(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null
  const raw = target.closest('[data-col]')?.getAttribute('data-col')
  if (raw === null || raw === undefined) return null
  const index = Number(raw)
  return Number.isFinite(index) ? index : null
}

function scrollToRow(rowId: string): void {
  document.querySelector(`[data-testid="row-${rowId}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

/**
 * Одна колонка - это один индекс сразу в нескольких панелях (шахматка чередует панели по рядам),
 * поэтому скроллим к первой карточке полосы с этим индексом: PanelInspector размечает её
 * отдельным data-strip-col, чтобы не путать с меткой колонки на самой доске.
 */
function scrollToStrip(index: number): void {
  document.querySelector(`[data-strip-col="${index}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

export function BoardCanvas() {
  const locale = useStudio((s) => s.locale)
  const hoveredCellId = useStudio((s) => s.hoveredCellId)
  const selectedCellId = useStudio((s) => s.selectedCellId)
  const touchedCellIds = useStudio((s) => s.touchedCellIds)
  const paintCell = useStudio((s) => s.paintCell)
  const hoverCell = useStudio((s) => s.hoverCell)
  const selectRow = useStudio((s) => s.selectRow)
  const selectStrip = useStudio((s) => s.selectStrip)
  const design = useStudio(selectDesign)
  const { model } = useDerived()
  // Колонка номеров рядов рядом с доской: помогает сверить ряд на холсте с инспектором рядов.
  const rowLabels = useMemo(() => rowBandsMm(design), [design])
  // Полоса номеров колонок под доской: та же идея, только по горизонтали.
  const colLabels = useMemo(() => colBandsMm(design), [design])
  // Подпись под доской: «N полос × M рядов · ширина × длина мм». N полос - максимум ячеек
  // в одном ряду (id ячейки имеет вид `${rowId}:${index}`), M рядов - число физических рядов.
  const captionStripCount = useMemo(() => {
    const perRow = new Map<string, number>()
    for (const cell of model.cells) {
      const rowId = cell.id.slice(0, cell.id.lastIndexOf(':'))
      perRow.set(rowId, (perRow.get(rowId) ?? 0) + 1)
    }
    return Math.max(0, ...perRow.values())
  }, [model])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const rowId = rowIdOf(event.target)
    if (rowId !== null) {
      selectRow(rowId)
      scrollToRow(rowId)
      return
    }
    const colIndex = colIndexOf(event.target)
    if (colIndex !== null) {
      selectStrip(colIndex)
      scrollToStrip(colIndex)
      return
    }
    const id = cellIdOf(event)
    if (id === null) return
    const cell = model.cells.find((c) => c.id === id)
    if (!cell) return
    paintCell(cell)
  }

  // Номера рядов и колонок дублируют role="button"/tabIndex в BoardSvg, поэтому Enter и Space
  // должны так же выбирать ряд/полосу и скроллить к ней - иначе с клавиатуры до настроек не добраться.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const rowId = rowIdOf(event.target)
    if (rowId !== null) {
      event.preventDefault()
      selectRow(rowId)
      scrollToRow(rowId)
      return
    }
    const colIndex = colIndexOf(event.target)
    if (colIndex !== null) {
      event.preventDefault()
      selectStrip(colIndex)
      scrollToStrip(colIndex)
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        data-testid="board-canvas"
        role="application"
        aria-label={t(locale, 'aria.boardCanvas')}
        className="inline-block cursor-crosshair touch-manipulation select-none rounded-xs bg-surface p-1.5 shadow-md"
        onPointerDown={onPointerDown}
        onPointerOver={(event) => hoverCell(cellIdOf(event))}
        onPointerLeave={() => hoverCell(null)}
        onKeyDown={onKeyDown}
      >
        <BoardSvg
          model={model}
          locale={locale}
          highlightCellId={hoveredCellId}
          selectedCellId={selectedCellId}
          rowLabels={rowLabels}
          colLabels={colLabels}
          touchedCellIds={touchedCellIds}
        />
      </div>
      <p data-testid="board-caption" className="font-mono text-[11px] tabular-nums text-ink-muted">
        {captionStripCount} × {rowLabels.length} · {t(locale, 'templates.size', { widthMm: model.widthMm, lengthMm: model.lengthMm })}
      </p>
    </div>
  )
}
