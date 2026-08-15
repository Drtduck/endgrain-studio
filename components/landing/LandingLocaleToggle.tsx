'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setLandingLocaleAction } from '@/app/actions/locale'
import { t, type Locale } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function LandingLocaleToggle({ locale }: { locale: Locale }) {
  const [, startTransition] = useTransition()
  const router = useRouter()

  function handleChange(next: Locale): void {
    if (next === locale) return
    startTransition(async () => {
      // revalidatePath(LANDING_PATH) внутри экшена чинит только /landing;
      // компонент рендерится и на /blog, поэтому текущий маршрут догоняем
      // явным refresh() уже после того, как cookie дописана на сервере.
      await setLandingLocaleAction(next)
      router.refresh()
    })
  }

  return (
    <div role="group" aria-label={t(locale, 'landing.locale.aria')} className="inline-flex rounded-md bg-surface-sunken p-0.5">
      {(['ru', 'en'] as const).map((l) => (
        <button
          key={l}
          type="button"
          data-testid={`landing-locale-${l}`}
          onClick={() => handleChange(l)}
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
