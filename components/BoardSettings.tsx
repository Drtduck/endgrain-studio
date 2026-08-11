'use client'

import { useState } from 'react'
import { NumberFieldMm } from '@/components/NumberFieldMm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BOARD_MAX_MM, BOARD_MIN_MM, THICKNESS_MAX_MM, THICKNESS_MIN_MM } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { shareUrl } from '@/lib/store/persist'
import { selectDesign, useStudio } from '@/lib/store/studio'
import type { UnitSystem } from '@/lib/units'

export function BoardSettings() {
  const locale = useStudio((s) => s.locale)
  const unit = useStudio((s) => s.unit)
  const setUnit = useStudio((s) => s.setUnit)
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
    window.history.replaceState(null, '', url)
    void navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <CardTitle className="text-base">{t(locale, 'board.settings')}</CardTitle>
        <div className="flex gap-1" role="group" aria-label={t(locale, 'aria.unitGroup')}>
          {(['mm', 'in'] as const).map((u: UnitSystem) => (
            <Button
              key={u}
              size="sm"
              variant={u === unit ? 'default' : 'outline'}
              data-testid={`unit-${u}`}
              onClick={() => setUnit(u)}
            >
              {t(locale, u === 'mm' ? 'units.mm' : 'units.in')}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="board-name" className="text-xs text-muted-foreground">
            {t(locale, 'board.name')}
          </label>
          <input
            id="board-name"
            data-testid="board-name"
            value={design.name}
            onChange={(e) => setDesignName(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <NumberFieldMm id="board-width" testId="board-width" labelKey="board.width" valueMm={design.board.targetWidthMm} unit={unit} locale={locale} minMm={BOARD_MIN_MM} maxMm={BOARD_MAX_MM} onCommitMm={setBoardWidthMm} />
          <NumberFieldMm id="board-length" testId="board-length" labelKey="board.length" valueMm={design.board.targetLengthMm} unit={unit} locale={locale} minMm={BOARD_MIN_MM} maxMm={BOARD_MAX_MM} onCommitMm={setBoardLengthMm} />
          <NumberFieldMm id="board-thickness" testId="board-thickness" labelKey="board.thickness" valueMm={design.board.thicknessMm} unit={unit} locale={locale} minMm={THICKNESS_MIN_MM} maxMm={THICKNESS_MAX_MM} onCommitMm={setBoardThicknessMm} />
          <NumberFieldMm id="board-kerf" testId="board-kerf" labelKey="board.kerf" valueMm={design.kerfMm} unit={unit} locale={locale} minMm={0.1} maxMm={10} onCommitMm={setKerfMm} />
          <NumberFieldMm id="board-allowance" testId="board-allowance" labelKey="board.allowance" valueMm={design.planingAllowanceMm} unit={unit} locale={locale} minMm={0} onCommitMm={setPlaningAllowanceMm} />
          <NumberFieldMm id="board-planer" testId="board-planer" labelKey="board.planerWidth" valueMm={design.planerWidthMm} unit={unit} locale={locale} minMm={50} onCommitMm={setPlanerWidthMm} />
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" data-testid="share-copy" onClick={copyLink}>
            {t(locale, 'share.copy')}
          </Button>
          {copied ? <span className="text-sm text-muted-foreground">{t(locale, 'share.copied')}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
