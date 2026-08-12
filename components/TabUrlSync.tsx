'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSession } from '@/components/SessionProvider'
import { STUDIO_VIEWS, useStudio, type StudioView } from '@/lib/store/studio'

function isStudioView(value: string | null): value is StudioView {
  return value !== null && (STUDIO_VIEWS as readonly string[]).includes(value)
}

/**
 * Двусторонняя синхронизация активной вкладки студии с `?tab=` в адресной строке.
 *
 * Отдельный компонент, а не эффект внутри StudioTabs/StudioShell: useSearchParams
 * требует Suspense-границу, и заворачивать в неё весь StudioShell ради одного query-
 * параметра ни к чему. Стор (`useStudio`) - модульный синглтон, поэтому этот компонент
 * можно смонтировать рядом со StudioShell, а не внутри него - обновление URL при клике
 * по вкладке ловится тут же, без правки StudioTabs/PhotoImport/TemplateGallery/
 * GeneratorPanel/ProjectsPanel (все они меняют `view` напрямую через store.setView).
 *
 * suppressWriteRef гасит эхо: когда вкладку меняет чтение URL (прямой заход, кнопка
 * «назад»), обратная запись в URL в том же цикле эффектов пропускается, иначе первый
 * рендер после наружной навигации на миг откатывает адресную строку к дефолтной
 * вкладке (store ещё не успел обновиться до setView).
 */
export function TabUrlSync() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const view = useStudio((s) => s.view)
  const setView = useStudio((s) => s.setView)
  const { user, enabled } = useSession()
  const suppressWriteRef = useRef(false)

  const tabParam = searchParams.get('tab')

  // URL -> store: прямой заход по ссылке, кнопка «назад», ручная правка адресной строки.
  useEffect(() => {
    if (!isStudioView(tabParam)) return
    // Вкладка облачных проектов существует только для вошедшего пользователя (см. StudioTabs):
    // гостю с ?tab=projects откатываем на редактор ниже, во write-эффекте.
    if (tabParam === 'projects' && !(enabled && user)) return
    if (tabParam === useStudio.getState().view) return
    suppressWriteRef.current = true
    setView(tabParam)
  }, [tabParam, enabled, user, setView])

  // store -> URL: клик по вкладке (и любой другой setView, например возврат в
  // редактор после генерации/импорта фото/загрузки шаблона или проекта).
  useEffect(() => {
    if (suppressWriteRef.current) {
      suppressWriteRef.current = false
      return
    }
    if (pathname === null) return
    // Сессия слетела, пока была открыта вкладка проектов (например, вышли из
    // аккаунта): откатываем и store, и URL на редактор.
    if (view === 'projects' && !(enabled && user)) {
      setView('editor')
      return
    }
    const desiredParam = view === 'editor' ? null : view
    const currentParam = searchParams.get('tab')
    if (currentParam === desiredParam) return
    const params = new URLSearchParams(searchParams.toString())
    if (desiredParam === null) params.delete('tab')
    else params.set('tab', desiredParam)
    const qs = params.toString()
    router.replace(qs.length > 0 ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [view, enabled, user, pathname, router, searchParams, setView])

  return null
}
