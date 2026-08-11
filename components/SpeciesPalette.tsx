'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t } from '@/lib/i18n'
import { SPECIES, SPECIES_BY_ID } from '@/lib/species'
import { useDerived } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'

export function SpeciesPalette() {
  const locale = useStudio((s) => s.locale)
  const activeSpeciesId = useStudio((s) => s.activeSpeciesId)
  const setActiveSpecies = useStudio((s) => s.setActiveSpecies)
  const { model } = useDerived()
  const active = SPECIES_BY_ID.get(activeSpeciesId)
  const nameOf = (nameRu: string, nameEn: string): string => (locale === 'ru' ? nameRu : nameEn)

  // Породы, реально нарисованные в текущей модели: палитра - не селектор "выбери одну",
  // это кисть плюс справка о том, что уже пошло в дело.
  const usedSpeciesIds = useMemo(() => {
    const set = new Set<string>()
    for (const cell of model.cells) set.add(cell.speciesId)
    return set
  }, [model])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'palette.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(locale, 'palette.brush', { name: active ? nameOf(active.nameRu, active.nameEn) : activeSpeciesId })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(locale, 'palette.inDesign', { count: usedSpeciesIds.size })}
        </p>
        <p className="text-xs text-muted-foreground">{t(locale, 'palette.hint')}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-8 gap-1.5" role="group" aria-label={t(locale, 'aria.palette')}>
          {SPECIES.map((species) => {
            const isActive = species.id === activeSpeciesId
            const isUsed = usedSpeciesIds.has(species.id)
            const title = nameOf(species.nameRu, species.nameEn)
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
                style={{ backgroundColor: species.hex }}
                className={`relative h-8 w-full rounded-md border transition ${
                  isActive ? 'border-foreground ring-2 ring-offset-1 ring-foreground' : 'border-black/20 hover:border-foreground/60'
                }`}
              >
                {isUsed ? (
                  <span
                    aria-hidden
                    className="absolute right-0.5 top-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-background text-[8px] leading-none text-foreground shadow-sm"
                  >
                    &#10003;
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
