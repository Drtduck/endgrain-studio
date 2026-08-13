'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, Scissors, Trash2 } from 'lucide-react'
import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpHint } from '@/components/ui/help-hint'
import { MAX_SLICE_ANGLE_DEG, MIN_STRIP_WIDTH_MM, isStrip, panelWidthMm, usageCount, type Panel, type PanelElement } from '@/lib/engine'
import { t, unitLabel, type Locale } from '@/lib/i18n'
import { SPECIES, speciesHex, speciesName } from '@/lib/species'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { cn } from '@/lib/utils'
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
  const selectStrip = useStudio((s) => s.selectStrip)
  const selectedStripIndex = useStudio((s) => s.selectedStripIndex)
  const setSliceAngle = useStudio((s) => s.setSliceAngle)
  const toggleSliceFlip = useStudio((s) => s.toggleSliceFlip)
  const setSliceOffset = useStudio((s) => s.setSliceOffset)
  const [splitAtMm, setSplitAtMm] = useState(0)
  const testId = `strip-${panelId}-${index}`
  // Одна колонка на доске - это один и тот же индекс сразу в нескольких панелях (шахматка чередует
  // панели по рядам), поэтому подсветка/скролл идут по индексу, а не по конкретной полосе.
  const selected = index === selectedStripIndex

  if (!isStrip(element)) {
    const label = unitLabel(locale, unit)
    return (
      <li
        data-testid={testId}
        data-strip-col={index}
        onFocus={() => selectStrip(index)}
        className={cn(
          'flex flex-wrap items-end gap-3 rounded-md border px-2.5 py-2 text-sm text-ink-muted',
          selected ? 'border-accent-border bg-accent-soft' : 'border-line-subtle bg-surface'
        )}
      >
        <span>
          {t(locale, 'panels.sliceRef', {
            panelId: element.panelId,
            thicknessMm: formatMm(element.thicknessMm, unit, label, 1),
          })}
        </span>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${testId}-angle`} className="text-[11px] text-ink-muted">
            {t(locale, 'panels.sliceAngle')}
          </label>
          <div className="flex h-[30px] min-w-0 items-center gap-1 rounded-sm border border-line bg-surface-raised px-2">
            <input
              id={`${testId}-angle`}
              data-testid={`${testId}-angle`}
              type="number"
              inputMode="decimal"
              step="0.5"
              min={-MAX_SLICE_ANGLE_DEG}
              max={MAX_SLICE_ANGLE_DEG}
              defaultValue={element.angleDeg}
              key={element.angleDeg}
              onBlur={(e) => {
                const deg = Number.parseFloat(e.target.value)
                if (Number.isFinite(deg)) setSliceAngle(panelId, index, deg)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
              }}
              className="w-16 min-w-0 appearance-none border-0 bg-transparent font-mono text-sm tabular-nums text-ink outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span aria-hidden className="shrink-0 font-mono text-[11px] text-ink-muted">
              °
            </span>
          </div>
        </div>

        <NumberFieldMm
          id={`${testId}-offset`}
          testId={`${testId}-offset`}
          labelKey="panels.sliceOffset"
          valueMm={element.offsetMm}
          unit={unit}
          locale={locale}
          size="dense"
          onCommitMm={(mm) => setSliceOffset(panelId, index, mm)}
        />

        <label className="flex items-center gap-1 text-sm">
          <input
            type="checkbox"
            data-testid={`${testId}-flip`}
            checked={element.flip ?? false}
            onChange={() => toggleSliceFlip(panelId, index)}
          />
          {t(locale, 'panels.sliceFlip')}
        </label>
      </li>
    )
  }

  // Последняя колонка держит 4 кнопки size-7 с gap-1: 4*28 + 3*4 = 124px (на 96px они
  // вылезали за скруглённый край карточки). Сетка включается по ширине самой карточки,
  // а не окна: центральная колонка студии узкая примерно до 1300px окна, и viewport-брейкпоинт
  // lg успевал включить сетку раньше, чем она помещалась.
  return (
    <li
      data-testid={testId}
      data-strip-col={index}
      onFocus={() => selectStrip(index)}
      className={cn(
        'flex flex-wrap items-end gap-3 rounded-md border px-2.5 py-2 @min-[680px]/panel:grid @min-[680px]/panel:grid-cols-[88px_1fr_120px_120px_124px]',
        selected ? 'border-accent-border bg-accent-soft' : 'border-line-subtle bg-surface'
      )}
    >
      <span
        aria-hidden="true"
        style={{ backgroundColor: speciesHex(element.speciesId) }}
        className="h-8 w-8 shrink-0 self-center rounded border border-black/20"
      />

      <div className="flex flex-col gap-1">
        <label htmlFor={`${testId}-species`} className="text-[11px] text-ink-muted">
          {t(locale, 'panels.stripSpecies')}
        </label>
        <select
          id={`${testId}-species`}
          data-testid={`${testId}-species`}
          value={element.speciesId}
          onChange={(e) => setStripSpecies(panelId, index, e.target.value)}
          className="h-[30px] rounded-sm border border-line bg-surface-raised px-2 text-sm"
        >
          {SPECIES.map((s) => (
            <option key={s.id} value={s.id}>
              {speciesName(s.id, locale)}
            </option>
          ))}
        </select>
      </div>

      <NumberFieldMm
        id={`${testId}-width`}
        testId={`${testId}-width`}
        labelKey="panels.stripWidth"
        valueMm={element.widthMm}
        unit={unit}
        locale={locale}
        minMm={MIN_STRIP_WIDTH_MM}
        size="dense"
        onCommitMm={(mm) => setStripWidth(panelId, index, mm)}
      />

      <NumberFieldMm
        id={`${testId}-splitat`}
        testId={`${testId}-splitat`}
        labelKey="panels.splitAt"
        valueMm={splitAtMm}
        unit={unit}
        locale={locale}
        size="dense"
        onCommitMm={setSplitAtMm}
      />

      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 hover:bg-app hover:text-ink"
          data-testid={`${testId}-split`}
          aria-label={t(locale, 'panels.split')}
          onClick={() => splitStripAt(panelId, index, splitAtMm)}
        >
          <Scissors size={15} strokeWidth={1.6} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 hover:bg-app hover:text-ink"
          data-testid={`${testId}-up`}
          aria-label={t(locale, 'panels.moveUp')}
          onClick={() => moveStrip(panelId, index, index - 1)}
        >
          <ChevronLeft size={15} strokeWidth={1.6} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 hover:bg-app hover:text-ink"
          data-testid={`${testId}-down`}
          aria-label={t(locale, 'panels.moveDown')}
          onClick={() => moveStrip(panelId, index, index + 1)}
        >
          <ChevronRight size={15} strokeWidth={1.6} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 hover:bg-error-soft hover:text-error"
          data-testid={`${testId}-remove`}
          aria-label={t(locale, 'panels.removeStrip')}
          onClick={() => removeStrip(panelId, index)}
        >
          <Trash2 size={15} strokeWidth={1.6} />
        </Button>
      </div>
    </li>
  )
}

function PanelCard({ panel, locale, unit, selected }: { panel: Panel; locale: Locale; unit: UnitSystem; selected: boolean }) {
  const design = useStudio(selectDesign)
  const addStrip = useStudio((s) => s.addStrip)
  const selectPanel = useStudio((s) => s.selectPanel)
  const { model } = useDerived()
  const label = unitLabel(locale, unit)
  const lengthMm = model.panelLengthsMm[panel.id] ?? 0

  return (
    <section
      data-testid={`panel-${panel.id}`}
      onFocus={() => selectPanel(panel.id)}
      className={cn(
        '@container/panel rounded-lg border p-3',
        selected ? 'border-accent-border bg-accent-soft' : 'border-line-subtle bg-surface'
      )}
    >
      <header className="mb-2">
        <h3 className="text-sm font-medium text-ink">{t(locale, 'panels.panel', { id: panel.id })}</h3>
        <p data-testid={`panel-${panel.id}-meta`} className="font-mono text-xs tabular-nums text-ink-muted">
          {t(locale, 'panels.width', { widthMm: formatMm(panelWidthMm(panel), unit, label, 1) })}
          {', '}
          {t(locale, 'panels.length', { lengthMm: formatMm(lengthMm, unit, label, 1) })}
          {', '}
          {t(locale, 'panels.usage', { count: usageCount(design, panel.id) })}
        </p>
      </header>

      {panel.elements.length === 0 ? (
        <p className="py-2 text-sm text-ink-muted">{t(locale, 'panels.empty')}</p>
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
        variant="default"
        className="mt-2"
        data-testid={`panel-${panel.id}-add`}
        onClick={() => addStrip(panel.id, panel.elements.length)}
      >
        {t(locale, 'panels.addStripToPanel', { id: panel.id })}
      </Button>
    </section>
  )
}

export function PanelInspector() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const design = useStudio(selectDesign)
  const selectedPanelId = useStudio((s) => s.selectedPanelId)
  const addColumn = useStudio((s) => s.addColumn)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">{t(locale, 'panels.title')}</CardTitle>
          <HelpHint id="panels" side="top" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" variant="default" data-testid="panels-add-column" onClick={() => addColumn(null)}>
          {t(locale, 'panels.addStrip')}
        </Button>
        {design.panels.map((panel) => (
          <PanelCard key={panel.id} panel={panel} locale={locale} unit={unit} selected={panel.id === selectedPanelId} />
        ))}
      </CardContent>
    </Card>
  )
}
