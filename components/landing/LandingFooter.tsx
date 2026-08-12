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
          {/* Полный дисклеймер об ассоциированной программе Amazon появляется в задаче 4. */}
          <p className="font-sans text-xs text-ink-secondary">{t(locale, 'landing.footer.legal.amazonDisclaimer')}</p>
          <p className="font-sans text-xs text-ink-secondary">{t(locale, 'landing.footer.legal.privacy')}</p>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-5xl font-sans text-xs text-ink-muted">{t(locale, 'landing.footer.copyright')}</p>
    </footer>
  )
}
