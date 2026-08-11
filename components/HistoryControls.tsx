'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { selectCanRedo, selectCanUndo, useStudio } from '@/lib/store/studio'

const EDITABLE = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return EDITABLE.has(target.tagName) || target.isContentEditable
}

export function HistoryControls() {
  const locale = useStudio((s) => s.locale)
  const canUndo = useStudio(selectCanUndo)
  const canRedo = useStudio(selectCanRedo)
  const undo = useStudio((s) => s.undo)
  const redo = useStudio((s) => s.redo)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!(event.metaKey || event.ctrlKey)) return
      // Внутри поля ввода отмена принадлежит браузеру: он откатывает текст, а не документ.
      if (isTypingTarget(event.target)) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo])

  return (
    <div className="flex gap-1" role="group" aria-label={t(locale, 'aria.historyGroup')}>
      <Button size="sm" variant="outline" data-testid="undo" disabled={!canUndo} onClick={undo}>
        {t(locale, 'history.undo')}
      </Button>
      <Button size="sm" variant="outline" data-testid="redo" disabled={!canRedo} onClick={redo}>
        {t(locale, 'history.redo')}
      </Button>
    </div>
  )
}
