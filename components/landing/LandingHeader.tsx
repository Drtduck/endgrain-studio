import Link from 'next/link'
import { AuthCta } from '@/components/landing/AuthCta'
import { LandingLocaleToggle } from '@/components/landing/LandingLocaleToggle'
import { t, type Locale } from '@/lib/i18n'

export function LandingHeader({ locale }: { locale: Locale }) {
  return (
    <header
      data-testid="landing-header"
      className="flex min-h-14 flex-wrap items-center gap-4 border-b border-line bg-surface px-6 py-2"
    >
      <Link href="/" data-testid="landing-home" className="flex items-center gap-2 text-ink" aria-label={t(locale, 'app.title')}>
        <img src="/brand/beaver-mark.png" alt="" width={24} height={24} className="size-6 shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="font-display text-[17px] font-semibold">{t(locale, 'app.title')}</span>
          <span className="hidden font-sans text-xs text-ink-muted sm:inline">{t(locale, 'app.slogan')}</span>
        </div>
      </Link>

      <div className="flex-1" />

      <LandingLocaleToggle locale={locale} />

      <AuthCta
        locale={locale}
        testId="landing-cta-header"
        label={t(locale, 'landing.nav.cta')}
        className="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-semibold text-accent-fg transition-colors duration-hover hover:bg-accent-hover"
      />
    </header>
  )
}
