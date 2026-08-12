'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

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
        <div className="flex flex-col gap-1.5">
          <Link href="/" className="flex items-center gap-2 text-ink" data-testid="auth-home">
            <span className="flex size-[22px] items-center justify-center rounded-xs bg-accent font-display text-[13px] text-ink-inverse">
              E
            </span>
            <span className="font-display text-[15px] font-semibold">{t(locale, 'app.title')}</span>
          </Link>
          <h1 className="font-display text-xl font-semibold text-ink">{t(locale, titleKey)}</h1>
          {subtitleKey ? (
            <p className="text-sm leading-normal text-ink-secondary">{t(locale, subtitleKey)}</p>
          ) : null}
        </div>
        {children}
        {footer ? <div className="flex flex-col gap-1 text-sm text-ink-secondary">{footer}</div> : null}
      </div>
    </div>
  )
}
