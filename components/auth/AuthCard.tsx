'use client'

import type { ReactNode } from 'react'
import { AuthHeader } from '@/components/auth/AuthHeader'
import type { Locale, MessageKey } from '@/lib/i18n'

export function AuthCard({
  locale,
  titleKey,
  subtitleKey,
  children,
  footer,
}: {
  locale: Locale
  titleKey: MessageKey
  subtitleKey?: MessageKey
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4 py-10">
      <div
        data-testid="auth-card"
        className="flex w-full max-w-[380px] flex-col gap-5 rounded-lg border border-line-subtle bg-surface p-6 shadow-lg"
      >
        <AuthHeader locale={locale} titleKey={titleKey} subtitleKey={subtitleKey} />
        {children}
        {footer ? (
          <div className="flex flex-col items-center gap-1 text-center text-sm text-ink-secondary">{footer}</div>
        ) : null}
      </div>
    </div>
  )
}
