import { LandingLocaleToggle } from '@/components/landing/LandingLocaleToggle'
import { t, type Locale } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'

export function LandingHeader({ locale }: { locale: Locale }) {
  return (
    <header
      data-testid="landing-header"
      className="flex min-h-14 flex-wrap items-center gap-4 border-b border-line bg-surface px-6 py-2"
    >
      <div className="flex items-center gap-2">
        {/* Квадрат-заглушка мастер-марки: бобёр появляется в задаче 5 (бренд-набор). */}
        <span className="flex size-[22px] items-center justify-center rounded-xs bg-accent font-display text-[13px] text-ink-inverse">
          E
        </span>
        <div className="flex flex-col leading-tight">
          <span className="font-display text-[17px] font-semibold">{t(locale, 'app.title')}</span>
          <span className="font-sans text-xs text-ink-secondary">{t(locale, 'app.tagline')}</span>
        </div>
      </div>

      <div className="flex-1" />

      <LandingLocaleToggle locale={locale} />

      <a
        href={APP_ORIGIN}
        data-testid="landing-cta-header"
        className="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-semibold text-accent-fg transition-colors duration-hover hover:bg-accent-hover"
      >
        {t(locale, 'landing.nav.openApp')}
      </a>
    </header>
  )
}
