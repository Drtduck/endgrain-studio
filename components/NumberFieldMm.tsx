'use client'

import { useState } from 'react'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { displayToMm, mmToDisplay, unitStepMm, type UnitSystem } from '@/lib/units'
import { cn } from '@/lib/utils'

const FIELD_HEIGHT: Record<'default' | 'compact' | 'dense', string> = {
  default: 'h-9',
  compact: 'h-[34px]',
  dense: 'h-[30px]',
}

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
  size = 'default',
  suffix,
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
  size?: 'default' | 'compact' | 'dense'
  suffix?: string
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
    // Черновик не менялся - выходим до конвертации. Показ округляет значение, и слепой
    // прогон «показали -> прочитали обратно» сдвигал бы точные миллиметры документа
    // на каждом заходе в поле, хотя человек ничего не набирал.
    if (draft === external) return
    const mm = displayToMm(draft, unit)
    if (mm === null) {
      setDraft(external)
      return
    }
    const clamped = Math.min(maxMm ?? mm, Math.max(minMm ?? mm, mm))
    onCommitMm(clamped)
    setDraft(mmToDisplay(clamped, unit))
  }

  /**
   * Шаг стрелками мы считаем сами, а браузеру говорим step="any".
   * Родной step пришлось бы задавать в единицах показа, и тогда любое дробное
   * значение (240.03 мм после переключения единиц) ловило бы stepMismatch и метку
   * :invalid, хотя оно совершенно законно. Свой шаг остаётся столярным: 1 мм или 1/16".
   * Стрелки правят только черновик, как и родные: документ меняется на blur или Enter,
   * иначе каждое нажатие вставляло бы отдельный шаг в историю undo.
   */
  const nudgeDraft = (direction: 1 | -1): void => {
    const mm = displayToMm(draft, unit)
    if (mm === null) return
    setDraft(mmToDisplay(mm + direction * unitStepMm(unit), unit))
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[11px] text-ink-muted">
        {t(locale, labelKey)}
      </label>
      <div
        className={cn(
          'flex min-w-0 items-center gap-1 rounded-sm border border-line bg-surface-raised px-2 transition-[border-color,box-shadow] duration-hover ease-out hover:border-line-strong focus-within:border-[1.5px] focus-within:border-accent focus-within:shadow-focus has-[:disabled]:border-line-subtle has-[:disabled]:bg-surface-sunken',
          FIELD_HEIGHT[size]
        )}
      >
        <input
          id={id}
          data-testid={testId ?? id}
          type="number"
          inputMode="decimal"
          step="any"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') setDraft(external)
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              nudgeDraft(1)
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              nudgeDraft(-1)
            }
          }}
          className="w-full min-w-0 appearance-none border-0 bg-transparent font-mono text-sm tabular-nums text-ink outline-none disabled:text-line-strong [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        {suffix ? (
          <span aria-hidden className="shrink-0 whitespace-nowrap font-mono text-[11px] text-ink-muted">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  )
}
