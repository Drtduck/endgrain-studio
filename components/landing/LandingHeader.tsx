'use client'

import Link from 'next/link'
import { AccountMenu } from '@/components/AccountMenu'
import { AuthCta } from '@/components/landing/AuthCta'
import { LandingLocaleToggle } from '@/components/landing/LandingLocaleToggle'
import { useSession } from '@/components/SessionProvider'
import { t, type Locale } from '@/lib/i18n'
import { APP_ORIGIN } from '@/lib/routing/host'

/**
 * Клиентский компонент, а не серверный проп user: SessionProvider уже
 * оборачивает всё дерево в app/layout.tsx (в том числе /blog, /landing - см.
 * app/(landing)/blog/layout.tsx и app/(landing)/landing/page.tsx), поэтому
 * useSession() здесь ничего не ломает в структуре вызовов - оба серверных
 * layout остаются как есть и просто передают locale, как раньше. Серверный
 * проп user потребовал бы протащить getCurrentUser() в оба места отдельно
 * и продублировать то, что уже есть в SessionProvider.
 */
export function LandingHeader({ locale }: { locale: Locale }) {
  const { user, enabled } = useSession()

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

      <Link
        href="/blog"
        data-testid="landing-header-blog"
        className="font-sans text-sm text-ink-secondary hover:text-ink"
      >
        {t(locale, 'blog.navTitle')}
      </Link>

      <LandingLocaleToggle locale={locale} />

      {enabled && user ? (
        <>
          {/* Залогиненному человеку «Начать» ведёт в никуда - показываем прямой
              переход в студию, а меню аккаунта (аватар) переиспользуем из
              приложения. hrefBase уводит ссылки меню на app.endgrain.app: с
              этого домена (лендинг/блог) next/link на /account упёрся бы в
              307 из proxy.ts. */}
          <a
            href={APP_ORIGIN}
            data-testid="landing-open-app"
            className="font-sans text-sm text-ink-secondary hover:text-ink"
          >
            {t(locale, 'landing.nav.openApp')}
          </a>
          <AccountMenu locale={locale} hrefBase={APP_ORIGIN} />
        </>
      ) : (
        <AuthCta
          locale={locale}
          testId="landing-cta-header"
          label={t(locale, 'landing.nav.cta')}
          className="rounded-md bg-accent px-3 py-1.5 font-sans text-sm font-semibold text-accent-fg transition-colors duration-hover hover:bg-accent-hover"
        />
      )}
    </header>
  )
}
