'use client'

import { useEffect } from 'react'
import { t, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  // layout.tsx фиксирует lang="ru" статически (серверный рендер); при переключении локали
  // на клиенте документ должен отражать реальный язык интерфейса.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <div
      role="group"
      aria-label={t(locale, 'aria.localeGroup')}
      className="inline-flex rounded-md bg-surface-sunken p-0.5"
    >
      {(['ru', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          data-testid={`locale-${l}`}
          onClick={() => onChange(l)}
          className={cn(
            'rounded-sm px-2 py-1 font-sans text-xs font-semibold transition-colors duration-hover',
            l === locale ? 'bg-surface-raised shadow-sm' : 'text-ink-secondary',
          )}
        >
          {t(locale, l === 'ru' ? 'locale.ru' : 'locale.en')}
        </button>
      ))}
    </div>
  )
}
