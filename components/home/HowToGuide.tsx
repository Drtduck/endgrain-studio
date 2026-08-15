'use client'

import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { t, type MessageKey } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { useStudio } from '@/lib/store/studio'

interface HowToStep {
  readonly n: number
  readonly titleKey: MessageKey
  readonly bodyKey: MessageKey
}

const STEP_COUNT = 9

/** Сколько шагов видно до раскрытия: три первых умещаются на экране телефона вместе с заголовком. */
const PREVIEW = 3

const STEPS: readonly HowToStep[] = Array.from({ length: STEP_COUNT }, (_, i) => ({
  n: i + 1,
  titleKey: `home.howto.step${i + 1}.title` as MessageKey,
  bodyKey: `home.howto.step${i + 1}.body` as MessageKey,
}))

/**
 * Общая инструкция «как из проекта получается доска» над блоком разделов.
 * Девять шагов подряд превращают главную в простыню, поэтому по умолчанию видны
 * первые три, остальные разворачиваются кнопкой. Раскрытие держится на обычной
 * кнопке с aria-expanded, а не на details: так поведение одинаково во всех браузерах
 * и совпадает с остальными раскрывающимися блоками студии.
 */
export function HowToGuide() {
  const locale = useStudio((s) => s.locale)
  const [open, setOpen] = useState(false)
  const listId = useId()
  const visible = open ? STEPS : STEPS.slice(0, PREVIEW)

  return (
    <section
      data-testid="home-howto"
      aria-labelledby={`${listId}-title`}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h2 id={`${listId}-title`} className="font-display text-lg text-ink">
          {t(locale, 'home.howto.title')}
        </h2>
        <p className="max-w-2xl text-[13px] text-ink-secondary">{t(locale, 'home.howto.intro')}</p>
      </div>

      <ol id={listId} data-testid="home-howto-steps" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((step) => (
          <li
            key={step.n}
            data-testid={`home-howto-step-${step.n}`}
            className="flex min-w-0 gap-3 rounded-md border border-line-subtle bg-surface p-4"
          >
            <span
              aria-hidden
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[12px] tabular-nums text-accent"
            >
              {step.n}
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <h3 className="text-[13px] font-semibold text-ink">{t(locale, step.titleKey)}</h3>
              <p className="text-[13px] text-ink-secondary">{t(locale, step.bodyKey)}</p>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        data-testid="home-howto-toggle"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => { setOpen((v) => !v) }}
        className="flex items-center gap-1.5 self-start rounded-md text-[13px] font-medium text-accent transition-colors duration-hover ease-out hover:text-accent-hover focus-visible:shadow-focus focus-visible:outline-none"
      >
        {open ? t(locale, 'home.howto.collapse') : t(locale, 'home.howto.expand', { count: STEP_COUNT - PREVIEW })}
        <ChevronDown className={cn('size-4 transition-transform duration-panel ease-out', open && 'rotate-180')} strokeWidth={1.6} />
      </button>
    </section>
  )
}
