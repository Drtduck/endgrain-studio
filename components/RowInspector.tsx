'use client'

import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Design, Row } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { selectDesign, useStudio } from '@/lib/store/studio'
import type { UnitSystem } from '@/lib/units'

function RowCard({
  row,
  index,
  design,
  locale,
  unit,
}: {
  row: Row
  index: number
  design: Design
  locale: Locale
  unit: UnitSystem
}) {
  const setRowThickness = useStudio((s) => s.setRowThickness)
  const setRowPanel = useStudio((s) => s.setRowPanel)
  const setRowTrim = useStudio((s) => s.setRowTrim)
  const toggleRowFlip = useStudio((s) => s.toggleRowFlip)
  const toggleRowMirror = useStudio((s) => s.toggleRowMirror)
  const addRow = useStudio((s) => s.addRow)
  const removeRow = useStudio((s) => s.removeRow)
  const moveRow = useStudio((s) => s.moveRow)
  const selectRow = useStudio((s) => s.selectRow)
  const testId = `row-${row.id}`

  return (
    <li data-testid={testId} className="flex flex-wrap items-end gap-2 rounded-md border p-2" onFocus={() => selectRow(row.id)}>
      <span className="w-16 shrink-0 text-sm font-medium">{t(locale, 'rows.row', { id: row.id })}</span>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${testId}-panel`} className="text-xs text-muted-foreground">
          {t(locale, 'rows.panel')}
        </label>
        <select
          id={`${testId}-panel`}
          data-testid={`${testId}-panel`}
          value={row.panelId}
          onChange={(e) => setRowPanel(row.id, e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {design.panels.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id}
            </option>
          ))}
        </select>
      </div>

      <div className="w-24">
        <NumberFieldMm
          id={`${testId}-thickness`}
          testId={`${testId}-thickness`}
          labelKey="rows.thickness"
          valueMm={row.thicknessMm}
          unit={unit}
          locale={locale}
          onCommitMm={(mm) => setRowThickness(row.id, mm)}
        />
      </div>

      <div className="w-24">
        <NumberFieldMm
          id={`${testId}-trim`}
          testId={`${testId}-trim`}
          labelKey="rows.trim"
          valueMm={row.trimMm}
          unit={unit}
          locale={locale}
          minMm={0}
          onCommitMm={(mm) => setRowTrim(row.id, mm)}
        />
      </div>

      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          data-testid={`${testId}-flip`}
          checked={row.flip}
          onChange={() => toggleRowFlip(row.id)}
        />
        {t(locale, 'rows.flip')}
      </label>

      <label className="flex items-center gap-1 text-sm">
        <input
          type="checkbox"
          data-testid={`${testId}-mirror`}
          checked={row.mirror}
          onChange={() => toggleRowMirror(row.id)}
        />
        {t(locale, 'rows.mirror')}
      </label>

      <Button size="sm" variant="outline" data-testid={`${testId}-up`} aria-label={t(locale, 'rows.moveUp')} onClick={() => moveRow(index, index - 1)}>
        {'^'}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-down`} aria-label={t(locale, 'rows.moveDown')} onClick={() => moveRow(index, index + 1)}>
        {'v'}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-add`} onClick={() => addRow(row.id)}>
        {t(locale, 'rows.add')}
      </Button>
      <Button size="sm" variant="outline" data-testid={`${testId}-remove`} onClick={() => removeRow(row.id)}>
        {t(locale, 'rows.remove')}
      </Button>
    </li>
  )
}

export function RowInspector() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const design = useStudio(selectDesign)
  const addRow = useStudio((s) => s.addRow)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'rows.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {design.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t(locale, 'rows.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {design.rows.map((row, index) => (
              <RowCard key={row.id} row={row} index={index} design={design} locale={locale} unit={unit} />
            ))}
          </ul>
        )}
        <Button size="sm" variant="outline" data-testid="rows-add" onClick={() => addRow(null)}>
          {t(locale, 'rows.add')}
        </Button>
      </CardContent>
    </Card>
  )
}
