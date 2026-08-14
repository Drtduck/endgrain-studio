'use client'

import { useState } from 'react'
import { usePro } from '@/components/ProProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpHint } from '@/components/ui/help-hint'
import { track } from '@/lib/analytics/events'
import { designDisplayName } from '@/lib/designs/name'
import { t, type MessageKey } from '@/lib/i18n'
import { buildCutPlan, safeFileName } from '@/lib/export'
import { CSV_BOM, cutPlanToCsv } from '@/lib/export/csv'
import { downloadText } from '@/lib/export/download'
import { encodeDesignToHash } from '@/lib/persist'
import { selectDesign, useStudio } from '@/lib/store/studio'

export type ExportFormat = 'print' | 'csv'

const BUTTONS: readonly { readonly format: ExportFormat; readonly labelKey: MessageKey }[] = [
  { format: 'print', labelKey: 'export.print' },
  { format: 'csv', labelKey: 'export.csv' },
]

export function ExportPanel() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { status } = usePro()
  const [failed, setFailed] = useState(false)

  const run = (format: ExportFormat): void => {
    setFailed(false)
    try {
      if (format === 'csv') {
        const title = designDisplayName(design, locale)
        const csv = cutPlanToCsv(buildCutPlan(design, locale), { locale })
        downloadText(CSV_BOM + csv, safeFileName(title, 'csv'), 'text/csv;charset=utf-8')
        return
      }
      // Проект уезжает тем же хэшем, что и ссылка «поделиться»: печатная вкладка
      // ничего не знает о сторе студии и поднимает документ из адреса.
      window.open(`/print#${encodeDesignToHash(design)}`, '_blank', 'noopener')
      // Имя события осталось историческим: в аналитике это та же воронка «человек забрал
      // инструкцию», просто теперь она уходит в печать браузера, а не в клиентский PDF.
      track('pdf_exported', { pro: status.pro })
    } catch (err) {
      // Причина уходит в консоль браузера, пользователю показываем одну человеческую строку.
      console.error(err)
      setFailed(true)
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
              onClick={() => { run(format) }}
            >
              {t(locale, labelKey)}
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
