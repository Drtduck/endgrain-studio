'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { AccountMenu } from '@/components/AccountMenu'
import { LocaleToggle } from '@/components/LocaleToggle'
import { StudioTabs } from '@/components/StudioTabs'
import { Separator } from '@/components/ui/separator'
import { t } from '@/lib/i18n'
import { rememberLocale } from '@/lib/store/locale'
import { useStudio } from '@/lib/store/studio'
import type { UnitSystem } from '@/lib/units'
import { cn } from '@/lib/utils'

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
      <Link href="/" data-testid="app-header-home" className="flex items-center gap-2 text-ink">
        <img src="/brand/beaver-mark.png" alt="" width={24} height={24} className="size-6 shrink-0" />
        <span className="font-display text-[17px] font-semibold">{t(locale, 'app.title')}</span>
      </Link>

      {tabs ? (
        <>
          <Separator orientation="vertical" className="h-6" />
          <StudioTabs />
        </>
      ) : null}

      <div className="flex-1" />

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
