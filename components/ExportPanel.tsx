'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpHint } from '@/components/ui/help-hint'
import { t, type MessageKey } from '@/lib/i18n'
import { buildCutPlan, renderBoardSvg, safeFileName } from '@/lib/export'
import { CSV_BOM, cutPlanToCsv } from '@/lib/export/csv'
import { downloadText } from '@/lib/export/download'
import { bothUnits } from '@/lib/export/format'
import { rowBandsMm } from '@/lib/engine'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'

export type ExportFormat = 'png' | 'svg' | 'csv' | 'pdf'

const BUTTONS: readonly { readonly format: ExportFormat; readonly labelKey: MessageKey }[] = [
  { format: 'png', labelKey: 'export.png' },
  { format: 'svg', labelKey: 'export.svg' },
  { format: 'csv', labelKey: 'export.csv' },
  { format: 'pdf', labelKey: 'export.pdf' },
]

export function ExportPanel() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { model, calc } = useDerived()
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [failed, setFailed] = useState(false)

  // SVG/PNG подписи должны нести то же предупреждение, что и первая страница PDF:
  // усечённая по бюджету ячеек модель одинаково неполна в любом формате экспорта.
  const caption =
    t(locale, 'export.caption', {
      name: design.name,
      width: bothUnits(model.widthMm, locale, 0),
      length: bothUnits(model.lengthMm, locale, 0),
      thickness: bothUnits(model.thicknessMm, locale, 0),
    }) + (model.truncated ? ` ${t(locale, 'export.truncated')}` : '')

  const run = async (format: ExportFormat): Promise<void> => {
    setBusy(format)
    setFailed(false)
    try {
      // svg/csv не тянут тяжёлых зависимостей, downloadText статический и срабатывает
      // без лишнего тика на await import: кнопка отдаёт файл в тот же обработчик клика.
      // png/pdf грузятся по клику: jspdf и канвас-растеризатор в первом бандле страницы делать нечего.
      if (format === 'svg') {
        const svg = renderBoardSvg(model, { title: design.name, caption, maxPx: 1600, rowLabels: rowBandsMm(design) }).svg
        downloadText(svg, safeFileName(design.name, 'svg'), 'image/svg+xml;charset=utf-8')
      } else if (format === 'csv') {
        const csv = cutPlanToCsv(buildCutPlan(design), { locale })
        downloadText(CSV_BOM + csv, safeFileName(design.name, 'csv'), 'text/csv;charset=utf-8')
      } else if (format === 'png') {
        const [{ downloadBlob }, { svgToPngBlob }] = await Promise.all([import('@/lib/export/download'), import('@/lib/export/png')])
        const rendered = renderBoardSvg(model, { title: design.name, caption, maxPx: 1200 })
        downloadBlob(await svgToPngBlob(rendered, { scale: 2 }), safeFileName(design.name, 'png'))
      } else {
        const [{ downloadBlob }, { buildInstructionPdf }] = await Promise.all([import('@/lib/export/download'), import('@/lib/export/pdf')])
        downloadBlob(await buildInstructionPdf({ design, model, calc, locale }), safeFileName(design.name, 'pdf'))
      }
    } catch (err) {
      // Причина уходит в консоль браузера, пользователю показываем одну человеческую строку.
      console.error(err)
      setFailed(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card aria-label={t(locale, 'aria.exportPanel')}>
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <CardTitle className="text-base">{t(locale, 'export.title')}</CardTitle>
          <HelpHint id="export" side="left" />
        </div>
        <p className="text-sm text-ink-muted">{t(locale, 'export.hint')}</p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {BUTTONS.map(({ format, labelKey }) => (
            <Button
              key={format}
              size="sm"
              variant="outline"
              data-testid={`export-${format}`}
              disabled={busy !== null}
              onClick={() => { void run(format) }}
            >
              {busy === format ? t(locale, 'export.busy') : t(locale, labelKey)}
            </Button>
          ))}
        </div>
        {failed ? (
          <p
            data-testid="export-error"
            role="alert"
            className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
          >
            {t(locale, 'export.error')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
