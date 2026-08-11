'use client'

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Design, Row } from '@/lib/engine'
import { t, type Locale } from '@/lib/i18n'
import { speciesHex } from '@/lib/species'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { cn } from '@/lib/utils'
import type { UnitSystem } from '@/lib/units'

function RowCard({
  row,
  index,
  design,
  locale,
  unit,
  selected,
}: {
  row: Row
  index: number
  design: Design
  locale: Locale
  unit: UnitSystem
  selected: boolean
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
  const { model } = useDerived()
  const testId = `row-${row.id}`
  const previewCells = model.cells.filter((c) => c.origin.rowId === row.id)

  return (
    <li
      data-testid={testId}
      onFocus={() => selectRow(row.id)}
      className={cn(
        'grid grid-cols-[88px_1fr_120px_120px_96px] items-end gap-3 rounded-md border px-2.5 py-2 max-lg:flex max-lg:flex-wrap',
        selected ? 'border-accent-border bg-accent-soft' : 'border-line-subtle bg-surface'
      )}
    >
      <span className="w-16 shrink-0 font-mono text-sm tabular-nums text-ink">{t(locale, 'rows.row', { id: row.id })}</span>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${testId}-panel`} className="text-[11px] text-ink-muted">
            {t(locale, 'rows.panel')}
          </label>
          <select
            id={`${testId}-panel`}
            data-testid={`${testId}-panel`}
            value={row.panelId}
            onChange={(e) => setRowPanel(row.id, e.target.value)}
            className="h-[30px] rounded-sm border border-line bg-surface-raised px-2 text-sm"
          >
            {design.panels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
              </option>
            ))}
          </select>
        </div>

        {previewCells.length > 0 ? (
          <div className="flex flex-wrap gap-0.5" aria-hidden="true">
            {previewCells.map((cell) => (
              <span
                key={cell.id}
                style={{ backgroundColor: speciesHex(cell.speciesId) }}
                className="size-4 shrink-0 rounded-[2px]"
                data-species={cell.speciesId}
              />
            ))}
          </div>
        ) : null}

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
      </div>

      <NumberFieldMm
        id={`${testId}-thickness`}
        testId={`${testId}-thickness`}
        labelKey="rows.thickness"
        valueMm={row.thicknessMm}
        unit={unit}
        locale={locale}
        size="dense"
        onCommitMm={(mm) => setRowThickness(row.id, mm)}
      />

      <NumberFieldMm
        id={`${testId}-trim`}
        testId={`${testId}-trim`}
        labelKey="rows.trim"
        valueMm={row.trimMm}
        unit={unit}
        locale={locale}
        minMm={0}
        size="dense"
        onCommitMm={(mm) => setRowTrim(row.id, mm)}
      />

      <div className="flex items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 hover:bg-app hover:text-ink"
          data-testid={`${testId}-up`}
          aria-label={t(locale, 'rows.moveUp')}
          onClick={() => moveRow(index, index - 1)}
        >
          <ChevronUp size={15} strokeWidth={1.6} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 hover:bg-app hover:text-ink"
          data-testid={`${testId}-down`}
          aria-label={t(locale, 'rows.moveDown')}
          onClick={() => moveRow(index, index + 1)}
        >
          <ChevronDown size={15} strokeWidth={1.6} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 hover:bg-app hover:text-ink"
          data-testid={`${testId}-add`}
          aria-label={t(locale, 'rows.add')}
          onClick={() => addRow(row.id)}
        >
          <Plus size={15} strokeWidth={1.6} />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-7 hover:bg-error-soft hover:text-error"
          data-testid={`${testId}-remove`}
          aria-label={t(locale, 'rows.remove')}
          onClick={() => removeRow(row.id)}
        >
          <Trash2 size={15} strokeWidth={1.6} />
        </Button>
      </div>
    </li>
  )
}

export function RowInspector() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const design = useStudio(selectDesign)
  const selectedRowId = useStudio((s) => s.selectedRowId)
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
              <RowCard
                key={row.id}
                row={row}
                index={index}
                design={design}
                locale={locale}
                unit={unit}
                selected={row.id === selectedRowId}
              />
            ))}
          </ul>
        )}
        <Button size="sm" variant="default" data-testid="rows-add" onClick={() => addRow(null)}>
          {t(locale, 'rows.add')}
        </Button>
      </CardContent>
    </Card>
  )
}
