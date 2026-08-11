'use client'

import { useState } from 'react'
import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BOARD_MAX_MM, BOARD_MIN_MM, THICKNESS_MAX_MM, THICKNESS_MIN_MM } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { shareUrl } from '@/lib/store/persist'
import { selectDesign, useStudio } from '@/lib/store/studio'

export function BoardSettings() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const design = useStudio(selectDesign)
  const setDesignName = useStudio((s) => s.setDesignName)
  const setBoardWidthMm = useStudio((s) => s.setBoardWidthMm)
  const setBoardLengthMm = useStudio((s) => s.setBoardLengthMm)
  const setBoardThicknessMm = useStudio((s) => s.setBoardThicknessMm)
  const setKerfMm = useStudio((s) => s.setKerfMm)
  const setPlaningAllowanceMm = useStudio((s) => s.setPlaningAllowanceMm)
  const setPlanerWidthMm = useStudio((s) => s.setPlanerWidthMm)
  const [copied, setCopied] = useState(false)

  const copyLink = (): void => {
    const url = shareUrl(window.location.href, design)
    // Адресную строку не трогаем: хэш - это только содержимое буфера обмена,
    // иначе он навсегда пришпилит вкладку к снимку и съест автосохранение при перезагрузке.
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2500)
      })
      .catch(() => {
        // Буфер обмена недоступен - молча остаёмся без успеха, ничего не ломаем.
      })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t(locale, 'board.settings')}</CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="board-name" className="text-[11px] text-ink-muted">
            {t(locale, 'board.name')}
          </label>
          <input
            id="board-name"
            data-testid="board-name"
            value={design.name}
            onChange={(e) => setDesignName(e.target.value)}
            className="h-[34px] w-full rounded-sm border border-line bg-surface-raised px-2 font-sans text-sm text-ink outline-none transition-[border-color,box-shadow] duration-hover ease-out hover:border-line-strong focus:border-[1.5px] focus:border-accent focus:shadow-focus"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <NumberFieldMm id="board-width" testId="board-width" labelKey="board.width" valueMm={design.board.targetWidthMm} unit={unit} locale={locale} minMm={BOARD_MIN_MM} maxMm={BOARD_MAX_MM} onCommitMm={setBoardWidthMm} size="compact" suffix={t(locale, unit === 'mm' ? 'units.mm' : 'units.in')} />
          <NumberFieldMm id="board-length" testId="board-length" labelKey="board.length" valueMm={design.board.targetLengthMm} unit={unit} locale={locale} minMm={BOARD_MIN_MM} maxMm={BOARD_MAX_MM} onCommitMm={setBoardLengthMm} size="compact" suffix={t(locale, unit === 'mm' ? 'units.mm' : 'units.in')} />
          <NumberFieldMm id="board-thickness" testId="board-thickness" labelKey="board.thickness" valueMm={design.board.thicknessMm} unit={unit} locale={locale} minMm={THICKNESS_MIN_MM} maxMm={THICKNESS_MAX_MM} onCommitMm={setBoardThicknessMm} size="compact" suffix={t(locale, unit === 'mm' ? 'units.mm' : 'units.in')} />
          <NumberFieldMm id="board-kerf" testId="board-kerf" labelKey="board.kerf" valueMm={design.kerfMm} unit={unit} locale={locale} minMm={0.1} maxMm={10} onCommitMm={setKerfMm} size="compact" suffix={t(locale, unit === 'mm' ? 'units.mm' : 'units.in')} />
          <NumberFieldMm id="board-allowance" testId="board-allowance" labelKey="board.allowance" valueMm={design.planingAllowanceMm} unit={unit} locale={locale} minMm={0} onCommitMm={setPlaningAllowanceMm} size="compact" suffix={t(locale, unit === 'mm' ? 'units.mm' : 'units.in')} />
          <NumberFieldMm id="board-planer" testId="board-planer" labelKey="board.planerWidth" valueMm={design.planerWidthMm} unit={unit} locale={locale} minMm={50} onCommitMm={setPlanerWidthMm} size="compact" suffix={t(locale, unit === 'mm' ? 'units.mm' : 'units.in')} />
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" data-testid="share-copy" onClick={copyLink}>
            {t(locale, 'share.copy')}
          </Button>
          {copied ? <span className="text-[11px] text-ink-muted">{t(locale, 'share.copied')}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
