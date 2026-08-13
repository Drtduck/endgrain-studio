'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { speciesName } from '@/lib/species'
import { useStudio } from '@/lib/store/studio'

export function ForkDialog() {
  const locale = useStudio((s) => s.locale)
  const pendingFork = useStudio((s) => s.pendingFork)
  const confirmFork = useStudio((s) => s.confirmFork)
  const cancelFork = useStudio((s) => s.cancelFork)

  useEffect(() => {
    if (!pendingFork) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') cancelFork()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingFork, cancelFork])

  if (!pendingFork) return null

  const lumber = Object.entries(pendingFork.cost.extraLumberMBySpecies)

  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'fork.title')}
        data-testid="fork-dialog"
        className="pointer-events-auto flex w-full max-w-[380px] flex-col gap-3 rounded-lg bg-surface p-5 shadow-dialog"
      >
        <h2 className="font-display text-lg font-semibold">{t(locale, 'fork.title')}</h2>
        <p className="text-sm leading-normal text-ink-secondary">{t(locale, 'fork.body')}</p>

        <ul className="flex flex-col gap-1 text-sm text-ink-secondary">
          <li data-testid="fork-glueups" className="font-mono tabular-nums">
            {t(locale, 'fork.glueUps', { count: pendingFork.cost.extraGlueUps })}
          </li>
          <li data-testid="fork-cuts" className="font-mono tabular-nums">
            {t(locale, 'fork.cuts', { count: pendingFork.cost.extraCuts })}
          </li>
          {lumber.map(([speciesId, meters]) => {
            const name = speciesName(speciesId, locale)
            return (
              <li key={speciesId} data-testid="fork-lumber" className="font-mono tabular-nums">
                {t(locale, 'fork.lumber', { name, meters: meters.toFixed(2) })}
              </li>
            )
          })}
        </ul>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" data-testid="fork-cancel" onClick={cancelFork}>
            {t(locale, 'fork.cancel')}
          </Button>
          <Button size="sm" data-testid="fork-confirm" onClick={confirmFork}>
            {t(locale, 'fork.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
