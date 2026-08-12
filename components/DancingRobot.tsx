'use client'

// Пиксельный «танцующий робот» - превью-аватар кнопки обратной связи. Перенесён
// один в один из донорского проекта bets-supa (components/feedback/dancing-robot.tsx),
// styled-jsx заменён классами eg-robot-* в globals.css: styled-jsx в этом проекте
// не подключён. Idle-слой всегда живой, но ненавязчивый: ножки переступают,
// корпус мягко покачивается, изредка моргает. Поверх по таймеру раз в 5 секунд
// прокручивается ОДИН трюк из цикла (переступ с ноги на ногу -> флип -> сальто
// через себя), после чего робот возвращается в покой. Трюки и idle глушатся при
// prefers-reduced-motion. Фирменный цвет совпадает с кнопкой (#D97757), чтобы при
// наведении робот органично «перетёк» в кнопку.

import { useEffect, useRef, useState } from 'react'

// Порядок трюков по кругу. Между любыми двумя - 5 секунд спокойного idle.
const TRICKS = ['hop', 'flip', 'backflip'] as const
type Trick = (typeof TRICKS)[number]

interface DancingRobotProps {
  /** Когда false (показана кнопка) - трюки не заводим, робот замирает. */
  active?: boolean
  className?: string
}

export function DancingRobot({ active = true, className }: DancingRobotProps): React.JSX.Element {
  const [trick, setTrick] = useState<Trick | null>(null)
  const reducedRef = useRef(false)

  useEffect(() => {
    // matchMedia есть не везде (jsdom в тестах его не реализует), поэтому
    // проверяем метод, а не только window: без него считаем движение разрешённым.
    reducedRef.current =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    if (!active || reducedRef.current) {
      setTrick(null)
      return
    }
    let i = 0
    const id = window.setInterval(() => {
      setTrick(TRICKS[i % TRICKS.length] ?? null)
      i += 1
    }, 5000)
    return () => window.clearInterval(id)
  }, [active])

  return (
    <span
      className={className}
      style={{ perspective: '240px', display: 'inline-block', lineHeight: 0 }}
      aria-hidden="true"
    >
      <span
        className={trick !== null ? `eg-robot-trick eg-robot-${trick}` : 'eg-robot-trick'}
        onAnimationEnd={() => setTrick(null)}
      >
        <span className="eg-robot-bob">
          <svg
            width="36"
            height="34"
            viewBox="0 0 44 42"
            shapeRendering="crispEdges"
            style={{ display: 'block', overflow: 'visible' }}
          >
            {/* корпус */}
            <rect x="3" y="3" width="38" height="25" rx="5" fill="#D97757" />
            {/* глаза */}
            <rect className="eg-robot-eye" x="13" y="9" width="6" height="8" fill="#241a16" />
            <rect className="eg-robot-eye" x="25" y="9" width="6" height="8" fill="#241a16" />
            {/* ножки (переступ): крайние в одной фазе, средние в противофазе */}
            <rect className="eg-robot-leg eg-robot-leg-a" x="5" y="27" width="6" height="8" rx="1" fill="#D97757" />
            <rect className="eg-robot-leg eg-robot-leg-b" x="14" y="27" width="6" height="8" rx="1" fill="#D97757" />
            <rect className="eg-robot-leg eg-robot-leg-a" x="24" y="27" width="6" height="8" rx="1" fill="#D97757" />
            <rect className="eg-robot-leg eg-robot-leg-b" x="33" y="27" width="6" height="8" rx="1" fill="#D97757" />
          </svg>
        </span>
      </span>
    </span>
  )
}
