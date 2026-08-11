'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { t } from '@/lib/i18n'
import { SPECIES, SPECIES_BY_ID } from '@/lib/species'
import { useStudio } from '@/lib/store/studio'

export function SpeciesPalette() {
  const locale = useStudio((s) => s.locale)
  const activeSpeciesId = useStudio((s) => s.activeSpeciesId)
  const setActiveSpecies = useStudio((s) => s.setActiveSpecies)
  const active = SPECIES_BY_ID.get(activeSpeciesId)
  const nameOf = (nameRu: string, nameEn: string): string => (locale === 'ru' ? nameRu : nameEn)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'palette.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(locale, 'palette.active', { name: active ? nameOf(active.nameRu, active.nameEn) : activeSpeciesId })}
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-8 gap-1.5" role="group" aria-label={t(locale, 'aria.palette')}>
          {SPECIES.map((species) => {
            const isActive = species.id === activeSpeciesId
            const title = nameOf(species.nameRu, species.nameEn)
            return (
              <button
                key={species.id}
                type="button"
                data-testid={`species-${species.id}`}
                aria-pressed={isActive}
                aria-label={title}
                title={title}
                onClick={() => setActiveSpecies(species.id)}
                style={{ backgroundColor: species.hex }}
                className={`h-8 w-full rounded-md border transition ${
                  isActive ? 'border-foreground ring-2 ring-foreground' : 'border-black/20 hover:border-foreground/60'
                }`}
              />
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
