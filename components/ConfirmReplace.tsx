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
    <div
      data-testid={`${testId}-confirm-dialog`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-lg border bg-background p-4 shadow-lg"
    >
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-3 flex justify-end gap-2">
        <Button data-testid={`${testId}-cancel`} size="sm" variant="outline" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button data-testid={`${testId}-confirm`} size="sm" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  )
}
