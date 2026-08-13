'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { t, type Locale } from '@/lib/i18n'

/**
 * Общая шапка формы входа/регистрации: логотип по центру, под ним название
 * продукта, дальше сразу поля. Используется и на отдельной странице (AuthCard),
 * и во всплывающем окне на лендинге (AuthCta) - чтобы вид не расходился.
 */
export function AuthHeader({
  locale,
  title,
}: {
  locale: Locale
  /**
   * Название продукта. По умолчанию обычный h1 (страница /login и т.п.), но во
   * всплывающем окне это DialogTitle Base UI - именно он даёт диалогу доступное имя.
   */
  title?: ReactNode
}) {
  return (
    <Link
      href="/"
      className="flex flex-col items-center gap-2 text-ink"
      data-testid="auth-home"
      aria-label={t(locale, 'app.title')}
    >
      <img src="/brand/beaver-mark.png" alt="" width={64} height={64} className="size-16 shrink-0" />
      {title ?? <h1 className="font-display text-xl font-semibold text-ink">{t(locale, 'app.title')}</h1>}
    </Link>
  )
}
