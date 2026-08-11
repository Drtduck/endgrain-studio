'use client'

import type { PointerEvent as ReactPointerEvent } from 'react'
import { useMemo } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { rowBandsMm } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

/** Ищем ячейку по data-cell вверх по дереву: BoardSvg остаётся чистым рендерером без обработчиков. */
function cellIdOf(event: ReactPointerEvent<HTMLDivElement>): string | null {
  const target = event.target
  if (!(target instanceof Element)) return null
  return target.closest('[data-cell]')?.getAttribute('data-cell') ?? null
}

export function BoardCanvas() {
  const locale = useStudio((s) => s.locale)
  const hoveredCellId = useStudio((s) => s.hoveredCellId)
  const selectedCellId = useStudio((s) => s.selectedCellId)
  const paintCell = useStudio((s) => s.paintCell)
  const hoverCell = useStudio((s) => s.hoverCell)
  const design = useStudio(selectDesign)
  const { model } = useDerived()
  // Колонка номеров рядов рядом с доской: помогает сверить ряд на холсте с инспектором рядов.
  const rowLabels = useMemo(() => rowBandsMm(design), [design])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const id = cellIdOf(event)
    if (id === null) return
    const cell = model.cells.find((c) => c.id === id)
    if (!cell) return
    paintCell(cell)
  }

  return (
    <div
      data-testid="board-canvas"
      role="application"
      aria-label={t(locale, 'aria.boardCanvas')}
      className="inline-block cursor-crosshair touch-manipulation select-none"
      onPointerDown={onPointerDown}
      onPointerOver={(event) => hoverCell(cellIdOf(event))}
      onPointerLeave={() => hoverCell(null)}
    >
      <BoardSvg
        model={model}
        locale={locale}
        highlightCellId={hoveredCellId}
        selectedCellId={selectedCellId}
        rowLabels={rowLabels}
      />
    </div>
  )
}
