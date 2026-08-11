'use client'

import { useMemo, useState } from 'react'
import { Star } from 'lucide-react'
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
import { cn, rangeFillVar, RANGE_INPUT_CLASS } from '@/lib/utils'

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
        <h2 className="font-display text-2xl font-semibold">{t(locale, 'gen.title')}</h2>
        <p className="text-base text-ink-secondary">{t(locale, 'gen.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t(locale, 'gen.families')}>
        {FAMILIES.map((family) => {
          const active = population.familyIds.includes(family.id)
          return (
            <button
              key={family.id}
              type="button"
              data-testid={`gen-family-${family.id}`}
              aria-pressed={active}
              onClick={() => toggleFamily(family.id)}
              className={cn(
                'rounded-full px-2.5 py-1 text-xs transition-colors duration-hover',
                active ? 'bg-accent-soft font-semibold text-accent' : 'bg-surface-sunken font-medium text-ink-secondary',
              )}
            >
              {t(locale, family.nameKey)}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex w-32 flex-col gap-1">
          <span className="flex items-center justify-between text-[13px] text-ink-secondary">
            <span>{t(locale, 'gen.cols')}</span>
            <span className="font-mono text-xs tabular-nums">{first?.cols ?? 8}</span>
          </span>
          <input
            data-testid="gen-cols"
            type="range"
            min={5}
            max={14}
            step={1}
            value={first?.cols ?? 8}
            onChange={(event) => onSlider({ cols: Number(event.target.value) })}
            style={rangeFillVar(first?.cols ?? 8, 5, 14)}
            className={RANGE_INPUT_CLASS}
          />
        </label>
        <label className="flex w-32 flex-col gap-1">
          <span className="flex items-center justify-between text-[13px] text-ink-secondary">
            <span>{t(locale, 'gen.rows')}</span>
            <span className="font-mono text-xs tabular-nums">{first?.rows ?? 8}</span>
          </span>
          <input
            data-testid="gen-rows"
            type="range"
            min={5}
            max={16}
            step={1}
            value={first?.rows ?? 8}
            onChange={(event) => onSlider({ rows: Number(event.target.value) })}
            style={rangeFillVar(first?.rows ?? 8, 5, 16)}
            className={RANGE_INPUT_CLASS}
          />
        </label>
        <label className="flex w-32 flex-col gap-1">
          <span className="flex items-center justify-between text-[13px] text-ink-secondary">
            <span>{t(locale, 'gen.density')}</span>
            <span className="font-mono text-xs tabular-nums">{Math.round((first?.density ?? 0.5) * 100)}</span>
          </span>
          <input
            data-testid="gen-density"
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round((first?.density ?? 0.5) * 100)}
            onChange={(event) => onSlider({ density: Number(event.target.value) / 100 })}
            style={rangeFillVar(Math.round((first?.density ?? 0.5) * 100), 0, 100)}
            className={RANGE_INPUT_CLASS}
          />
        </label>

        <span data-testid="gen-generation" className="self-center font-mono text-xs tabular-nums text-ink-muted">
          {t(locale, 'gen.generation', { number: population.generation })}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button data-testid="gen-shuffle" className="w-full sm:flex-1" onClick={() => commit(reshuffle(population))}>
          {t(locale, 'gen.shuffle')}
        </Button>
        <Button
          data-testid="gen-evolve"
          variant="outline"
          className="w-full sm:w-auto"
          onClick={() => commit(nextGeneration(population, favouriteIds))}
        >
          {t(locale, 'gen.evolve')}
        </Button>
      </div>

      <ul
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="group"
        aria-label={t(locale, 'aria.generatorGrid')}
      >
        {population.items.map((item, index) => {
          const model = previews[index]
          const starred = favouriteIds.includes(item.id)
          return (
            <li
              key={item.id}
              data-testid={`gen-card-${index}`}
              className={cn(
                'relative flex aspect-square flex-col gap-2 overflow-hidden rounded-md border border-line-subtle p-1',
                starred && 'border-accent',
              )}
            >
              <div className="flex flex-1 items-center justify-center bg-surface-panel p-1">
                {model ? <BoardSvg model={model} locale={locale} maxPx={150} /> : null}
              </div>
              {model ? (
                <span className="px-0.5 pb-0.5 font-mono text-[10px] text-ink-muted tabular-nums">
                  {t(locale, 'gen.cardStats', {
                    glueUps: model.glueUpCount,
                    widthMm: Math.round(model.widthMm),
                    lengthMm: Math.round(model.lengthMm),
                  })}
                </span>
              ) : null}
              <Button data-testid={`gen-apply-${index}`} size="sm" variant="outline" className="w-full" onClick={() => onPick(index)}>
                {t(locale, 'gen.apply')}
              </Button>
              <button
                type="button"
                data-testid={`gen-fav-${index}`}
                aria-pressed={starred}
                aria-label={t(locale, 'gen.favourite')}
                onClick={() => toggleFavourite(item.id)}
                className="absolute top-1 right-1 z-10 flex size-5 items-center justify-center rounded-full bg-[rgba(251,249,245,0.92)]"
              >
                <Star
                  size={12}
                  className={starred ? 'fill-[#D9B31A] text-warning' : 'fill-none text-ink-muted'}
                  strokeWidth={1.6}
                />
              </button>
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
