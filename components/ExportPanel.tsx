'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Lock } from 'lucide-react'
import { usePro } from '@/components/ProProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpHint } from '@/components/ui/help-hint'
import { t, type MessageKey } from '@/lib/i18n'
import { buildCutPlan, renderBoardSvg, safeFileName } from '@/lib/export'
import { CSV_BOM, cutPlanToCsv } from '@/lib/export/csv'
import { downloadText } from '@/lib/export/download'
import { bothUnits } from '@/lib/export/format'
import { colBandsMm, rowBandsMm } from '@/lib/engine'
import { useDerived } from '@/lib/store/derived'
import { selectDesign, useStudio } from '@/lib/store/studio'
import { PNG_MAX_PX_FREE, PNG_MAX_PX_PRO, PNG_SCALE_FREE, PNG_SCALE_PRO } from '@/lib/stripe/limits'

export type ExportFormat = 'png' | 'png-hd' | 'svg' | 'csv' | 'pdf'

const BUTTONS: readonly { readonly format: ExportFormat; readonly labelKey: MessageKey }[] = [
  { format: 'png', labelKey: 'export.png' },
  { format: 'png-hd', labelKey: 'export.pngHd' },
  { format: 'svg', labelKey: 'export.svg' },
  { format: 'csv', labelKey: 'export.csv' },
  { format: 'pdf', labelKey: 'export.pdf' },
]

export function ExportPanel() {
  const locale = useStudio((s) => s.locale)
  const design = useStudio(selectDesign)
  const { model, calc } = useDerived()
  const { status } = usePro()
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
        const svg = renderBoardSvg(model, {
          title: design.name,
          caption,
          maxPx: 1600,
          rowLabels: rowBandsMm(design),
          colLabels: colBandsMm(design),
        }).svg
        downloadText(svg, safeFileName(design.name, 'svg'), 'image/svg+xml;charset=utf-8')
      } else if (format === 'csv') {
        const csv = cutPlanToCsv(buildCutPlan(design), { locale })
        downloadText(CSV_BOM + csv, safeFileName(design.name, 'csv'), 'text/csv;charset=utf-8')
      } else if (format === 'png' || format === 'png-hd') {
        // Мягкий гейт: растеризация целиком в браузере, поэтому проверка тут не защита,
        // а честная витрина. Серверно защищён только лимит облачных проектов.
        const scale = format === 'png-hd' ? PNG_SCALE_PRO : PNG_SCALE_FREE
        // maxPx в renderBoardSvg это сторона сцены до множителя, поэтому делим:
        // 1200 на 2 даёт обещанные 2400 px, 1000 на 4 даёт 4000 px для печати.
        // У HD-варианта сцена мельче обычной (1000 против 1200), и это осознанно:
        // текст подписи растёт вместе с множителем, а вчетверо увеличенный SVG с
        // мелкой сцены даёт для печати ровно тот же результат, что и крупная сцена.
        const maxPx = (format === 'png-hd' ? PNG_MAX_PX_PRO : PNG_MAX_PX_FREE) / scale
        const [{ downloadBlob }, { svgToPngBlob }] = await Promise.all([import('@/lib/export/download'), import('@/lib/export/png')])
        const rendered = renderBoardSvg(model, { title: design.name, caption, maxPx })
        downloadBlob(await svgToPngBlob(rendered, { scale }), safeFileName(design.name, 'png'))
      } else {
        const [{ downloadBlob }, { buildInstructionPdf }] = await Promise.all([import('@/lib/export/download'), import('@/lib/export/pdf')])
        downloadBlob(
          await buildInstructionPdf({ design, model, calc, locale, pro: status.pro }),
          safeFileName(design.name, 'pdf'),
        )
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
          {BUTTONS.map(({ format, labelKey }) =>
            // Заблокированное показываем с замком, а не прячем: человек должен видеть,
            // что он получит за деньги. Клик ведёт на тарифы вместо экспорта.
            format === 'png-hd' && !status.pro ? (
              <Button
                key={format}
                size="sm"
                variant="outline"
                data-testid="export-png-hd"
                render={<Link href="/pricing" />}
              >
                <Lock data-icon="inline-start" />
                {t(locale, labelKey)}
              </Button>
            ) : (
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
            ),
          )}
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
