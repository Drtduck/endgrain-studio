import type { ReactNode } from 'react'
import Link from 'next/link'
import { LandingLocaleToggle } from '@/components/landing/LandingLocaleToggle'
import { t, type Locale } from '@/lib/i18n'
import { BLOG_PATH, SITE_ORIGIN } from '@/lib/routing/host'

/**
 * Общая шапка и подвал для страниц app-домена вне студии: /account/api,
 * /gallery, /legal/*. У студии (app/page.tsx) свой StudioShell с вкладками -
 * этот компонент туда не идёт, у неё другая логика вкладок и стора. Здесь
 * все ссылки относительные: сама студия и есть корень этого домена ("/"),
 * поэтому в отличие от LandingHeader/LandingFooter (домен лендинга,
 * абсолютные APP_ORIGIN-ссылки) тут используется next/link.
 */

const NAV_LINKS: readonly { readonly href: string; readonly label: (locale: Locale) => string; readonly testId: string }[] = [
  { href: '/', label: (l) => t(l, 'appShell.nav.studio'), testId: 'app-shell-nav-studio' },
  { href: '/gallery', label: (l) => t(l, 'appShell.nav.gallery'), testId: 'app-shell-nav-gallery' },
  { href: '/pricing', label: (l) => t(l, 'pricing.navTitle'), testId: 'app-shell-nav-pricing' },
  { href: '/account/api', label: (l) => t(l, 'apiKeys.navTitle'), testId: 'app-shell-nav-api' },
]

export function AppShell({ locale, children }: { readonly locale: Locale; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-app">
      <header
        data-testid="app-shell-header"
        className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2 sm:px-6"
      >
        <Link href="/" data-testid="app-shell-logo" className="flex items-center gap-2">
          <img src="/brand/beaver-mark.png" alt="" width={24} height={24} className="size-6 shrink-0" />
          <span className="font-display text-[17px] font-semibold text-ink">{t(locale, 'app.title')}</span>
        </Link>

        <nav aria-label={t(locale, 'appShell.nav.aria')} className="flex flex-wrap items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.testId}
              href={link.href}
              data-testid={link.testId}
              className="rounded-sm px-2.5 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-hover hover:bg-app hover:text-ink"
            >
              {link.label(locale)}
            </Link>
          ))}
        </nav>

        <div className="flex-1" />

        <LandingLocaleToggle locale={locale} />
      </header>

      <div className="flex-1">{children}</div>

      <footer data-testid="app-shell-footer" className="border-t border-line bg-surface px-4 py-6 sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2">
          <span className="font-sans text-xs text-ink-muted">{t(locale, 'landing.footer.copyright')}</span>

          <div className="flex flex-1 flex-wrap items-center justify-end gap-x-4 gap-y-1">
            <a
              href={`${SITE_ORIGIN}${BLOG_PATH}`}
              data-testid="app-shell-footer-blog"
              className="font-sans text-xs text-ink-secondary hover:text-ink"
            >
              {t(locale, 'appShell.footer.blog')}
            </a>
            <Link href="/legal/privacy" data-testid="app-shell-footer-privacy" className="font-sans text-xs text-ink-secondary hover:text-ink">
              {t(locale, 'landing.footer.legal.privacyLink')}
            </Link>
            <Link
              href="/legal/personal-data"
              data-testid="app-shell-footer-personal-data"
              className="font-sans text-xs text-ink-secondary hover:text-ink"
            >
              {t(locale, 'landing.footer.legal.personalDataLink')}
            </Link>
            <Link href="/legal/consent" data-testid="app-shell-footer-consent" className="font-sans text-xs text-ink-secondary hover:text-ink">
              {t(locale, 'landing.footer.legal.consentDocLink')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
