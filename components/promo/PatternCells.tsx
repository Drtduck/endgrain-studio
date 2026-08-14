import { cellPolygon, type BoardModel } from '@/lib/engine'
import type { PrintFit } from '@/lib/promo/fit'
import { speciesHex } from '@/lib/species'

/**
 * Ячейки торца, вписанные в сцену по готовому PrintFit. Общий кусок для мокапов мерча
 * и для сцен-заглушек серии фото: узор в обеих панелях обязан быть один и тот же.
 * Клеевой шов рисуем обводкой в мм-координатах, чтобы он не толстел вместе с масштабом.
 */
export function PatternCells({ model, fit }: { model: BoardModel; fit: PrintFit }) {
  if (fit.scale <= 0) return null
  const seamMm = 1 / fit.scale
  return (
    <g transform={`translate(${fit.dx} ${fit.dy}) scale(${fit.scale})`}>
      {model.cells.map((cell) => {
        if (cell.poly !== undefined) {
          // Угловая ячейка: точная геометрия полигоном, координаты уже в системе группы.
          const points = cellPolygon(cell)
            .map(([x, y]) => `${x},${y}`)
            .join(' ')
          return (
            <polygon
              key={cell.id}
              points={points}
              fill={speciesHex(cell.speciesId)}
              stroke="rgba(0,0,0,0.16)"
              strokeWidth={seamMm}
            />
          )
        }
        return (
          <rect
            key={cell.id}
            x={cell.xMm}
            y={cell.yMm}
            width={cell.widthMm}
            height={cell.heightMm}
            fill={speciesHex(cell.speciesId)}
            stroke="rgba(0,0,0,0.16)"
            strokeWidth={seamMm}
          />
        )
      })}
    </g>
  )
}
