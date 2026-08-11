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
        const isSelected = cell.id === selectedCellId
        const isHighlighted = cell.id === highlightCellId
        return (
          <rect
            key={cell.id}
            data-cell={cell.id}
            x={cell.xMm + marginMm}
            y={cell.yMm}
            width={cell.widthMm}
            height={cell.heightMm}
            fill={speciesHex(cell.speciesId)}
            stroke={isSelected || isHighlighted ? '#111111' : 'rgba(0,0,0,0.18)'}
            strokeWidth={isSelected ? 1.6 : isHighlighted ? 1 : 0.4}
          />
        )
      })}
      {hasLabels && rowLabels ? (
        <g aria-label={t(locale, 'aria.rowLabels')}>
          {rowLabels.map((band, index) => (
            <text
              key={band.id}
              data-testid="row-label"
              x={marginMm / 2}
              y={band.topMm + band.heightMm / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={Math.min(6, Math.max(3, band.heightMm * 0.4))}
              fill="currentColor"
              className="select-none"
            >
              {index + 1}
            </text>
          ))}
        </g>
      ) : null}
    </svg>
  )
}
