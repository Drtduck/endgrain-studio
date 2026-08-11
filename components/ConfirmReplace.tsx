'use client'

import { Button } from '@/components/ui/button'

/**
 * Одно окно подтверждения на три места: шаблоны, генератор, фото.
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
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4">
      <div
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
