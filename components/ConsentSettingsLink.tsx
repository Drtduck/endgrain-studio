'use client'

import { useConsent } from '@/components/ConsentProvider'
import { t, type Locale } from '@/lib/i18n'

/**
 * Пункт «Настройки cookie» в подвале: раньше вёл на /legal/privacy как обычная
 * ссылка, хотя там нет ничего, кроме отдельного виджета ConsentSettings.
 * Реальные настройки cookie - это сам ConsentBanner (единая точка монтирования
 * в корневом layout, см. components/ConsentBanner.tsx), поэтому клик просто
 * зовёт reopen() из ConsentProvider и снова показывает баннер поверх текущей
 * страницы вместо перехода на другой адрес.
 */
export function ConsentSettingsLink({ locale, testId }: { readonly locale: Locale; readonly testId: string }) {
  const { reopen } = useConsent()

  return (
    <button
      type="button"
      onClick={reopen}
      data-testid={testId}
      className="text-left font-sans text-xs text-ink-secondary hover:text-ink"
    >
      {t(locale, 'landing.footer.legal.cookieSettings')}
    </button>
  )
}
