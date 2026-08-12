'use client'

import Link from 'next/link'
import { AuthCard } from '@/components/auth/AuthCard'
import { AuthForm } from '@/components/auth/AuthForm'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

export default function LoginPage() {
  const locale = useStudio((s) => s.locale)
  return (
    <AuthCard
      locale={locale}
      titleKey="auth.loginTitle"
      subtitleKey="auth.loginSubtitle"
      footer={
        <>
          <Link href="/forgot-password" data-testid="auth-forgot-link" className="text-accent hover:underline">
            {t(locale, 'auth.forgotLink')}
          </Link>
          <Link href="/register" data-testid="auth-register-link" className="text-accent hover:underline">
            {t(locale, 'auth.registerLink')}
          </Link>
        </>
      }
    >
      <AuthForm mode="login" locale={locale} />
    </AuthCard>
  )
}
