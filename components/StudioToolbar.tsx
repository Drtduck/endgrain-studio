'use client'

import { HistoryControls } from '@/components/HistoryControls'
import { ResetButton } from '@/components/ResetButton'
import { StudioTabs } from '@/components/StudioTabs'
import { Separator } from '@/components/ui/separator'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'
import type { UnitSystem } from '@/lib/units'
import { cn } from '@/lib/utils'

/**
 * Второй уровень меню, только внутри студии: вкладки разделов, единицы измерения,
 * отмена с повтором и сброс проекта. Раньше это жило в общей шапке и от раздела к
 * разделу то появлялось, то исчезало. Теперь верхняя строка везде одинаковая, а всё,
 * что относится к работе над доской, собрано здесь и не переезжает.
 */
export function StudioToolbar() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const setUnit = useStudio((s) => s.setUnit)

  return (
    <div
      data-testid="studio-toolbar"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-surface px-4 py-2"
    >
      <StudioTabs />

      <div className="flex-1" />

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

      <Separator orientation="vertical" className="h-6" />

      <HistoryControls />

      <Separator orientation="vertical" className="h-6" />

      <ResetButton />
    </div>
  )
}
