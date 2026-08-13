import { t, type Locale } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'

export function LandingFooter({ locale }: { locale: Locale }) {
  return (
    <footer data-testid="landing-footer" className="border-t border-line bg-surface px-6 py-10">
      <div className="mx-auto grid max-w-5xl gap-8 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <span className="font-display text-sm font-semibold">{t(locale, 'landing.footer.product.title')}</span>
          <a href={APP_ORIGIN} data-testid="landing-footer-open-app" className="font-sans text-sm text-ink-secondary hover:text-ink">
            {t(locale, 'landing.nav.openApp')}
          </a>
          <a
            href={`${APP_ORIGIN}/pricing`}
            data-testid="landing-footer-pricing"
            className="font-sans text-sm text-ink-secondary hover:text-ink"
          >
            {t(locale, 'pricing.navTitle')}
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-display text-sm font-semibold">{t(locale, 'landing.footer.contact.title')}</span>
          <a
            href="mailto:hello@endgrain.app"
            data-testid="landing-footer-contact"
            className="font-sans text-sm text-ink-secondary hover:text-ink"
          >
            hello@endgrain.app
          </a>
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-display text-sm font-semibold">{t(locale, 'landing.footer.legal.title')}</span>
          <p className="font-sans text-xs text-ink-secondary">{t(locale, 'landing.footer.legal.amazonDisclaimer')}</p>
          <a
            href={`${APP_ORIGIN}/legal/privacy`}
            data-testid="landing-footer-privacy"
            className="font-sans text-xs text-ink-secondary hover:text-ink"
          >
            {t(locale, 'landing.footer.legal.privacyLink')}
          </a>
          <a
            href={`${APP_ORIGIN}/legal/personal-data`}
            data-testid="landing-footer-personal-data"
            className="font-sans text-xs text-ink-secondary hover:text-ink"
          >
            {t(locale, 'landing.footer.legal.personalDataLink')}
          </a>
          <a
            href={`${APP_ORIGIN}/legal/consent`}
            data-testid="landing-footer-consent-doc"
            className="font-sans text-xs text-ink-secondary hover:text-ink"
          >
            {t(locale, 'landing.footer.legal.consentDocLink')}
          </a>
          <a
            href={`${APP_ORIGIN}/legal/privacy`}
            data-testid="landing-footer-consent-settings"
            className="font-sans text-xs text-ink-secondary hover:text-ink"
          >
            {t(locale, 'landing.footer.legal.cookieSettings')}
          </a>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-5xl font-sans text-xs text-ink-muted">{t(locale, 'landing.footer.copyright')}</p>
    </footer>
  )
}
