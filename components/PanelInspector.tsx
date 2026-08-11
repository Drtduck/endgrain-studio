'use client'

import { useState } from 'react'
import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MIN_STRIP_WIDTH_MM, isStrip, panelWidthMm, usageCount, type Panel, type PanelElement } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { SPECIES, speciesHex } from '@/lib/species'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { formatMm, type UnitSystem } from '@/lib/units'

function StripRow({
  panelId,
  index,
  element,
  locale,
  unit,
}: {
  panelId: string
  index: number
  element: PanelElement
  locale: Locale
  unit: UnitSystem
}) {
  const setStripWidth = useStudio((s) => s.setStripWidth)
  const setStripSpecies = useStudio((s) => s.setStripSpecies)
  const removeStrip = useStudio((s) => s.removeStrip)
  const splitStripAt = useStudio((s) => s.splitStripAt)
  const moveStrip = useStudio((s) => s.moveStrip)
  const [splitAtMm, setSplitAtMm] = useState(0)
  const testId = `strip-${panelId}-${index}`

  if (!isStrip(element)) {
    const unitLabel = t(locale, unit === 'mm' ? 'units.mm' : 'units.in')
    return (
      <li data-testid={testId} className="rounded-md border px-2 py-1.5 text-sm text-muted-foreground">
        {t(locale, 'panels.sliceRef', {
          panelId: element.panelId,
          thicknessMm: formatMm(element.thicknessMm, unit, unitLabel, 1),
        })}
      </li>
    )
  }

  return (
    <li data-testid={testId} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
      <span
        aria-hidden="true"
        style={{ backgroundColor: speciesHex(element.speciesId) }}
        className="h-8 w-8 shrink-0 rounded border border-black/20"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={`${testId}-species`} className="text-xs text-muted-foreground">
          {t(locale, 'panels.stripSpecies')}
        </label>
        <select
          id={`${testId}-species`}
          data-testid={`${testId}-species`}
          value={element.speciesId}
          onChange={(e) => setStripSpecies(panelId, index, e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {SPECIES.map((s) => (
            <option key={s.id} value={s.id}>
              {locale === 'ru' ? s.nameRu : s.nameEn}
            </option>
          ))}
        </select>
      </div>

      <div className="w-24">
        <NumberFieldMm
          id={`${testId}-width`}
          testId={`${testId}-width`}
          labelKey="panels.stripWidth"
          valueMm={element.widthMm}
          unit={unit}
          locale={locale}
          minMm={MIN_STRIP_WIDTH_MM}
          onCommitMm={(mm) => setStripWidth(panelId, index, mm)}
        />
      </div>

      <div className="w-24">
        <NumberFieldMm
          id={`${testId}-splitat`}
          testId={`${testId}-splitat`}
          labelKey="panels.splitAt"
          valueMm={splitAtMm}
          unit={unit}
          locale={locale}
          onCommitMm={setSplitAtMm}
        />
      </div>

      <Button size="sm" variant="outline" data-testid={`${testId}-split`} onClick={() => splitStripAt(panelId, index, splitAtMm)}>
        {t(locale, 'panels.split')}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-up`} aria-label={t(locale, 'panels.moveUp')} onClick={() => moveStrip(panelId, index, index - 1)}>
        {'<'}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-down`} aria-label={t(locale, 'panels.moveDown')} onClick={() => moveStrip(panelId, index, index + 1)}>
        {'>'}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-remove`} aria-label={t(locale, 'panels.removeStrip')} onClick={() => removeStrip(panelId, index)}>
        {t(locale, 'panels.removeStrip')}
      </Button>
    </li>
  )
}

function PanelCard({ panel, locale, unit }: { panel: Panel; locale: Locale; unit: UnitSystem }) {
  const design = useStudio(selectDesign)
  const addStrip = useStudio((s) => s.addStrip)
  const selectPanel = useStudio((s) => s.selectPanel)
  const { model } = useDerived()
  const unitLabel = t(locale, unit === 'mm' ? 'units.mm' : 'units.in')
  const lengthMm = model.panelLengthsMm[panel.id] ?? 0

  return (
    <section data-testid={`panel-${panel.id}`} className="rounded-lg border p-3" onFocus={() => selectPanel(panel.id)}>
      <header className="mb-2">
        <h3 className="text-sm font-medium">{t(locale, 'panels.panel', { id: panel.id })}</h3>
        <p data-testid={`panel-${panel.id}-meta`} className="text-xs text-muted-foreground">
          {t(locale, 'panels.width', { widthMm: formatMm(panelWidthMm(panel), unit, unitLabel, 1) })}
          {', '}
          {t(locale, 'panels.length', { lengthMm: formatMm(lengthMm, unit, unitLabel, 1) })}
          {', '}
          {t(locale, 'panels.usage', { count: usageCount(design, panel.id) })}
        </p>
      </header>

      {panel.elements.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">{t(locale, 'panels.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {panel.elements.map((element, index) => (
            <StripRow
              key={`${panel.id}-${index}`}
              panelId={panel.id}
              index={index}
              element={element}
              locale={locale}
              unit={unit}
            />
          ))}
        </ul>
      )}

      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        data-testid={`panel-${panel.id}-add`}
        onClick={() => addStrip(panel.id, panel.elements.length)}
      >
        {t(locale, 'panels.addStrip')}
      </Button>
    </section>
  )
}

export function PanelInspector() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const design = useStudio(selectDesign)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'panels.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {design.panels.map((panel) => (
          <PanelCard key={panel.id} panel={panel} locale={locale} unit={unit} />
        ))}
      </CardContent>
    </Card>
  )
}
