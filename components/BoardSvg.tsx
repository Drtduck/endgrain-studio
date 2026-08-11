import type { BoardModel, RowBand } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { boardLayout } from '@/lib/render2d/layout'
import { speciesHex } from '@/lib/species'

export function BoardSvg({
  model,
  locale,
  maxPx = 640,
  highlightCellId = null,
  selectedCellId = null,
  rowLabels,
}: {
  model: BoardModel
  locale: Locale
  maxPx?: number
  highlightCellId?: string | null
  selectedCellId?: string | null
  /**
   * Список рядов для узкой колонки нумерации слева от доски. Опционален и используется только
   * редактором: превью в шаблонах/генераторе/фото-импорте его не передают, поэтому там подписей нет.
   */
  rowLabels?: readonly RowBand[]
}) {
  if (model.widthMm <= 0 || model.lengthMm <= 0) return <svg role="img" aria-label={t(locale, 'aria.emptyBoard')} />

  const hasLabels = Boolean(rowLabels && rowLabels.length > 0)
  const layout = boardLayout(model, { maxPx, withRowLabels: hasLabels })
  const marginMm = layout.marginMm
  // Клеевой зазор 2px переведён в мм-координаты доски: каждая ячейка ужимается на gapMm/2
  // с каждой стороны, а подложка BoardCanvas (bg-surface) видна в получившейся линии.
  const gapMm = layout.scale > 0 ? 2 / layout.scale : 0
  const halfGapMm = gapMm / 2
  const selectionStrokeMm = layout.scale > 0 ? 2 / layout.scale : 0
  const rowLabelFontSizeMm = layout.scale > 0 ? 10 / layout.scale : 0

  return (
    <svg
      viewBox={layout.viewBox}
      width={layout.widthPx}
      height={layout.heightPx}
      role="img"
      aria-label={t(locale, 'aria.boardPreview')}
      className="max-w-full rounded-lg shadow-sm"
    >
      {model.cells.map((cell) => {
        const isActive = cell.id === selectedCellId || cell.id === highlightCellId
        return (
          <rect
            key={cell.id}
            data-cell={cell.id}
            x={cell.xMm + marginMm + halfGapMm}
            y={cell.yMm + halfGapMm}
            width={Math.max(0, cell.widthMm - gapMm)}
            height={Math.max(0, cell.heightMm - gapMm)}
            fill={speciesHex(cell.speciesId)}
            {...(isActive ? { stroke: 'var(--selection)', strokeWidth: selectionStrokeMm } : {})}
          />
        )
      })}
      {hasLabels && rowLabels ? (
        <g aria-label={t(locale, 'aria.rowLabels')}>
          {rowLabels.map((band, index) => (
            <text
              key={band.id}
              data-testid="row-label"
              x={marginMm - halfGapMm}
              y={band.topMm + band.heightMm / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={rowLabelFontSizeMm}
              fill="var(--text-muted)"
              className="font-mono select-none"
            >
              {index + 1}
            </text>
          ))}
        </g>
      ) : null}
    </svg>
  )
}
