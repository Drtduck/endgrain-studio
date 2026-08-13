'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpHint } from '@/components/ui/help-hint'
import { t } from '@/lib/i18n'
import { SPECIES, SPECIES_BY_ID, speciesName } from '@/lib/species'
import { useDerived } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'

export function SpeciesPalette() {
  const locale = useStudio((s) => s.locale)
  const activeSpeciesId = useStudio((s) => s.activeSpeciesId)
  const setActiveSpecies = useStudio((s) => s.setActiveSpecies)
  const { model } = useDerived()
  const active = SPECIES_BY_ID.get(activeSpeciesId)

  // Породы, реально нарисованные в текущей модели: палитра - не селектор "выбери одну",
  // это кисть плюс справка о том, что уже пошло в дело.
  const usedSpeciesIds = useMemo(() => {
    const set = new Set<string>()
    for (const cell of model.cells) set.add(cell.speciesId)
    return set
  }, [model])

  const activeName = active ? speciesName(active.id, locale) : activeSpeciesId

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-base">{t(locale, 'palette.title')}</CardTitle>
            <HelpHint id="palette" side="right" />
          </div>
          <span className="font-mono text-[11px] tabular-nums text-accent">{usedSpeciesIds.size}</span>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={t(locale, 'aria.palette')}>
          {SPECIES.map((species) => {
            const isActive = species.id === activeSpeciesId
            const isUsed = usedSpeciesIds.has(species.id)
            const title = speciesName(species.id, locale)
            const ariaLabel = isActive
              ? t(locale, 'palette.brushAria', { name: title })
              : isUsed
                ? t(locale, 'palette.usedAria', { name: title })
                : title
            return (
              <button
                key={species.id}
                type="button"
                data-testid={`species-${species.id}`}
                data-used={isUsed ? 'true' : undefined}
                aria-pressed={isActive}
                aria-label={ariaLabel}
                title={title}
                onClick={() => setActiveSpecies(species.id)}
                style={{
                  backgroundColor: species.hex,
                  boxShadow: isActive
                    ? 'inset 0 0 0 2px var(--surface), 0 0 0 2px var(--selection)'
                    : 'inset 0 0 0 1px var(--cell-outline)',
                }}
                className="relative aspect-square w-full rounded-[5px] transition-transform duration-hover ease-out hover:scale-[1.06]"
              >
                {isUsed ? (
                  <span
                    aria-hidden
                    className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-surface text-[8px] leading-none text-ink shadow-sm"
                  >
                    &#10003;
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2 rounded-md border border-line-subtle bg-surface px-2.5 py-2">
          <span aria-hidden className="size-5 rounded-xs" style={{ backgroundColor: active?.hex }} />
          <div className="flex flex-col">
            <span className="text-[13px] font-medium">{activeName}</span>
            <span className="text-[11px] text-ink-muted">{t(locale, 'palette.brush', { name: activeName })}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-ink-muted">{t(locale, 'palette.inDesign', { count: usedSpeciesIds.size })}</p>
          <p className="text-[11px] text-ink-muted">{t(locale, 'palette.hint')}</p>
        </div>
      </CardContent>
    </Card>
  )
}
