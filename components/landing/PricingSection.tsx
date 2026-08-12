import { PricingPlans } from '@/components/pricing/PricingPlans'
import { t, type Locale } from '@/lib/i18n'
import { STRIPE_PORTAL_URL, hasPublicPrices } from '@/lib/stripe/config'

/**
 * Лендинг анонимен и в Supabase не ходит принципиально (см. комментарий в proxy.ts),
 * поэтому pro и signedIn тут заведомо false, а признак кассы считается по публичным
 * переменным: серверных ключей лендингу знать не нужно.
 */
export function PricingSection({ locale }: { locale: Locale }) {
  return (
    <section id="pricing" data-testid="landing-pricing" className="scroll-mt-14 bg-app px-6 py-16">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="text-center">
          <h2 className="font-display text-3xl tracking-tight text-ink">{t(locale, 'landing.pricing.title')}</h2>
          <p className="mx-auto mt-3 max-w-[60ch] text-ink-secondary">{t(locale, 'landing.pricing.body')}</p>
        </div>
        <PricingPlans
          locale={locale}
          mode="link"
          pro={false}
          reason="free"
          billingEnabled={hasPublicPrices()}
          signedIn={false}
          currentPeriodEnd={null}
          portalUrl={STRIPE_PORTAL_URL}
        />
      </div>
    </section>
  )
}
