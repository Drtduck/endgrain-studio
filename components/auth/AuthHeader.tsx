'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

/**
 * Общая шапка формы входа/регистрации: логотип со ссылкой на лендинг, название
 * продукта и заголовок формы. Используется и на отдельной странице (AuthCard),
 * и во всплывающем окне на лендинге (AuthCta) - чтобы вид не расходился.
 */
export function AuthHeader({
  locale,
  titleKey,
  subtitleKey,
  title,
}: {
  locale: Locale
  titleKey: MessageKey
  subtitleKey?: MessageKey | undefined
  /**
   * Заголовок формы. По умолчанию обычный h1 (страница /login и т.п.), но во
   * всплывающем окне это DialogTitle Base UI - именно он даёт диалогу доступное имя.
   */
  title?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Link href="/" className="flex items-center gap-2 text-ink" data-testid="auth-home">
        <img src="/brand/beaver-mark.png" alt="" width={22} height={22} className="size-[22px] shrink-0" />
        <span className="font-display text-[15px] font-semibold">{t(locale, 'app.title')}</span>
      </Link>
      {title ?? <h1 className="font-display text-xl font-semibold text-ink">{t(locale, titleKey)}</h1>}
      {subtitleKey ? (
        <p className="text-sm leading-normal text-ink-secondary">{t(locale, subtitleKey)}</p>
      ) : null}
    </div>
  )
}
