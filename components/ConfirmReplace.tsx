'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Одно окно подтверждения на несколько мест: шаблоны, генератор, фото, сброс студии.
 * Идентификаторы задаются снаружи, потому что за template-confirm уже держатся e2e-тесты
 * третьей фазы, и переименовывать их ради красоты нельзя.
 */
export function ConfirmReplace({
  testId,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  testId: string
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Фокус-ловушка + Escape: модалка не должна отпускать Tab наружу и должна закрываться по Esc,
  // как и полагается диалогу с aria-modal="true".
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    first?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key !== 'Tab' || focusable.length === 0) return
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        }
      } else if (document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4">
      <div
        ref={dialogRef}
        data-testid={`${testId}-confirm-dialog`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="pointer-events-auto flex w-full max-w-[380px] flex-col gap-3 rounded-lg bg-surface p-5 shadow-dialog"
      >
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-sm leading-normal text-ink-secondary">{body}</p>
        <div className="flex justify-end gap-2">
          <Button data-testid={`${testId}-cancel`} size="sm" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button data-testid={`${testId}-confirm`} size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
