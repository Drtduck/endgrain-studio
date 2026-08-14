'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'
import { useNavProgress } from '@/lib/store/nav'

/** Через сколько полоска сдаётся, если переход так и не доехал. */
const GUARD_MS = 15_000

/**
 * Тонкая полоска прогресса поверх всего документа.
 *
 * Зачем вообще: страницы приложения рендерятся на сервере, и между кликом по
 * пункту меню и появлением нового экрана проходит заметное время, в течение
 * которого интерфейс выглядел мёртвым. loading.tsx закрывает содержимое
 * скелетоном, но только после коммита навигации, а полоска зажигается прямо на
 * клике: см. onNavigate в NavLink, которым ходят и шапка студии, и меню аватара.
 *
 * Завершение ловим по смене pathname и searchParams: собственных событий роутера
 * в App Router нет, а смена адреса и есть коммит навигации. На случай прерванного
 * перехода стоит предохранитель по таймауту.
 *
 * Ширина анимируется классом .eg-nav-progress, состояния в React ровно одно
 * (флаг в сторе): полоска не должна ререндерить дерево на каждый кадр.
 * Компонент читает searchParams, поэтому в layout он обёрнут в Suspense.
 */
export function NavProgress() {
  const active = useNavProgress((s) => s.active)
  const run = useNavProgress((s) => s.run)
  const done = useNavProgress((s) => s.done)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Адрес сменился - переход доехал.
  useEffect(() => {
    done()
  }, [pathname, searchParams, done])

  useEffect(() => {
    if (!active) return
    const guard = setTimeout(() => done(), GUARD_MS)
    return () => clearTimeout(guard)
  }, [active, run, done])

  return (
    <div
      data-testid="nav-progress"
      data-active={active ? 'true' : 'false'}
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-100 h-0.5 opacity-0 transition-opacity duration-300 ease-out data-[active=true]:opacity-100 data-[active=true]:duration-0"
    >
      {/* key перезапускает анимацию на каждом новом переходе, иначе второй клик
          подряд рисовал бы полоску с того места, где она замерла. */}
      <div key={run} className={active ? 'h-full bg-accent eg-nav-progress' : 'h-full w-full bg-accent'} />
    </div>
  )
}
