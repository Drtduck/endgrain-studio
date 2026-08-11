'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
import { SPECIES_BY_ID } from '@/lib/species'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'fork.title')}
        data-testid="fork-dialog"
        className="w-full max-w-md rounded-lg border bg-background p-5 shadow-lg"
      >
        <h2 className="text-lg font-semibold">{t(locale, 'fork.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t(locale, 'fork.body')}</p>

        <ul className="mt-4 space-y-1 text-sm">
          <li data-testid="fork-glueups">{t(locale, 'fork.glueUps', { count: pendingFork.cost.extraGlueUps })}</li>
          <li data-testid="fork-cuts">{t(locale, 'fork.cuts', { count: pendingFork.cost.extraCuts })}</li>
          {lumber.map(([speciesId, meters]) => {
            const species = SPECIES_BY_ID.get(speciesId)
            const name = species ? (locale === 'ru' ? species.nameRu : species.nameEn) : speciesId
            return (
              <li key={speciesId} data-testid="fork-lumber">
                {t(locale, 'fork.lumber', { name, meters: meters.toFixed(2) })}
              </li>
            )
          })}
        </ul>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" data-testid="fork-cancel" onClick={cancelFork}>
            {t(locale, 'fork.cancel')}
          </Button>
          <Button data-testid="fork-confirm" onClick={confirmFork}>
            {t(locale, 'fork.confirm')}
          </Button>
        </div>
      </div>
    </div>
  )
}
