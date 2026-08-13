'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { AuthCard } from '@/components/auth/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MIN_PASSWORD_LENGTH } from '@/components/auth/AuthForm'
import { t } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase/browser'
import { useStudio } from '@/lib/store/studio'

export default function ResetPasswordPage() {
  const locale = useStudio((s) => s.locale)
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [passwordRepeat, setPasswordRepeat] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t(locale, 'auth.errorShortPassword', { min: MIN_PASSWORD_LENGTH }))
      return
    }
    if (password !== passwordRepeat) {
      setError(t(locale, 'auth.errorPasswordMismatch'))
      return
    }
    setBusy(true)
    // Признак живой ссылки берём по факту ответа, не эффектом с setState:
    // если сессии из /auth/callback нет, updateUser вернёт ошибку.
    const { error: updateError } = await getSupabaseBrowser().auth.updateUser({ password })
    setBusy(false)
    if (updateError) {
      setExpired(true)
      return
    }
    router.push('/')
    router.refresh()
  }

  if (expired) {
    return (
      <AuthCard locale={locale}>
        <p data-testid="auth-reset-expired" className="text-sm leading-normal text-ink-secondary">
          {t(locale, 'auth.resetExpired')}{' '}
          <Link href="/forgot-password" data-testid="auth-forgot-link" className="text-accent hover:underline">
            {t(locale, 'auth.forgotLink')}
          </Link>
        </p>
      </AuthCard>
    )
  }

  return (
    <AuthCard locale={locale} noteKey="auth.resetSubtitle">
      <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="auth-form-reset">
        <div className="flex flex-col gap-1">
          <label htmlFor="auth-password" className="text-[11px] text-ink-muted">
            {t(locale, 'auth.password')}
          </label>
          <Input
            id="auth-password"
            data-testid="auth-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="auth-password-repeat" className="text-[11px] text-ink-muted">
            {t(locale, 'auth.passwordRepeat')}
          </label>
          <Input
            id="auth-password-repeat"
            data-testid="auth-password-repeat"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={passwordRepeat}
            onChange={(e) => setPasswordRepeat(e.target.value)}
            disabled={busy}
          />
        </div>

        {error ? (
          <p role="alert" data-testid="auth-error" className="text-sm text-error-text">
            {error}
          </p>
        ) : null}

        <Button type="submit" data-testid="auth-submit" disabled={busy} className="w-full">
          {busy ? t(locale, 'auth.busy') : t(locale, 'auth.resetSubmit')}
        </Button>
      </form>
    </AuthCard>
  )
}
