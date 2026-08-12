import { useId } from 'react'
import type { BoardModel } from '@/lib/engine'
import { fitPatternContain, fitPatternCover } from '@/lib/promo/fit'
import type { PromoMockLayout } from '@/lib/promo/types'
import { PatternCells } from './PatternCells'

const W = 320
const H = 240

/**
 * Заглушка кадра на время, пока в окружении нет GEMINI_API_KEY. Это не серая плашка:
 * сцена собрана из настоящего узора доски, поэтому по ней видно и композицию будущего
 * кадра, и то, что генератор получит на вход. Ни одного внешнего файла, только SVG.
 *
 * Пресетов двенадцать, а раскладок четыре: рисовать двенадцать самодельных сцен
 * незачем, у заглушки одна задача - показать, как ляжет узор. Какая раскладка
 * какому пресету достаётся, решает PROMO_SHOT_META.
 */
export function PromoMockShot({ layout, model }: { layout: PromoMockLayout; model: BoardModel }) {
  const id = useId()
  const clip = `promo-clip-${id}`
  const sky = `promo-sky-${id}`
  const { widthMm, lengthMm } = model

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="presentation" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="0" width={W} height={H} />
        </clipPath>
        <linearGradient id={sky} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={layout === 'package' ? '#dedbd4' : '#f7f3ec'} />
          <stop offset="1" stopColor={layout === 'package' ? '#c9c5bd' : '#e6ddcf'} />
        </linearGradient>
      </defs>

      <g clipPath={`url(#${clip})`}>
        <rect x="0" y="0" width={W} height={H} fill={`url(#${sky})`} />

        {layout === 'solo' ? (
          <>
            <ellipse cx={W / 2} cy={205} rx={92} ry={14} fill="rgba(36,30,25,0.16)" />
            <PatternCells model={model} fit={fitPatternContain(widthMm, lengthMm, { x: 108, y: 26, w: 104, h: 168 })} />
          </>
        ) : null}

        {layout === 'scene' ? (
          <>
            <rect x="0" y="150" width={W} height={90} fill="#b98f63" />
            <rect x="0" y="150" width={W} height="4" fill="rgba(36,30,25,0.18)" />
            <PatternCells model={model} fit={fitPatternContain(widthMm, lengthMm, { x: 66, y: 24, w: 130, h: 190 })} />
            {/* Нож лезвием вдоль доски и три помидора: тот же набор, что уйдёт в промпт кадра. */}
            <g transform="rotate(-14 236 120)">
              <rect x="222" y="46" width="16" height="104" rx="3" fill="#cfd3d6" />
              <rect x="222" y="150" width="16" height="46" rx="5" fill="#4a3527" />
            </g>
            <circle cx="88" cy="176" r="13" fill="#c0402f" />
            <circle cx="114" cy="188" r="10" fill="#a93526" />
            <circle cx="66" cy="192" r="9" fill="#c0402f" />
            <path d="M150 196 q14 -18 30 -8 q-16 16 -30 8 z" fill="#4c6b3a" />
          </>
        ) : null}

        {layout === 'macro' ? (
          <>
            <PatternCells model={model} fit={fitPatternCover(widthMm, lengthMm, { x: -320, y: -240, w: 960, h: 720 })} />
            {/* Косой свет и мелкая глубина резкости: светлый клин сверху, затемнение по краям. */}
            <path d={`M0 0 L${W} 0 L${W} 70 L0 150 Z`} fill="rgba(255,252,244,0.28)" />
            <rect x="0" y="0" width={W} height={H} fill="rgba(36,30,25,0.10)" />
          </>
        ) : null}

        {layout === 'package' ? (
          <>
            <rect x="24" y="52" width="150" height="150" rx="4" fill="#c8a778" />
            <rect x="24" y="52" width="150" height="150" rx="4" fill="none" stroke="rgba(36,30,25,0.22)" />
            <path d="M24 118 h150" stroke="rgba(36,30,25,0.18)" fill="none" />
            <PatternCells model={model} fit={fitPatternContain(widthMm, lengthMm, { x: 190, y: 44, w: 96, h: 150 })} />
            <rect x="196" y="196" width="86" height="26" rx="2" fill="#f5f1e8" stroke="rgba(36,30,25,0.18)" />
          </>
        ) : null}
      </g>
    </svg>
  )
}
