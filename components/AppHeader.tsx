'use client'

import type { ReactNode } from 'react'
import { AccountMenu } from '@/components/AccountMenu'
import { LocaleToggle } from '@/components/LocaleToggle'
import { NavLink } from '@/components/NavLink'
import { StudioTabs } from '@/components/StudioTabs'
import { Separator } from '@/components/ui/separator'
import { t, type MessageKey } from '@/lib/i18n'
import { BLOG_PATH, SITE_ORIGIN } from '@/lib/routing/host'
import { rememberLocale } from '@/lib/store/locale'
import { useStudio } from '@/lib/store/studio'
import type { UnitSystem } from '@/lib/units'
import { cn } from '@/lib/utils'

const NAV_LINK_CLASS =
  'rounded-sm px-2 py-1.5 text-sm font-medium text-ink-secondary transition-colors duration-hover hover:bg-app hover:text-ink'

/**
 * Разделы приложения. Один список на все страницы, чтобы меню нигде не расходилось.
 *
 * В шапке остаётся только то, что человек открывает по ходу работы. Тарифы
 * убраны: на /pricing ведут кнопка «Улучшить» и меню аватара. Профиль и MCP
 * (ключи API) тоже переехали под аватар: это личные разделы, а не навигация.
 */
const NAV_LINKS: readonly {
  readonly href: string
  readonly labelKey: MessageKey
  readonly testId: string
}[] = [
  { href: '/', labelKey: 'appShell.nav.studio', testId: 'app-shell-nav-studio' },
  { href: '/gallery', labelKey: 'appShell.nav.gallery', testId: 'app-shell-nav-gallery' },
]

/**
 * Единственная шапка приложения. Раньше она жила внутри StudioShell, поэтому
 * галерея, тарифы, ключи API и правовые страницы рисовали вместо неё маленькую
 * ссылку «Endgrain App» и выглядели чужими разделами. Теперь состав бренда,
 * языка и профиля одинаков везде.
 *
 * Вкладки и единицы измерения управляют состоянием студии: на остальных
 * страницах они бы ничего не делали, поэтому включаются пропсами и по
 * умолчанию выключены. Логотип всегда ведёт на главную приложения.
 */

export function AppHeader({
  tabs = false,
  units = false,
  tools,
}: {
  readonly tabs?: boolean
  readonly units?: boolean
  /** Инструменты только для студии: отмена/повтор и сброс. */
  readonly tools?: ReactNode
}) {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const setUnit = useStudio((s) => s.setUnit)
  const setLocale = useStudio((s) => s.setLocale)

  return (
    <header
      data-testid="app-header"
      className="flex min-h-14 flex-wrap items-center gap-4 border-b border-line bg-surface px-4 py-2"
    >
      <NavLink href="/" data-testid="app-header-home" className="flex items-center gap-2 text-ink">
        <img src="/brand/beaver-mark.png" alt="" width={24} height={24} className="size-6 shrink-0" />
        <span className="font-display text-[17px] font-semibold">{t(locale, 'app.title')}</span>
      </NavLink>

      {tabs ? (
        <>
          <Separator orientation="vertical" className="h-6" />
          <StudioTabs />
        </>
      ) : null}

      <div className="flex-1" />

      {/*
        Разделы стоят левее переключателя мер: единицы и язык - это настройки
        рабочего места, они держатся правым краем рядом с аватаром, а «Студия»,
        «Галерея» и «Блог» читаются как навигация и не должны за них прятаться.
        Блог живёт на домене лендинга, поэтому он обычная ссылка, а не next/link.
      */}
      <nav aria-label={t(locale, 'appShell.nav.aria')} className="flex flex-wrap items-center gap-1">
        {NAV_LINKS.map((link) =>
          tabs && link.href === '/' ? null : (
            <NavLink key={link.testId} href={link.href} data-testid={link.testId} className={NAV_LINK_CLASS}>
              {t(locale, link.labelKey)}
            </NavLink>
          ),
        )}

        <a href={`${SITE_ORIGIN}${BLOG_PATH}`} data-testid="app-blog-link" className={NAV_LINK_CLASS}>
          {t(locale, 'blog.navTitle')}
        </a>
      </nav>

      {units ? (
        <div
          className="inline-flex rounded-md bg-surface-sunken p-0.5"
          role="group"
          aria-label={t(locale, 'aria.unitGroup')}
        >
          {(['mm', 'in'] as const).map((u: UnitSystem) => (
            <button
              key={u}
              type="button"
              data-testid={`unit-${u}`}
              onClick={() => setUnit(u)}
              className={cn(
                'rounded-sm px-2 py-1 font-mono text-xs transition-colors duration-hover',
                u === unit ? 'bg-surface-raised shadow-sm' : 'text-ink-secondary',
              )}
            >
              {t(locale, u === 'mm' ? 'units.mm' : 'units.in')}
            </button>
          ))}
        </div>
      ) : null}

      <LocaleToggle
        locale={locale}
        onChange={(next) => {
          setLocale(next)
          rememberLocale(next)
        }}
      />

      <AccountMenu />

      {tools ? (
        <>
          <Separator orientation="vertical" className="h-6" />
          {tools}
        </>
      ) : null}
    </header>
  )
}
