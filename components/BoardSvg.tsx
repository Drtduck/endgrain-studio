import { Fragment } from 'react'
import { cellPolygon, insetConvex, type BoardModel, type Cell, type ColBand, type RowBand } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { boardLayout } from '@/lib/render2d/layout'
import { speciesHex } from '@/lib/species'

/**
 * Точки полигона ячейки под угловым резом, сжатого на клеевой зазор и сдвинутого в координаты
 * svg (marginMm - та же поправка, что у прямоугольной ветки). Пустой результат insetConvex
 * (ячейка тоньше зазора) возвращает пустую строку - вызывающий код такую ячейку пропускает.
 */
function polygonPoints(cell: Cell, marginMm: number, halfGapMm: number): string {
  const inset = insetConvex(cellPolygon(cell), halfGapMm)
  return inset.map(([x, y]) => `${x + marginMm},${y}`).join(' ')
}

export function BoardSvg({
  model,
  locale,
  maxPx = 640,
  highlightCellId = null,
  selectedCellId = null,
  rowLabels,
  colLabels,
  touchedCellIds,
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
  /** Список колонок для полосы нумерации под доской. Опционален, та же логика, что у rowLabels. */
  colLabels?: readonly ColBand[]
  /**
   * Ячейки, которых ещё не касалась ни одна правка. Опционален: превью (шаблоны, генератор,
   * фото-импорт) и экспорт его не передают, поэтому там подсветки нет.
   */
  touchedCellIds?: ReadonlySet<string>
}) {
  if (model.widthMm <= 0 || model.lengthMm <= 0) return <svg role="img" aria-label={t(locale, 'aria.emptyBoard')} />

  const hasLabels = Boolean(rowLabels && rowLabels.length > 0)
  const hasColLabels = Boolean(colLabels && colLabels.length > 0)
  const layout = boardLayout(model, { maxPx, withRowLabels: hasLabels, withColLabels: hasColLabels })
  const marginMm = layout.marginMm
  // Клеевой зазор 2px переведён в мм-координаты доски: каждая ячейка ужимается на gapMm/2
  // с каждой стороны, а подложка BoardCanvas (bg-surface) видна в получившейся линии.
  const gapMm = layout.scale > 0 ? 2 / layout.scale : 0
  const halfGapMm = gapMm / 2
  const selectionStrokeMm = layout.scale > 0 ? 2 / layout.scale : 0
  const labelFontSizeMm = layout.scale > 0 ? 10 / layout.scale : 0

  return (
    <svg
      viewBox={layout.viewBox}
      width={layout.widthPx}
      height={layout.heightPx}
      role="img"
      aria-label={t(locale, 'aria.boardPreview')}
      className="h-auto max-w-full rounded-lg shadow-sm"
    >
      {model.cells.map((cell) => {
        const isActive = cell.id === selectedCellId || cell.id === highlightCellId
        const isUntouched = touchedCellIds !== undefined && !touchedCellIds.has(cell.id)

        if (cell.poly !== undefined) {
          // Угловая ячейка: точная геометрия полигоном, зазор через insetConvex. Пустой
          // результат (ячейка тоньше зазора) пропускается целиком, как и её подсветка.
          const points = polygonPoints(cell, marginMm, halfGapMm)
          if (points === '') return null
          return (
            <Fragment key={cell.id}>
              <polygon
                data-cell={cell.id}
                points={points}
                fill={speciesHex(cell.speciesId)}
                {...(isActive ? { stroke: 'var(--selection)', strokeWidth: selectionStrokeMm } : {})}
              />
              {isUntouched ? (
                <polygon
                  data-testid="cell-untouched"
                  points={points}
                  fill="var(--touched-highlight)"
                  pointerEvents="none"
                />
              ) : null}
            </Fragment>
          )
        }

        const x = cell.xMm + marginMm + halfGapMm
        const y = cell.yMm + halfGapMm
        const width = Math.max(0, cell.widthMm - gapMm)
        const height = Math.max(0, cell.heightMm - gapMm)
        return (
          <Fragment key={cell.id}>
            <rect
              data-cell={cell.id}
              x={x}
              y={y}
              width={width}
              height={height}
              fill={speciesHex(cell.speciesId)}
              {...(isActive ? { stroke: 'var(--selection)', strokeWidth: selectionStrokeMm } : {})}
            />
            {isUntouched ? (
              <rect
                data-testid="cell-untouched"
                x={x}
                y={y}
                width={width}
                height={height}
                fill="var(--touched-highlight)"
                pointerEvents="none"
              />
            ) : null}
          </Fragment>
        )
      })}
      {hasLabels && rowLabels ? (
        <g aria-label={t(locale, 'aria.rowLabels')}>
          {rowLabels.map((band, index) => (
            <text
              key={band.id}
              data-testid="row-label"
              data-row={band.id}
              role="button"
              tabIndex={0}
              x={marginMm - halfGapMm}
              y={band.topMm + band.heightMm / 2}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={labelFontSizeMm}
              fill="var(--text-muted)"
              className="cursor-pointer font-mono select-none"
            >
              {index + 1}
            </text>
          ))}
        </g>
      ) : null}
      {hasColLabels && colLabels ? (
        <g aria-label={t(locale, 'aria.colLabels')}>
          {colLabels.map((band, index) => (
            <text
              key={index}
              data-testid="col-label"
              data-col={index}
              role="button"
              tabIndex={0}
              x={marginMm + band.leftMm + band.widthMm / 2}
              y={model.lengthMm + layout.colMarginMm / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={labelFontSizeMm}
              fill="var(--text-muted)"
              className="cursor-pointer font-mono select-none"
            >
              {index + 1}
            </text>
          ))}
        </g>
      ) : null}
    </svg>
  )
}
