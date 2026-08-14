import type { Metadata } from 'next'
import { TrackOnMount } from '@/components/analytics/TrackOnMount'
import { CheckoutBanner } from '@/components/CheckoutBanner'
import { PricingPlans } from '@/components/pricing/PricingPlans'
import { JsonLd } from '@/components/seo/JsonLd'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { pricingJsonLd } from '@/lib/seo/jsonld'
import { appUrl, pageMetadata } from '@/lib/seo/metadata'
import { STRIPE_PORTAL_URL, isStripeConfigured } from '@/lib/stripe/config'
import { getProStatus } from '@/lib/stripe/pro'
import { getCurrentUser } from '@/lib/supabase/session'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return pageMetadata({
    title: t(locale, 'pricing.navTitle'),
    description: t(locale, 'pricing.subtitle'),
    canonical: appUrl('/pricing'),
    locale,
    // Явная картинка: openGraph-объект с явными полями подавляет автоподхват
    // файловой конвенции opengraph-image, без image OG-карточка была пустой.
    image: appUrl('/opengraph-image.png'),
  })
}

/**
 * Страница тарифов рендерится всегда, даже без кассы: она часть продуктового
 * рассказа. Без ключей вместо кнопок оплаты стоит честная строка о том, что
 * оплата не подключена, а Pro сейчас открыт всем.
 */
export default async function PricingPage(props: PageProps<'/pricing'>) {
  const locale = await getLandingLocale()
  const [status, user] = await Promise.all([getProStatus(), getCurrentUser()])

  // Отмена оплаты возвращает человека сюда, а не в студию: с этой страницы
  // он может сразу попробовать ещё раз или выбрать другой тариф.
  const { checkout } = await props.searchParams
  const state = checkout === 'cancel' ? 'cancel' : checkout === 'success' ? 'success' : null

  return (
    <div className="min-h-screen bg-app">
      <main className="px-4 py-10">
        <JsonLd data={pricingJsonLd()} />
        <TrackOnMount event="pricing_viewed" />
        {state === null ? null : <CheckoutBanner state={state} locale={locale} />}
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{t(locale, 'pricing.title')}</h1>
            <p className="max-w-[60ch] text-ink-secondary">{t(locale, 'pricing.subtitle')}</p>
          </div>

          <PricingPlans
            locale={locale}
            mode="checkout"
            pro={status.pro}
            reason={status.reason}
            billingEnabled={isStripeConfigured()}
            signedIn={user !== null}
            currentPeriodEnd={status.currentPeriodEnd}
            cancelAtPeriodEnd={status.cancelAtPeriodEnd}
            portalUrl={STRIPE_PORTAL_URL}
          />
        </div>
      </main>
    </div>
  )
}
