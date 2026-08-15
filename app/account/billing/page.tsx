import type { Metadata } from 'next'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { PlanBadge } from '@/components/account/PlanBadge'
import { CreditsPanel } from '@/components/credits/CreditsPanel'
import { WalletPanel } from '@/components/wallet/WalletPanel'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { LOGIN_PATH } from '@/lib/auth/access'
import { STRIPE_PORTAL_URL } from '@/lib/stripe/config'
import { getSubscriptionStatus } from '@/lib/stripe/pro'
import { getCurrentUser } from '@/lib/supabase/session'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return { title: t(locale, 'billing.title') }
}

function formatDate(iso: string, locale: 'ru' | 'en'): string {
  return new Intl.DateTimeFormat(locale).format(new Date(iso))
}

/**
 * Личная страница тарифа, счётчика кадров и кошелька. Раздел 6-7 спеки
 * pricing-wallet.md. Гейт как у /account: анониму сюда дороги нет.
 */
export default async function BillingPage() {
  const locale = await getLandingLocale()
  const user = await getCurrentUser()
  if (!user) redirect(`${LOGIN_PATH}?next=%2Faccount%2Fbilling`)

  const [proStatus, apiStatus] = await Promise.all([getSubscriptionStatus('pro'), getSubscriptionStatus('api')])
  const activePlan = proStatus.pro ? proStatus : apiStatus.pro ? apiStatus : null

  return (
    <div className="min-h-screen bg-app">
      <main className="px-4 py-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div>
            <h1 className="font-display text-2xl font-semibold text-ink">{t(locale, 'billing.title')}</h1>
            <p className="max-w-[60ch] text-ink-secondary">{t(locale, 'billing.subtitle')}</p>
          </div>

          <section
            data-testid="billing-plan"
            className="flex flex-col gap-2 rounded-lg border border-line-subtle bg-surface-raised p-4"
          >
            <PlanBadge locale={locale} />
            {activePlan !== null && activePlan.currentPeriodEnd !== null ? (
              <span className="text-[13px] text-ink-secondary">
                {t(locale, activePlan.cancelAtPeriodEnd ? 'pricing.canceling' : 'pricing.until', {
                  date: formatDate(activePlan.currentPeriodEnd, locale),
                })}
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-3 text-[13px]">
              {STRIPE_PORTAL_URL.length > 0 ? (
                <a href={STRIPE_PORTAL_URL} className="text-accent hover:underline">
                  {t(locale, 'pricing.manage')}
                </a>
              ) : null}
              {/* «Go Pro» уместно только тому, у кого сейчас нет активного платного плана
                  (мелочь 3, приёмка 15.08.2026): у уже вошедшего в Pro/API кнопка звала
                  оформить то, что уже оформлено. */}
              {activePlan === null ? (
                <a href="/pricing" className="text-accent hover:underline">
                  {t(locale, 'account.upgrade')}
                </a>
              ) : null}
            </div>
          </section>

          <section data-testid="billing-frames" className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface-raised p-4">
            <Suspense fallback={null}>
              <CreditsPanel locale={locale} />
            </Suspense>
          </section>

          <Suspense fallback={null}>
            <WalletPanel locale={locale} />
          </Suspense>
        </div>
      </main>
    </div>
  )
}
