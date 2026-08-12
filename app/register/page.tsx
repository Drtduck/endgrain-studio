'use client'

import Link from 'next/link'
import { AuthCard } from '@/components/auth/AuthCard'
import { AuthForm } from '@/components/auth/AuthForm'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

export default function RegisterPage() {
  const locale = useStudio((s) => s.locale)
  return (
    <AuthCard
      locale={locale}
      titleKey="auth.registerTitle"
      subtitleKey="auth.registerSubtitle"
      footer={
        <Link href="/login" data-testid="auth-login-link" className="text-accent hover:underline">
          {t(locale, 'auth.loginLink')}
        </Link>
      }
    >
      {/* Гейт на входе требует объяснения: человек пришёл рисовать доску, а его
          просят завести аккаунт. Говорим честно, что он за это получает. */}
      <p data-testid="auth-register-why" className="mb-4 text-sm leading-normal text-ink-secondary">
        {t(locale, 'auth.registerWhy')}
      </p>
      <AuthForm mode="register" locale={locale} />
    </AuthCard>
  )
}
