'use client'

import { X } from 'lucide-react'
import { useConsent } from '@/components/ConsentProvider'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Одна точка монтирования на оба домена: лендинг рендерится через rewrite внутри
 * того же корневого layout, поэтому баннер ставится один раз здесь и покрывает
 * лендинг, студию, /pricing, /login и правовые страницы разом.
 * Нижняя панель, не модалка: закон не требует блокировать интерфейс ни в ЕС,
 * ни по 420-ФЗ, а нижняя часть экрана остаётся кликабельной для всего остального.
 */
export function ConsentBanner() {
  const locale = useStudio((s) => s.locale)
  const { regime, decided, gpc, decision, choose } = useConsent()

  // Видимое подтверждение обработки сигнала GPC (прецедент Sephora): показывается
  // вместо обычного баннера, даже если аналитика и так уже была denied по умолчанию,
  // потому что подтверждать нужно факт обработки сигнала, а не факт изменения состояния.
  const showGpcAck = gpc && decision?.source === 'gpc'
  if (showGpcAck) {
    return (
      <div
        data-testid="consent-gpc-ack"
        role="status"
        className="fixed inset-x-0 bottom-0 z-50 flex items-start gap-3 border-t border-line bg-surface-raised px-4 py-3"
      >
        <p className="min-w-0 flex-1 text-[13px] text-ink-secondary">{t(locale, 'consent.gpcAck')}</p>
        <Button
          variant="ghost"
          size="sm"
          data-testid="consent-gpc-ack-close"
          aria-label={t(locale, 'consent.close')}
          onClick={() => choose(false, 'gpc')}
        >
          <X />
        </Button>
      </div>
    )
  }

  if (decided) return null

  const optIn = regime === 'opt-in'

  return (
    <div
      data-testid="consent-banner"
      role="region"
      aria-label={t(locale, 'consent.bannerAriaLabel')}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3 border-t border-line bg-surface-raised px-4 py-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[13px] text-ink-secondary">{t(locale, optIn ? 'consent.optInText' : 'consent.optOutText')}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
          <a href="/legal/privacy" data-testid="consent-link-privacy" className="text-accent hover:underline">
            {t(locale, 'consent.privacyLink')}
          </a>
          {locale === 'ru' ? (
            <a href="/legal/personal-data" data-testid="consent-link-personal-data" className="text-accent hover:underline">
              {t(locale, 'consent.personalDataLink')}
            </a>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        {optIn ? (
          <>
            <Button
              variant="outline"
              size="sm"
              data-testid="consent-decline"
              onClick={() => choose(false, 'banner')}
            >
              {t(locale, 'consent.decline')}
            </Button>
            <Button size="sm" data-testid="consent-accept" onClick={() => choose(true, 'banner')}>
              {t(locale, 'consent.accept')}
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="outline"
              size="sm"
              data-testid="consent-disable-analytics"
              onClick={() => choose(false, 'banner')}
            >
              {t(locale, 'consent.disableAnalytics')}
            </Button>
            <Button size="sm" data-testid="consent-got-it" onClick={() => choose(true, 'banner')}>
              {t(locale, 'consent.gotIt')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
