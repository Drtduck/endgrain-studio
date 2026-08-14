'use client'

import { useState, useTransition } from 'react'
import { deleteAccountAction, type ProfileError } from '@/app/actions/profile'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

const ERROR_KEYS: Readonly<Partial<Record<ProfileError, MessageKey>>> = {
  confirmMismatch: 'profile.error.invalid',
  unavailable: 'profile.error.failed',
  failed: 'profile.error.failed',
}

export interface DangerZoneProps {
  readonly locale: Locale
  /** Подтверждение вводом собственной почты - защита от случайного клика по необратимой кнопке. */
  readonly email: string
}

export function DangerZone({ locale, email }: DangerZoneProps) {
  const [open, setOpen] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState('')
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<ProfileError | null>(null)

  const submit = (): void => {
    setError(null)
    startTransition(async () => {
      // При успехе deleteAccountAction сама делает redirect('/') и сюда управление
      // не возвращается: ok:false - единственная ветка, которую есть смысл разбирать.
      const res = await deleteAccountAction(confirmEmail)
      if (!res.ok) setError(res.error)
    })
  }

  return (
    <div data-testid="danger-zone" className="flex flex-col gap-3 rounded-lg border border-error-border bg-error-soft p-4">
      <h2 className="font-display text-base font-semibold text-error-text">{t(locale, 'profile.danger.title')}</h2>
      <p className="text-sm text-error-text">{t(locale, 'profile.danger.warning')}</p>

      <Button variant="destructive" size="sm" data-testid="danger-open" onClick={() => setOpen(true)} className="w-fit">
        {t(locale, 'profile.danger.submit')}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) {
            setConfirmEmail('')
            setError(null)
          }
        }}
      >
        <DialogContent data-testid="danger-confirm-dialog" backdropTestId="danger-confirm-backdrop" className="w-[min(420px,92vw)] gap-4">
          <DialogTitle>{t(locale, 'profile.danger.title')}</DialogTitle>
          <DialogDescription>{t(locale, 'profile.danger.warning')}</DialogDescription>

          <div className="flex flex-col gap-1">
            <label htmlFor="danger-confirm-email" className="text-xs text-ink-secondary">
              {t(locale, 'profile.danger.confirmLabel')}
            </label>
            <Input
              id="danger-confirm-email"
              data-testid="danger-confirm-email"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              disabled={busy}
              autoComplete="off"
            />
          </div>

          {error !== null ? (
            <p role="alert" data-testid="danger-error" className="text-sm text-error-text">
              {t(locale, ERROR_KEYS[error] ?? 'profile.error.failed')}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" data-testid="danger-cancel" onClick={() => setOpen(false)}>
              {t(locale, 'profile.danger.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="danger-confirm"
              disabled={busy || confirmEmail.trim().toLowerCase() !== email.trim().toLowerCase()}
              onClick={submit}
            >
              {busy ? t(locale, 'profile.danger.deleting') : t(locale, 'profile.danger.submit')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
