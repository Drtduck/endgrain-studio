'use client'

import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t, type Locale } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase/browser'

export const MIN_PASSWORD_LENGTH = 8

export type AuthMode = 'login' | 'register'

export function AuthForm({ mode, locale }: { mode: AuthMode; locale: Locale }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)

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
    </form>
  )
}
