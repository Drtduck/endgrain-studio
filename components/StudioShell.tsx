'use client'

import { useMemo, useState } from 'react'
import { BoardSvg } from '@/components/BoardSvg'
import { ComplexityMeter } from '@/components/ComplexityMeter'
import { LocaleToggle } from '@/components/LocaleToggle'
import { calcProject } from '@/lib/calc'
import { makeCheckerboard } from '@/lib/designs/samples'
import { compile, validate } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { SPECIES, shrinkageMap } from '@/lib/species'

export function StudioShell() {
  const [locale, setLocale] = useState<Locale>('ru')
  const design = useMemo(() => makeCheckerboard(), [])
  const model = useMemo(() => compile(design), [design])
  const calc = useMemo(() => calcProject(design, model), [design, model])
  const knownSpeciesIds = useMemo(() => SPECIES.map((s) => s.id), [])
  const diagnostics = useMemo(
    () => validate(design, { shrinkageByPct: shrinkageMap(), knownSpeciesIds }),
    [design, knownSpeciesIds],
  )

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{t(locale, 'app.title')}</h1>
          <p className="text-sm text-muted-foreground">{t(locale, 'app.tagline')}</p>
        </div>
        <LocaleToggle locale={locale} onChange={setLocale} />
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        <section aria-label={t(locale, 'board.title')} className="flex-1">
          <BoardSvg model={model} locale={locale} />
        </section>
        <ComplexityMeter locale={locale} calc={calc} diagnostics={diagnostics} unit="mm" model={model} />
      </div>
    </main>
  )
}
