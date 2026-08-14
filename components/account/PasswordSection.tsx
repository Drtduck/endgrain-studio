'use client'

import { useState, useTransition } from 'react'
import { changePasswordAction, sendSetPasswordAction, type ProfileError } from '@/app/actions/profile'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

const ERROR_KEYS: Readonly<Partial<Record<ProfileError, MessageKey>>> = {
  invalid: 'profile.error.invalid',
  failed: 'profile.error.failed',
  wrongPassword: 'profile.password.wrong',
}

export interface PasswordSectionProps {
  readonly locale: Locale
  /** Есть ли у аккаунта provider email (пароль Supabase). Google-only без пароля видит только письмо. */
  readonly hasPassword: boolean
}

export function PasswordSection({ locale, hasPassword }: PasswordSectionProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [busy, startTransition] = useTransition()
  const [error, setError] = useState<ProfileError | 'mismatch' | null>(null)
  const [saved, setSaved] = useState(false)
  const [sent, setSent] = useState(false)

  const submit = (): void => {
    setError(null)
    setSaved(false)
    if (password !== repeat) {
      setError('mismatch')
      return
    }
    startTransition(async () => {
      const res = await changePasswordAction(currentPassword, password)
      if (res.ok) {
        setSaved(true)
        setCurrentPassword('')
        setPassword('')
        setRepeat('')
      } else {
        setError(res.error)
      }
    })
  }

  const sendLink = (): void => {
    setError(null)
    startTransition(async () => {
      const res = await sendSetPasswordAction()
      if (res.ok) setSent(true)
      else setError(res.error)
    })
  }

  return (
    <div data-testid="password-section" className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
      <h2 className="font-display text-base font-semibold text-ink">{t(locale, 'profile.password.title')}</h2>

      {!hasPassword ? (
        sent ? (
          <p data-testid="password-sent" className="text-sm text-ink-secondary">
            {t(locale, 'profile.password.sent')}
          </p>
        ) : (
          <Button data-testid="password-set-via-email" variant="outline" disabled={busy} onClick={sendLink}>
            {t(locale, 'profile.password.setViaEmail')}
          </Button>
        )
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="password-current" className="text-xs text-ink-secondary">
                {t(locale, 'profile.password.current')}
              </label>
              <Input
                id="password-current"
                data-testid="password-current-input"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="password-new" className="text-xs text-ink-secondary">
                {t(locale, 'profile.password.new')}
              </label>
              <Input
                id="password-new"
                data-testid="password-new-input"
                type="password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="password-repeat" className="text-xs text-ink-secondary">
                {t(locale, 'profile.password.repeat')}
              </label>
              <Input
                id="password-repeat"
                data-testid="password-repeat-input"
                type="password"
                minLength={8}
                value={repeat}
                onChange={(e) => setRepeat(e.target.value)}
                disabled={busy}
              />
            </div>
            <Button
              data-testid="password-submit"
              disabled={busy || currentPassword.length === 0 || password.length === 0}
              onClick={submit}
            >
              {t(locale, 'profile.password.submit')}
            </Button>
          </div>
          {saved ? (
            <span data-testid="password-saved" className="text-sm text-ink-secondary">
              {t(locale, 'profile.saved')}
            </span>
          ) : null}
        </div>
      )}

      {error !== null ? (
        <p role="alert" data-testid="password-error" className="text-sm text-error-text">
          {error === 'mismatch' ? t(locale, 'profile.password.mismatch') : t(locale, ERROR_KEYS[error] ?? 'profile.error.failed')}
        </p>
      ) : null}
    </div>
  )
}
