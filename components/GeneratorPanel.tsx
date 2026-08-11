'use client'

import { useMemo, useState } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { ConfirmReplace } from '@/components/ConfirmReplace'
import { Button } from '@/components/ui/button'
import { compile, type BoardModel } from '@/lib/engine'
import {
  FAMILIES,
  applyParams,
  mixSeed,
  nextGeneration,
  reshuffle,
  seedPopulation,
  toDesign,
  type FamilyId,
  type Population,
} from '@/lib/generators'
import { t } from '@/lib/i18n'
import { selectIsDirty, useStudio } from '@/lib/store/studio'

/** Сид первой девятки прибит гвоздями: сервер и клиент обязаны отрисовать одно и то же. */
export const DEFAULT_GENERATOR_SEED = 20260812

export function GeneratorPanel() {
  const locale = useStudio((s) => s.locale)
  const generator = useStudio((s) => s.generator)
  const setGenerator = useStudio((s) => s.setGenerator)
  const loadDesign = useStudio((s) => s.loadDesign)
  const setView = useStudio((s) => s.setView)
  const dirty = useStudio(selectIsDirty)
  const [pending, setPending] = useState<number | null>(null)

  // Пока пользователь ничего не сделал, в сторе пусто: показываем девятку по умолчанию,
  // но в стор не пишем, потому что запись во время рендера - это тот самый set-state-in-effect.
  const fallback = useMemo(() => seedPopulation(DEFAULT_GENERATOR_SEED, FAMILIES.map((f) => f.id)), [])
  const population: Population = generator?.population ?? fallback
  const favouriteIds = generator?.favouriteIds ?? []

  const previews: readonly BoardModel[] = useMemo(
    () => population.items.map((item) => compile(toDesign(item.genome, item.id))),
    [population],
  )

  const commit = (next: Population, ids: readonly string[] = []): void => {
    setGenerator({ population: next, favouriteIds: ids })
  }

  const toggleFamily = (familyId: FamilyId): void => {
    const current = population.familyIds
    const next = current.length === 1 && current[0] === familyId ? FAMILIES.map((f) => f.id) : [familyId]
    commit(seedPopulation(mixSeed(population.seed, 0x5a), next))
  }

  const onSlider = (patch: { cols?: number; rows?: number; density?: number }): void => {
    commit(applyParams(population, patch), favouriteIds)
  }

  const toggleFavourite = (id: string): void => {
    const next = favouriteIds.includes(id) ? favouriteIds.filter((value) => value !== id) : [...favouriteIds, id]
    commit(population, next)
  }

  const apply = (index: number): void => {
    const item = population.items[index]
    if (!item) return
    const family = FAMILIES.find((f) => f.id === item.genome.familyId)
    const familyName = family ? t(locale, family.nameKey) : item.genome.familyId
    loadDesign(toDesign(item.genome, t(locale, 'gen.designName', { family: familyName })))
    setPending(null)
    setView('editor')
  }

  const onPick = (index: number): void => {
    if (dirty) setPending(index)
    else apply(index)
  }

  const first = population.items[0]?.genome.params

  return (
    <section data-testid="generator-panel" aria-label={t(locale, 'aria.generatorPanel')} className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{t(locale, 'gen.title')}</h2>
        <p className="text-sm text-muted-foreground">{t(locale, 'gen.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-1" role="group" aria-label={t(locale, 'gen.families')}>
        {FAMILIES.map((family) => (
          <Button
            key={family.id}
            data-testid={`gen-family-${family.id}`}
            size="sm"
            variant={population.familyIds.includes(family.id) ? 'default' : 'outline'}
            aria-pressed={population.familyIds.includes(family.id)}
            onClick={() => toggleFamily(family.id)}
          >
            {t(locale, family.nameKey)}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-sm">
          {t(locale, 'gen.cols')}
          <input
            data-testid="gen-cols"
            type="range"
            min={5}
            max={14}
            step={1}
            value={first?.cols ?? 8}
            onChange={(event) => onSlider({ cols: Number(event.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t(locale, 'gen.rows')}
          <input
            data-testid="gen-rows"
            type="range"
            min={5}
            max={16}
            step={1}
            value={first?.rows ?? 8}
            onChange={(event) => onSlider({ rows: Number(event.target.value) })}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t(locale, 'gen.density')}
          <input
            data-testid="gen-density"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round((first?.density ?? 0.5) * 100)}
            onChange={(event) => onSlider({ density: Number(event.target.value) / 100 })}
          />
        </label>

        <Button data-testid="gen-shuffle" size="sm" variant="outline" onClick={() => commit(reshuffle(population))}>
          {t(locale, 'gen.shuffle')}
        </Button>
        <Button data-testid="gen-evolve" size="sm" onClick={() => commit(nextGeneration(population, favouriteIds))}>
          {t(locale, 'gen.evolve')}
        </Button>
        <span data-testid="gen-generation" className="text-sm text-muted-foreground">
          {t(locale, 'gen.generation', { number: population.generation })}
        </span>
      </div>

      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        role="group"
        aria-label={t(locale, 'aria.generatorGrid')}
      >
        {population.items.map((item, index) => {
          const model = previews[index]
          const starred = favouriteIds.includes(item.id)
          return (
            <li key={item.id} data-testid={`gen-card-${index}`} className="flex flex-col items-center gap-2 rounded-lg border p-2">
              {model ? <BoardSvg model={model} locale={locale} maxPx={150} /> : null}
              {model ? (
                <span className="text-xs text-muted-foreground">
                  {t(locale, 'gen.cardStats', {
                    glueUps: model.glueUpCount,
                    widthMm: Math.round(model.widthMm),
                    lengthMm: Math.round(model.lengthMm),
                  })}
                </span>
              ) : null}
              <div className="flex gap-1">
                <Button
                  data-testid={`gen-fav-${index}`}
                  size="sm"
                  variant={starred ? 'default' : 'outline'}
                  aria-pressed={starred}
                  onClick={() => toggleFavourite(item.id)}
                >
                  {t(locale, 'gen.favourite')}
                </Button>
                <Button data-testid={`gen-apply-${index}`} size="sm" variant="outline" onClick={() => onPick(index)}>
                  {t(locale, 'gen.apply')}
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      {pending !== null ? (
        <ConfirmReplace
          testId="generator"
          title={t(locale, 'gen.confirmTitle')}
          body={t(locale, 'gen.confirmBody', { name: t(locale, 'gen.title') })}
          confirmLabel={t(locale, 'gen.confirmApply')}
          cancelLabel={t(locale, 'gen.confirmCancel')}
          onConfirm={() => apply(pending)}
          onCancel={() => setPending(null)}
        />
      ) : null}
    </section>
  )
}
