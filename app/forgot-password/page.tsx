'use client'

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { AuthCard } from '@/components/auth/AuthCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { t } from '@/lib/i18n'
import { getSupabaseBrowser } from '@/lib/supabase/browser'
import { useStudio } from '@/lib/store/studio'

export default function ForgotPasswordPage() {
  const locale = useStudio((s) => s.locale)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setBusy(true)
    // Результат намеренно не разбираем: ответ обязан быть одинаковым и для
    // существующей почты, и для чужой, иначе форма превращается в проверялку
    // «есть ли такой аккаунт».
    await getSupabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setBusy(false)
    setSent(true)
  }

  return (
    <AuthCard
      locale={locale}
      noteKey="auth.forgotSubtitle"
      footer={
        <Link href="/login" data-testid="auth-login-link" className="text-accent hover:underline">
          {t(locale, 'auth.backToLogin')}
        </Link>
      }
    >
      {sent ? (
        <p data-testid="auth-forgot-sent" className="text-sm leading-normal text-ink-secondary">
          {t(locale, 'auth.forgotSent')}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="auth-form-forgot">
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
          <Button type="submit" data-testid="auth-submit" disabled={busy} className="w-full">
            {busy ? t(locale, 'auth.busy') : t(locale, 'auth.forgotSubmit')}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
