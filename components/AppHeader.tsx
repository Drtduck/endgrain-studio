'use client'

import Link from 'next/link'
import { AccountMenu } from '@/components/AccountMenu'
import { LocaleToggle } from '@/components/LocaleToggle'
import { useSession } from '@/components/SessionProvider'
import { t, type MessageKey } from '@/lib/i18n'
import { BLOG_PATH, SITE_ORIGIN } from '@/lib/routing/host'
import { rememberLocale } from '@/lib/store/locale'
import { useStudio } from '@/lib/store/studio'

const NAV_LINK_CLASS =
  'rounded-sm px-2 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-hover hover:bg-app hover:text-ink'

/** Разделы приложения. Один список на все страницы, чтобы меню нигде не расходилось. */
const NAV_LINKS: readonly {
  readonly href: string
  readonly labelKey: MessageKey
  readonly testId: string
  readonly authOnly?: boolean
}[] = [
  { href: '/', labelKey: 'appShell.nav.studio', testId: 'app-shell-nav-studio' },
  { href: '/gallery', labelKey: 'appShell.nav.gallery', testId: 'app-shell-nav-gallery' },
  { href: '/pricing', labelKey: 'pricing.navTitle', testId: 'app-shell-nav-pricing' },
  { href: '/account/api', labelKey: 'apiKeys.navTitle', testId: 'app-shell-nav-api', authOnly: true },
]

/**
 * Единственная шапка приложения: состав одинаков в любом разделе. Раньше она жила внутри StudioShell, поэтому
 * галерея, тарифы, ключи API и правовые страницы рисовали вместо неё маленькую
 * ссылку «Endgrain App» и выглядели чужими разделами. Теперь состав бренда,
 * языка и профиля одинаков везде.
 *
 * Всё, что имеет смысл только внутри студии (вкладки, единицы, отмена и сброс),
 * живёт этажом ниже, в StudioToolbar: иначе меню то появляется, то пропадает от
 * раздела к разделу. Логотип всегда ведёт на главную приложения.
 */

export function AppHeader() {
  const locale = useStudio((s) => s.locale)
  const setLocale = useStudio((s) => s.setLocale)
  const { user, enabled } = useSession()

  return (
    <header
      data-testid="app-header"
      className="flex min-h-14 flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-2"
    >
      <Link href="/" data-testid="app-header-home" className="flex items-center gap-2 text-ink">
        <img src="/brand/beaver-mark.png" alt="" width={24} height={24} className="size-6 shrink-0" />
        <span className="font-display text-[17px] font-semibold">{t(locale, 'app.title')}</span>
      </Link>

      <div className="flex-1" />

      {/*
        Один и тот же набор разделов на всех страницах приложения. Ключи API нужны
        только вошедшему, остальное открыто. Блог живёт на домене лендинга, поэтому
        он обычная ссылка, а не next/link.
      */}
      <nav aria-label={t(locale, 'appShell.nav.aria')} className="flex flex-wrap items-center gap-1">
        {NAV_LINKS.map((link) =>
          link.authOnly && !(enabled && user) ? null : (
            <Link key={link.testId} href={link.href} data-testid={link.testId} className={NAV_LINK_CLASS}>
              {t(locale, link.labelKey)}
            </Link>
          ),
        )}

        <a href={`${SITE_ORIGIN}${BLOG_PATH}`} data-testid="app-blog-link" className={NAV_LINK_CLASS}>
          {t(locale, 'blog.navTitle')}
        </a>
      </nav>

      <LocaleToggle
        locale={locale}
        onChange={(next) => {
          setLocale(next)
          rememberLocale(next)
        }}
      />

      <AccountMenu />

    </header>
  )
}
