'use client'

import { useState, useTransition } from 'react'
import { changeEmailAction, type ProfileError } from '@/app/actions/profile'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

const ERROR_KEYS: Readonly<Partial<Record<ProfileError, MessageKey>>> = {
  invalid: 'profile.error.invalid',
  taken: 'profile.error.taken',
  failed: 'profile.error.failed',
}

export interface EmailSectionProps {
  readonly locale: Locale
  readonly currentEmail: string
  /** У аккаунта нет provider'а email: вход только через Google, смена почты невозможна. */
  readonly googleOnly: boolean
}

export function EmailSection({ locale, currentEmail, googleOnly }: EmailSectionProps) {
  const [email, setEmail] = useState('')
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<ProfileError | null>(null)
  const [pending, setPending] = useState(false)

  const submit = (): void => {
    setError(null)
    startTransition(async () => {
      const res = await changeEmailAction(email)
      if (res.ok) {
        setPending(true)
        setEmail('')
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <div data-testid="email-section" className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
      <h2 className="font-display text-base font-semibold text-ink">{t(locale, 'profile.email.title')}</h2>
      <p data-testid="email-current" className="text-sm text-ink-secondary">
        {t(locale, 'profile.email.current', { email: currentEmail })}
      </p>

      {googleOnly ? (
        <div className="flex items-center gap-2">
          <Badge data-testid="email-google-badge" variant="outline">
            Google
          </Badge>
          <p data-testid="email-google-note" className="text-sm text-ink-secondary">
            {t(locale, 'profile.email.google')}
          </p>
        </div>
      ) : pending ? (
        <p data-testid="email-pending" className="text-sm text-ink-secondary">
          {t(locale, 'profile.email.pending')}
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="email-new" className="text-xs text-ink-secondary">
              {t(locale, 'profile.email.new')}
            </label>
            <Input
              id="email-new"
              data-testid="email-new-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button data-testid="email-submit" disabled={busy || email.trim().length === 0} onClick={submit}>
            {t(locale, 'profile.email.submit')}
          </Button>
        </div>
      )}

      {error !== null ? (
        <p role="alert" data-testid="email-error" className="text-sm text-error-text">
          {t(locale, ERROR_KEYS[error] ?? 'profile.error.failed')}
        </p>
      ) : null}
    </div>
  )
}
