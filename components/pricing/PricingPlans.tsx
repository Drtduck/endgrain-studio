'use client'

import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { createCheckoutAction } from '@/app/actions/billing'
import { Button } from '@/components/ui/button'
import { track } from '@/lib/analytics/events'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'
import type { CheckoutError } from '@/lib/stripe/billing'
import type { Product } from '@/lib/stripe/plans'
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
  /** Цены API Developer заведены в кассе: без них карточка остаётся блоком «Скоро» с почтой. */
  readonly apiEnabled: boolean
  /** Цена разового Пропуска заведена в кассе: без неё карточка Пропуска скрывается. */
  readonly passEnabled: boolean
  /** Живая подписка API Developer у текущего пользователя. */
  readonly apiSubscribed: boolean
  /** Дата окончания активного Пропуска, если он есть. null - пропуска нет или он не куплен. */
  readonly passExpiresAt: string | null
}

type CheckoutPlan = Product | 'pass'

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
  'pricing.f.aiTrial',
  'pricing.f.aiListing',
  'pricing.f.projectsFree',
  'pricing.f.local',
  // API доступен на бесплатном тарифе всем - это главный аргумент выкатывать
  // его сейчас, а не только вместе с оплатой Developer (раздел 9.1 спеки).
  'pricing.f.apiFree',
]

// Pro не повторяет список бесплатного тарифа: одна строка «всё из бесплатного» плюс то, за что платят.
const PRO_FEATURES: readonly MessageKey[] = [
  'pricing.f.allFree',
  'pricing.f.aiPro',
  'pricing.f.pdfPro',
  'pricing.f.pngPro',
  'pricing.f.projectsPro',
]

const PASS_FEATURES: readonly MessageKey[] = [
  'pricing.pass.f.days',
  'pricing.pass.f.ai',
  'pricing.pass.f.noRenew',
  'pricing.pass.f.why',
]

const DEVELOPER_FEATURES: readonly MessageKey[] = [
  'developer.f.requests',
  'developer.f.keys',
  'developer.f.mcp',
  'developer.f.support',
  'developer.f.freeStay',
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
 * Общий хвост CTA-блока карточки: гвард кассы -> «войдите» -> кнопка покупки.
 * Ветки mode="link" и «уже оформлено» у каждой карточки свои (см. вызовы ниже),
 * потому что показывают разное, а этот кусок - буквально одно и то же трижды.
 */
function PlanCta(props: {
  readonly locale: Locale
  readonly enabled: boolean
  readonly signedIn: boolean
  readonly busy: boolean
  readonly onBuy: () => void
  readonly buyTestId: string
  readonly ctaKey: MessageKey
  readonly disabledTestId: string
  readonly needAuthTestId: string
  readonly needAuthHref: string
}) {
  const { locale, enabled, signedIn, busy, onBuy, buyTestId, ctaKey, disabledTestId, needAuthTestId, needAuthHref } = props

  if (!enabled) {
    return (
      <p data-testid={disabledTestId} className="rounded-md border border-line bg-surface px-3 py-[11px] text-[13px] text-ink-secondary">
        {t(locale, 'pricing.disabled')}
      </p>
    )
  }

  if (!signedIn) {
    return (
      <Button size="sm" data-testid={needAuthTestId} render={<a href={needAuthHref} />}>
        {t(locale, 'pricing.cta.needAuth')}
      </Button>
    )
  }

  return (
    <Button size="sm" data-testid={buyTestId} disabled={busy} onClick={onBuy}>
      {busy ? t(locale, 'pricing.busy') : t(locale, ctaKey)}
    </Button>
  )
}

/**
 * Единственное место, где описаны все карточки. Используется дважды: на странице
 * тарифов с настоящими кнопками (mode="checkout") и в секции лендинга со ссылкой
 * в приложение (mode="link"). Лендинг анонимен и в Supabase не ходит, поэтому pro,
 * signedIn, apiSubscribed и passExpiresAt там заведомо false/null.
 */
export function PricingPlans(props: PricingPlansProps) {
  const {
    locale,
    mode,
    pro,
    reason,
    billingEnabled,
    signedIn,
    currentPeriodEnd,
    cancelAtPeriodEnd,
    portalUrl,
    apiEnabled,
    passEnabled,
    apiSubscribed,
    passExpiresAt,
  } = props
  const [error, setError] = useState<CheckoutError | null>(null)
  const [busy, startTransition] = useTransition()

  const buy = (plan: CheckoutPlan): void => {
    setError(null)
    track('checkout_started', { plan })
    startTransition(async () => {
      const res = await createCheckoutAction(plan)
      if (res.ok) window.location.assign(res.url)
      else setError(res.error)
    })
  }

  // Подписка и Пропуск оба дают Pro: подписка старше (см. resolveProStatus),
  // но обе причины блокируют повторную покупку Pro и снимают кнопку.
  const proSubscribed = pro && (reason === 'subscription' || reason === 'pass')
  // Пропуск можно докупать поверх уже активного пропуска (grant_pro_pass продлевает
  // окно), заблокирована повторная покупка только поверх настоящей подписки.
  const passBuyBlocked = reason === 'subscription'

  return (
    <div data-testid="pricing-plans" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

        {!passEnabled ? null : (
          <section
            data-testid="pricing-pass"
            className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-5"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-lg font-semibold text-ink">{t(locale, 'pricing.pass.name')}</span>
              <span className="font-mono text-2xl tabular-nums text-ink">{t(locale, 'pricing.pass.price')}</span>
              <span className="text-xs text-ink-muted">{t(locale, 'pricing.pass.note')}</span>
            </div>
            <FeatureList locale={locale} keys={PASS_FEATURES} />

            {mode === 'link' ? null : (
              <div className="mt-1 flex flex-col gap-2">
                {passExpiresAt !== null ? (
                  <span data-testid="pricing-pass-until" className="text-[13px] text-ink-secondary">
                    {t(locale, 'pricing.pass.until', { date: formatDate(passExpiresAt, locale) })}
                  </span>
                ) : null}
                {passBuyBlocked ? null : (
                  <PlanCta
                    locale={locale}
                    enabled={billingEnabled}
                    signedIn={signedIn}
                    busy={busy}
                    onBuy={() => buy('pass')}
                    buyTestId="pricing-buy-pass"
                    ctaKey="pricing.pass.cta"
                    disabledTestId="pricing-pass-disabled"
                    needAuthTestId="pricing-pass-need-auth"
                    needAuthHref="/login?next=/pricing"
                  />
                )}
              </div>
            )}
          </section>
        )}

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
            <span className="text-xs text-ink-muted">{t(locale, 'pricing.pro.note')}</span>
          </div>
          <FeatureList locale={locale} keys={PRO_FEATURES} />

          <div className="mt-1 flex flex-col gap-2">
            {mode === 'link' ? (
              <Button size="sm" data-testid="pricing-open-app" render={<a href={`${APP_ORIGIN}/pricing`} />}>
                {t(locale, 'pricing.cta.open')}
              </Button>
            ) : proSubscribed ? (
              <div className="flex flex-col gap-1.5">
                <span data-testid="pricing-current" className="text-[13px] font-semibold text-ink">
                  {t(locale, 'pricing.current')}
                </span>
                {currentPeriodEnd === null ? null : reason === 'pass' ? (
                  <span data-testid="pricing-period" className="text-xs text-ink-secondary">
                    {t(locale, 'pricing.pass.until', { date: formatDate(currentPeriodEnd, locale) })}
                  </span>
                ) : (
                  <span data-testid="pricing-period" className="text-xs text-ink-secondary">
                    {/* Отменённая подписка честно говорит, что не продлится, а не «оплачено до». */}
                    {t(locale, cancelAtPeriodEnd ? 'pricing.canceling' : 'pricing.until', {
                      date: formatDate(currentPeriodEnd, locale),
                    })}
                  </span>
                )}
                {portalUrl.length === 0 || reason === 'pass' ? null : (
                  <a
                    href={portalUrl}
                    data-testid="pricing-manage"
                    className="text-[13px] text-accent hover:underline"
                  >
                    {t(locale, 'pricing.manage')}
                  </a>
                )}
              </div>
            ) : (
              <>
                <PlanCta
                  locale={locale}
                  enabled={billingEnabled}
                  signedIn={signedIn}
                  busy={busy}
                  onBuy={() => buy('pro')}
                  buyTestId="pricing-buy-pro"
                  ctaKey="pricing.cta.pro"
                  disabledTestId="pricing-disabled"
                  needAuthTestId="pricing-need-auth"
                  needAuthHref="/login?next=/pricing"
                />
                {billingEnabled ? (
                  <span className="text-xs text-ink-muted">{t(locale, 'pricing.pro.checkoutHint')}</span>
                ) : null}
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
            {apiEnabled ? (
              <span className="font-mono text-2xl tabular-nums text-ink">
                {t(locale, 'developer.price')}{' '}
                <span className="font-sans text-sm text-ink-secondary">{t(locale, 'developer.period')}</span>
              </span>
            ) : (
              <span data-testid="pricing-developer-status" className="font-mono text-2xl tabular-nums text-ink-secondary">
                {t(locale, 'developer.status')}
              </span>
            )}
            {apiEnabled ? <span className="text-xs text-ink-muted">{t(locale, 'developer.note')}</span> : null}
          </div>
          <FeatureList locale={locale} keys={DEVELOPER_FEATURES} />

          {!apiEnabled ? (
            <p className="mt-1 rounded-md border border-line bg-surface px-3 py-[11px] text-[13px] text-ink-secondary">
              <a href="mailto:hello@endgrain.app" className="text-accent hover:underline">
                {t(locale, 'developer.emailNote')}
              </a>
            </p>
          ) : mode === 'link' ? null : apiSubscribed ? (
            <span data-testid="pricing-api-current" className="mt-1 text-[13px] font-semibold text-ink">
              {t(locale, 'pricing.current')}
            </span>
          ) : (
            <div className="mt-1">
              <PlanCta
                locale={locale}
                enabled={billingEnabled}
                signedIn={signedIn}
                busy={busy}
                onBuy={() => buy('api')}
                buyTestId="pricing-buy-api"
                ctaKey="developer.cta"
                disabledTestId="pricing-api-disabled"
                needAuthTestId="pricing-api-need-auth"
                needAuthHref="/login?next=/pricing"
              />
            </div>
          )}
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
