'use client'

import { useState } from 'react'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { displayToMm, mmToDisplay, unitStepMm, type UnitSystem } from '@/lib/units'

export function NumberFieldMm({
  id,
  labelKey,
  valueMm,
  unit,
  locale,
  onCommitMm,
  minMm,
  maxMm,
  testId,
}: {
  id: string
  labelKey: MessageKey
  valueMm: number
  unit: UnitSystem
  locale: Locale
  onCommitMm: (mm: number) => void
  minMm?: number
  maxMm?: number
  testId?: string
}) {
  const external = mmToDisplay(valueMm, unit)
  const [draft, setDraft] = useState(external)
  const [syncedExternal, setSyncedExternal] = useState(external)

  // Черновик живёт локально, чтобы курсор не прыгал при наборе, но обязан догонять
  // документ: undo, переключение единиц и загрузка из ссылки меняют значение снаружи.
  // Правка состояния во время рендера (а не в эффекте) - рекомендованный React-паттерн
  // для "сброса состояния при изменении пропса" и не триггерит react-hooks/set-state-in-effect.
  if (external !== syncedExternal) {
    setSyncedExternal(external)
    setDraft(external)
  }

  const commit = (): void => {
    const mm = displayToMm(draft, unit)
    if (mm === null) {
      setDraft(external)
      return
    }
    const clamped = Math.min(maxMm ?? mm, Math.max(minMm ?? mm, mm))
    onCommitMm(clamped)
    setDraft(mmToDisplay(clamped, unit))
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {t(locale, labelKey)}
      </label>
      <input
        id={id}
        data-testid={testId ?? id}
        type="number"
        inputMode="decimal"
        step={unit === 'mm' ? unitStepMm(unit) : 0.0625}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
          if (e.key === 'Escape') setDraft(external)
        }}
        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm tabular-nums shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  )
}
