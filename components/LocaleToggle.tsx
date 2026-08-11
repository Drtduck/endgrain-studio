'use client'

import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'

export function LocaleToggle({ locale, onChange }: { locale: Locale; onChange: (l: Locale) => void }) {
  return (
    <div className="flex gap-1" role="group" aria-label="язык интерфейса">
      {(['ru', 'en'] as const).map((l) => (
        <Button key={l} size="sm" variant={l === locale ? 'default' : 'outline'} onClick={() => onChange(l)}>
          {t(locale, l === 'ru' ? 'locale.ru' : 'locale.en')}
        </Button>
      ))}
    </div>
  )
}
