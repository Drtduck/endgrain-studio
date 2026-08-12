'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGoogleAuthAvailable } from '@/components/GoogleAuthProvider'
import { t, type Locale } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase/browser'

export const MIN_PASSWORD_LENGTH = 8

export type AuthMode = 'login' | 'register'

/** Официальный четырёхцветный логотип Google, инлайн, без внешних запросов. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
  )
}

export function AuthForm({ mode, locale }: { mode: AuthMode; locale: Locale }) {
  const router = useRouter()
  const googleAuthAvailable = useGoogleAuthAvailable()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)

  async function onGoogleSignIn(): Promise<void> {
    setError(null)
    setBusy(true)
    const sb = getSupabaseBrowser()
    const { error: oauthError } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    })
    if (oauthError) {
      setBusy(false)
      setError(t(locale, 'auth.errorOAuth'))
    }
    // При успехе браузер уходит на Google редиректом: busy остаётся true,
    // пока не начнётся навигация - лишний сброс состояния здесь не нужен.
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError(null)
    if (mode === 'register' && password.length < MIN_PASSWORD_LENGTH) {
      setError(t(locale, 'auth.errorShortPassword', { min: MIN_PASSWORD_LENGTH }))
      return
    }
    setBusy(true)
    const sb = getSupabaseBrowser()

    if (mode === 'login') {
      const { error: signInError } = await sb.auth.signInWithPassword({ email, password })
      setBusy(false)
      if (signInError) {
        // Сообщение Supabase не показываем дословно: оно на английском и
        // подсказывает, существует ли такой email.
        setError(t(locale, 'auth.errorBadCredentials'))
        return
      }
      router.push('/')
      router.refresh()
      return
    }

    const { data, error: signUpError } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    setBusy(false)
    if (signUpError) {
      setError(t(locale, 'auth.errorSignUp'))
      return
    }
    // Если в проекте включено подтверждение почты, сессии в ответе нет:
    // это не ошибка, а ожидание письма.
    if (!data.session) {
      setConfirmSent(true)
      return
    }
    router.push('/')
    router.refresh()
  }

  if (confirmSent) {
    return (
      <p data-testid="auth-confirm-sent" className="text-sm leading-normal text-ink-secondary">
        {t(locale, 'auth.confirmSent')}
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid={`auth-form-${mode}`}>
      <div className="flex flex-col gap-1">
        <label htmlFor="auth-email" className="text-[11px] text-ink-muted">
          {t(locale, 'auth.email')}
        </label>
        <Input
          id="auth-email"
          data-testid="auth-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="auth-password" className="text-[11px] text-ink-muted">
          {t(locale, 'auth.password')}
        </label>
        <Input
          id="auth-password"
          data-testid="auth-password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={busy}
        />
      </div>

      {error ? (
        <p role="alert" data-testid="auth-error" className="text-sm text-error-text">
          {error}
        </p>
      ) : null}

      <Button type="submit" data-testid="auth-submit" disabled={busy} className="w-full">
        {busy
          ? t(locale, 'auth.busy')
          : t(locale, mode === 'login' ? 'auth.signIn' : 'auth.signUp')}
      </Button>

      {googleAuthAvailable ? (
        <>
          <div className="flex items-center gap-2 text-[11px] text-ink-muted" role="separator">
            <span className="h-px flex-1 bg-line-subtle" />
            {t(locale, 'auth.orDivider')}
            <span className="h-px flex-1 bg-line-subtle" />
          </div>

          <Button
            type="button"
            variant="outline"
            data-testid="auth-google"
            disabled={busy}
            className="w-full"
            onClick={onGoogleSignIn}
          >
            <GoogleLogo />
            {t(locale, 'auth.googleSignIn')}
          </Button>
        </>
      ) : null}
    </form>
  )
}
