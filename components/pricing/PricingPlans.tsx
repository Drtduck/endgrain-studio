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

/** Общие классы карточки: равная высота в ряду и защита от распирания сетки длинным словом. */
const CARD_BASE = 'flex h-full min-w-0 flex-col gap-3 rounded-lg p-5'

/**
 * Кнопка в карточке не имеет права вылезать за её border: текст CTA длинный
 * («Оформить Pro: от $7.50 в месяц»), а базовый Button - whitespace-nowrap и
 * фиксированной высоты. Поэтому здесь разрешаем перенос и растим высоту.
 */
const CARD_BUTTON = 'h-auto min-h-[30px] w-full py-1.5 text-center leading-snug whitespace-normal'

/** Цена и период на одной базовой линии, перенос - целыми словами, а не посреди строки цены. */
function PlanPrice({ price, period }: { price: string; period?: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-1.5 font-mono text-2xl tabular-nums text-ink">
      <span>{price}</span>
      {period === undefined ? null : <span className="font-sans text-sm text-ink-secondary">{period}</span>}
    </span>
  )
}

function FeatureList({ locale, keys }: { locale: Locale; keys: readonly MessageKey[] }) {
  return (
    <ul className="flex flex-1 flex-col gap-1.5">
      {keys.map((key) => (
        <li key={key} className="flex items-start gap-2 text-[13px] text-ink-secondary">
          <Check className="mt-[3px] size-3.5 shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 break-words">{t(locale, key)}</span>
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
      <Button size="sm" className={CARD_BUTTON} data-testid={needAuthTestId} render={<a href={needAuthHref} />}>
        {t(locale, 'pricing.cta.needAuth')}
      </Button>
    )
  }

  return (
    <Button size="sm" className={CARD_BUTTON} data-testid={buyTestId} disabled={busy} onClick={onBuy}>
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

  // Только живая подписка снимает кнопку покупки Pro и показывает «текущий план»:
  // Пропуск даёт Pro, но не блокирует апгрейд до подписки (см. createCheckoutAction) -
  // купивший пропуск должен по-прежнему видеть кнопку «Оформить Pro».
  const proSubscribed = pro && reason === 'subscription'
  // Пропуск можно докупать поверх уже активного пропуска (grant_pro_pass продлевает
  // окно), заблокирована повторная покупка только поверх настоящей подписки.
  const passBuyBlocked = reason === 'subscription'

  return (
    <div data-testid="pricing-plans" className="flex flex-col gap-4">
      <div className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <section
          data-testid="pricing-free"
          className={`${CARD_BASE} border border-line-subtle bg-surface-raised`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-semibold text-ink">{t(locale, 'pricing.free.name')}</span>
            <PlanPrice price={t(locale, 'pricing.free.price')} />
            <span className="text-xs text-ink-muted">{t(locale, 'pricing.free.note')}</span>
          </div>
          <FeatureList locale={locale} keys={FREE_FEATURES} />
        </section>

        {!passEnabled ? null : (
          <section
            data-testid="pricing-pass"
            className={`${CARD_BASE} border border-line-subtle bg-surface-raised`}
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-lg font-semibold text-ink">{t(locale, 'pricing.pass.name')}</span>
              <PlanPrice price={t(locale, 'pricing.pass.price')} />
              <span className="text-xs text-ink-muted">{t(locale, 'pricing.pass.note')}</span>
            </div>
            <FeatureList locale={locale} keys={PASS_FEATURES} />

            {mode === 'link' ? null : (
              <div className="mt-auto flex flex-col gap-2 pt-1">
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
          className={`${CARD_BASE} border border-accent-border bg-accent-soft`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-semibold text-ink">{t(locale, 'pricing.pro.name')}</span>
            <PlanPrice
              price={t(locale, 'pricing.pro.monthlyPrice')}
              period={t(locale, 'pricing.pro.monthlyPeriod')}
            />
            <span className="text-xs text-ink-muted">{t(locale, 'pricing.pro.note')}</span>
          </div>
          <FeatureList locale={locale} keys={PRO_FEATURES} />

          <div className="mt-auto flex flex-col gap-2 pt-1">
            {mode === 'link' ? (
              <Button
                size="sm"
                className={CARD_BUTTON}
                data-testid="pricing-open-app"
                render={<a href={`${APP_ORIGIN}/pricing`} />}
              >
                {t(locale, 'pricing.cta.open')}
              </Button>
            ) : proSubscribed ? (
              <div className="flex flex-col gap-1.5">
                <span data-testid="pricing-current" className="text-[13px] font-semibold text-ink">
                  {t(locale, 'pricing.current')}
                </span>
                {currentPeriodEnd === null ? null : (
                  <span data-testid="pricing-period" className="text-xs text-ink-secondary">
                    {/* proSubscribed теперь означает ровно reason === 'subscription' (см. фикс
                        «Пропуск не запирает от Pro»): вариант «оплачено до по формату Пропуска»
                        сюда больше не приходит, эта карточка показывает только настоящую подписку. */}
                    {/* Отменённая подписка честно говорит, что не продлится, а не «оплачено до». */}
                    {t(locale, cancelAtPeriodEnd ? 'pricing.canceling' : 'pricing.until', {
                      date: formatDate(currentPeriodEnd, locale),
                    })}
                  </span>
                )}
                {portalUrl.length === 0 ? null : (
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
          className={`${CARD_BASE} border border-line-subtle bg-surface-raised`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-lg font-semibold text-ink">{t(locale, 'developer.name')}</span>
            {apiEnabled ? (
              <PlanPrice price={t(locale, 'developer.price')} period={t(locale, 'developer.period')} />
            ) : (
              <span data-testid="pricing-developer-status" className="font-mono text-2xl tabular-nums text-ink-secondary">
                {t(locale, 'developer.status')}
              </span>
            )}
            {apiEnabled ? <span className="text-xs text-ink-muted">{t(locale, 'developer.note')}</span> : null}
          </div>
          <FeatureList locale={locale} keys={DEVELOPER_FEATURES} />

          {!apiEnabled ? (
            <p className="mt-auto rounded-md border border-line bg-surface px-3 py-[11px] text-[13px] text-ink-secondary">
              <a href="mailto:hello@endgrain.app" className="text-accent hover:underline">
                {t(locale, 'developer.emailNote')}
              </a>
            </p>
          ) : mode === 'link' ? null : apiSubscribed ? (
            <span data-testid="pricing-api-current" className="mt-auto text-[13px] font-semibold text-ink">
              {t(locale, 'pricing.current')}
            </span>
          ) : (
            <div className="mt-auto pt-1">
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
