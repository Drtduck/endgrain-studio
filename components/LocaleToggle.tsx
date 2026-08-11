'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  // layout.tsx фиксирует lang="ru" статически (серверный рендер); при переключении локали
  // на клиенте документ должен отражать реальный язык интерфейса.
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <div className="flex gap-1" role="group" aria-label={t(locale, 'aria.localeGroup')}>
      {(['ru', 'en'] as const).map((l) => (
        <Button key={l} data-testid={`locale-${l}`} size="sm" variant={l === locale ? 'default' : 'outline'} onClick={() => onChange(l)}>
          {t(locale, l === 'ru' ? 'locale.ru' : 'locale.en')}
        </Button>
      ))}
    </div>
  )
}
