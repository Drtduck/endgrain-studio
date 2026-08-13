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
      footer={
        <p>
          {t(locale, 'auth.hasAccountPrompt')}{' '}
          <Link href="/login" data-testid="auth-login-link" className="font-semibold text-accent hover:underline">
            {t(locale, 'auth.signIn')}
          </Link>
        </p>
      }
    >
      <AuthForm mode="register" locale={locale} />
    </AuthCard>
  )
}
