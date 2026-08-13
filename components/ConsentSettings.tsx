'use client'

import { useConsent } from '@/components/ConsentProvider'
import { t, type Locale } from '@/lib/i18n'

const SOURCE_KEY = {
  banner: 'consent.settings.sourceBanner',
  gpc: 'consent.settings.sourceGpc',
  settings: 'consent.settings.sourceSettings',
} as const

function formatDate(unixSeconds: number, locale: Locale): string {
  return new Date(unixSeconds * 1000).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')
}

/**
 * Блок «Ваш текущий выбор» на /legal/privacy. Тот же адрес, что открывает ссылка
 * «Настройки cookie» в футере лендинга: отдельного вызова баннера из студии нет,
 * у студии нет футера, а плодить пункт в меню аккаунта ради этого не стоит.
 */
export function ConsentSettings({ locale }: { locale: Locale }) {
  const { analytics, decision, choose } = useConsent()

  return (
    <div data-testid="consent-settings" className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
      <div className="flex flex-col gap-1">
        <span data-testid="consent-settings-status" className="text-sm font-semibold text-ink">
          {t(locale, analytics ? 'consent.settings.enabled' : 'consent.settings.disabled')}
        </span>
        {decision === null ? (
          <span className="text-[13px] text-ink-secondary">{t(locale, 'consent.settings.noDecision')}</span>
        ) : (
          <span data-testid="consent-settings-source" className="text-[13px] text-ink-secondary">
            {t(locale, 'consent.settings.sourceLine', {
              source: t(locale, SOURCE_KEY[decision.source]),
              date: formatDate(decision.at, locale),
            })}
          </span>
        )}
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink">
        <input
          type="checkbox"
          data-testid="consent-settings-toggle"
          checked={analytics}
          onChange={(e) => choose(e.target.checked, 'settings')}
          className="size-4"
        />
        {t(locale, 'consent.settings.toggleLabel')}
      </label>
    </div>
  )
}
