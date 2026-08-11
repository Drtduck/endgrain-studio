'use client'

import { useEffect } from 'react'
import { Redo2, Undo2 } from 'lucide-react'
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
      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-sm disabled:text-line-strong disabled:hover:bg-transparent"
        data-testid="undo"
        aria-label={t(locale, 'history.undo')}
        disabled={!canUndo}
        onClick={undo}
      >
        <Undo2 size={16} strokeWidth={1.6} />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-8 rounded-sm disabled:text-line-strong disabled:hover:bg-transparent"
        data-testid="redo"
        aria-label={t(locale, 'history.redo')}
        disabled={!canRedo}
        onClick={redo}
      >
        <Redo2 size={16} strokeWidth={1.6} />
      </Button>
    </div>
  )
}
