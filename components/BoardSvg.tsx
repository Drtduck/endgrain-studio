import type { BoardModel } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { speciesHex } from '@/lib/species'

export function BoardSvg({
  model,
  locale,
  maxPx = 640,
  highlightCellId = null,
  selectedCellId = null,
}: {
  model: BoardModel
  locale: Locale
  maxPx?: number
  highlightCellId?: string | null
  selectedCellId?: string | null
}) {
  if (model.widthMm <= 0 || model.lengthMm <= 0) return <svg role="img" aria-label={t(locale, 'aria.emptyBoard')} />

  const scale = maxPx / Math.max(model.widthMm, model.lengthMm)

  return (
    <svg
      viewBox={`0 0 ${model.widthMm} ${model.lengthMm}`}
      width={model.widthMm * scale}
      height={model.lengthMm * scale}
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
            x={cell.xMm}
            y={cell.yMm}
            width={cell.widthMm}
            height={cell.heightMm}
            fill={speciesHex(cell.speciesId)}
            stroke={isSelected || isHighlighted ? '#111111' : 'rgba(0,0,0,0.18)'}
            strokeWidth={isSelected ? 1.6 : isHighlighted ? 1 : 0.4}
          />
        )
      })}
    </svg>
  )
}
