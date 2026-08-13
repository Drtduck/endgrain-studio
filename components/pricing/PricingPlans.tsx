'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { createCheckoutAction } from '@/app/actions/billing'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics/events'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'
import type { CheckoutError } from '@/lib/stripe/billing'
import type { PlanId } from '@/lib/stripe/plans'
import type { ProReason } from '@/lib/stripe/pro'

export interface PricingPlansProps {
  readonly locale: Locale
  readonly mode: 'checkout' | 'link'
  readonly pro: boolean
  readonly reason: ProReason
  readonly billingEnabled: boolean
  readonly signedIn: boolean
  readonly currentPeriodEnd: string | null
  /** true, когда подписка доработает оплаченный период и не продлится. */
  readonly cancelAtPeriodEnd: boolean
  readonly portalUrl: string
}

const ERROR_KEYS: Readonly<Record<CheckoutError, MessageKey>> = {
  disabled: 'pricing.errDisabled',
  unauthenticated: 'pricing.errAuth',
  invalid: 'pricing.errInvalid',
  already: 'pricing.errAlready',
  failed: 'pricing.errFailed',
}

const FREE_FEATURES: readonly MessageKey[] = [
  'pricing.f.editor',
  'pricing.f.generate',
  'pricing.f.calc',
  'pricing.f.exportBasic',
  'pricing.f.pdfFree',
  'pricing.f.projectsFree',
  'pricing.f.local',
  // API доступен на бесплатном тарифе всем - это главный аргумент выкатывать
  // его сейчас, а не только вместе с оплатой Developer (раздел 9.1 спеки).
  'pricing.f.apiFree',
]

// Pro не повторяет список бесплатного тарифа: одна строка «всё из бесплатного» плюс то, за что платят.
const PRO_FEATURES: readonly MessageKey[] = [
  'pricing.f.allFree',
  'pricing.f.pdfPro',
  'pricing.f.pngPro',
  'pricing.f.projectsPro',
]

// Developer выкатывается без кассы (раздел 9.1/9.3): статус «скоро», кнопки
// оплаты нет вовсе, цены нет вовсе - названная и потом изменённая цена стоит
// дороже, чем не названная.
const DEVELOPER_FEATURES: readonly MessageKey[] = [
  'developer.f.requests',
  'developer.f.keys',
  'developer.f.mcp',
  'developer.f.support',
]

function formatDate(iso: string, locale: Locale): string {
  return new Date(iso).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')
}

function FeatureList({ locale, keys }: { locale: Locale; keys: readonly MessageKey[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {keys.map((key) => (
        <li key={key} className="flex items-start gap-2 text-[13px] text-ink-secondary">
          <Check className="mt-[3px] size-3.5 shrink-0 text-accent" aria-hidden />
          <span>{t(locale, key)}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Единственное место, где описаны обе карточки. Используется дважды: на странице
 * тарифов с настоящими кнопками (mode="checkout") и в секции лендинга со ссылкой
 * в приложение (mode="link"). Лендинг анонимен и в Supabase не ходит, поэтому pro
 * и signedIn там заведомо false.
 */
export function PricingPlans(props: PricingPlansProps) {
  const { locale, mode, pro, reason, billingEnabled, signedIn, currentPeriodEnd, cancelAtPeriodEnd, portalUrl } = props
  const [error, setError] = useState<CheckoutError | null>(null)
  const [busy, startTransition] = useTransition()

  const buy = (plan: PlanId): void => {
    setError(null)
    track('checkout_started', { plan })
    startTransition(async () => {
      const res = await createCheckoutAction(plan)
      if (res.ok) window.location.assign(res.url)
      else setError(res.error)
    })
  }

  const subscribed = pro && reason === 'subscription'

  return (
    <div data-testid="pricing-plans" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <section
          data-testid="pricing-free"
          className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-5"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-semibold text-ink">{t(locale, 'pricing.free.name')}</span>
            <span className="font-mono text-2xl tabular-nums text-ink">{t(locale, 'pricing.free.price')}</span>
            <span className="text-xs text-ink-muted">{t(locale, 'pricing.free.note')}</span>
          </div>
          <FeatureList locale={locale} keys={FREE_FEATURES} />
        </section>

        <section
          data-testid="pricing-pro"
          className="flex flex-col gap-3 rounded-lg border border-accent-border bg-accent-soft p-5"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-semibold text-ink">{t(locale, 'pricing.pro.name')}</span>
            <span className="font-mono text-2xl tabular-nums text-ink">
              {t(locale, 'pricing.pro.monthlyPrice')}{' '}
              <span className="font-sans text-sm text-ink-secondary">{t(locale, 'pricing.pro.monthlyPeriod')}</span>
            </span>
            <span className="text-xs text-ink-muted">
              {t(locale, 'pricing.pro.yearlyPrice')} {t(locale, 'pricing.pro.yearlyPeriod')}.{' '}
              {t(locale, 'pricing.pro.yearlyNote')}
            </span>
          </div>
          <FeatureList locale={locale} keys={PRO_FEATURES} />

          <div className="mt-1 flex flex-col gap-2">
            {mode === 'link' ? (
              <Button size="sm" data-testid="pricing-open-app" render={<a href={`${APP_ORIGIN}/pricing`} />}>
                {t(locale, 'pricing.cta.open')}
              </Button>
            ) : !billingEnabled ? (
              <p
                data-testid="pricing-disabled"
                className="rounded-md border border-line bg-surface px-3 py-[11px] text-[13px] text-ink-secondary"
              >
                {t(locale, 'pricing.disabled')}
              </p>
            ) : !signedIn ? (
              <Button size="sm" data-testid="pricing-need-auth" render={<a href="/login?next=/pricing" />}>
                {t(locale, 'pricing.cta.needAuth')}
              </Button>
            ) : subscribed ? (
              <div className="flex flex-col gap-1.5">
                <span data-testid="pricing-current" className="text-[13px] font-semibold text-ink">
                  {t(locale, 'pricing.current')}
                </span>
                {currentPeriodEnd === null ? null : (
                  <span data-testid="pricing-period" className="text-xs text-ink-secondary">
                    {/* Отменённая подписка честно говорит, что не продлится, а не «оплачено до». */}
                    {t(locale, cancelAtPeriodEnd ? 'pricing.canceling' : 'pricing.until', {
                      date: formatDate(currentPeriodEnd, locale),
                    })}
                  </span>
                )}
                {portalUrl.length > 0 ? (
                  <a
                    href={portalUrl}
                    data-testid="pricing-manage"
                    className="text-[13px] text-accent hover:underline"
                  >
                    {t(locale, 'pricing.manage')}
                  </a>
                ) : null}
              </div>
            ) : (
              <>
                <Button size="sm" data-testid="pricing-buy-monthly" disabled={busy} onClick={() => buy('monthly')}>
                  {busy ? t(locale, 'pricing.busy') : t(locale, 'pricing.cta.monthly')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="pricing-buy-yearly"
                  disabled={busy}
                  onClick={() => buy('yearly')}
                >
                  {busy ? t(locale, 'pricing.busy') : t(locale, 'pricing.cta.yearly')}
                </Button>
              </>
            )}
          </div>
        </section>

        <section
          data-testid="pricing-developer"
          className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-5"
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-semibold text-ink">{t(locale, 'developer.name')}</span>
            <span data-testid="pricing-developer-status" className="font-mono text-2xl tabular-nums text-ink-secondary">
              {t(locale, 'developer.status')}
            </span>
          </div>
          <FeatureList locale={locale} keys={DEVELOPER_FEATURES} />
          <p className="mt-1 rounded-md border border-line bg-surface px-3 py-[11px] text-[13px] text-ink-secondary">
            <a href="mailto:hello@endgrain.app" className="text-accent hover:underline">
              {t(locale, 'developer.emailNote')}
            </a>
          </p>
        </section>
      </div>

      {error === null ? null : (
        <p role="alert" data-testid="pricing-error" className="text-sm text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      )}
    </div>
  )
}
