import type { ReactNode } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { t, type Locale } from '@/lib/i18n'
import { BLOG_PATH, SITE_ORIGIN } from '@/lib/routing/host'

/**
 * Каркас страниц приложения вне студии: /account/api, /gallery, /pricing,
 * /legal/*. Шапка тут ровно та же, что и в студии (AppHeader), иначе меню
 * расходится от раздела к разделу. Своё у каркаса только подвал с правовыми
 * ссылками: в студии его нет, там экран рабочий и подвал мешал бы.
 */


export function AppShell({ locale, children }: { readonly locale: Locale; readonly children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-app">
      <AppHeader />

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
