import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { BoardModel, Diagnostic } from '@/lib/engine'
import type { CalcResult } from '@/lib/calc'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { SPECIES_BY_ID } from '@/lib/species'
import { formatMm } from '@/lib/units'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function ComplexityMeter({
  locale,
  calc,
  diagnostics,
  unit,
  model,
}: {
  locale: Locale
  calc: CalcResult
  diagnostics: readonly Diagnostic[]
  unit: 'mm' | 'in'
  model: BoardModel
}) {
  const unitLabel = t(locale, unit === 'mm' ? 'units.mm' : 'units.in')
  const rows: Array<[MessageKey, string]> = [
    ['meter.glueUps', String(calc.glueUpCount)],
    ['meter.cuts', String(calc.cutCount)],
    ['meter.cells', String(model.cells.length)],
    ['meter.boardFeet', `${calc.totalBoardFeet.toFixed(2)} bf`],
    ['meter.waste', `${calc.wastePct.toFixed(1)} %`],
    ['meter.cost', usd.format(calc.totalCostUsd)],
    ['meter.weight', `${calc.totalWeightKg.toFixed(2)} ${t(locale, 'units.kg')}`],
  ]

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t(locale, 'meter.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t(locale, 'board.size', {
            widthMm: formatMm(model.widthMm, unit, unitLabel, 0),
            lengthMm: formatMm(model.lengthMm, unit, unitLabel, 0),
            thicknessMm: formatMm(model.thicknessMm, unit, unitLabel, 0),
          })}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid grid-cols-2 gap-y-1 text-sm">
          {rows.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-muted-foreground">{t(locale, key)}</dt>
              <dd className="text-right font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>

        <div>
          <p className="mb-1 text-sm font-medium">{t(locale, 'meter.lumberBySpecies')}</p>
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {calc.bySpecies.map((s) => {
              const species = SPECIES_BY_ID.get(s.speciesId)
              const name = species ? (locale === 'ru' ? species.nameRu : species.nameEn) : s.speciesId
              return (
                <li key={s.speciesId}>
                  {t(locale, 'meter.speciesRow', {
                    name,
                    meters: s.linearMeters.toFixed(2),
                    boardFeet: s.boardFeet.toFixed(2),
                    costUsd: usd.format(s.costUsd),
                  })}
                </li>
              )
            })}
          </ul>
        </div>

        {diagnostics.length === 0 ? (
          <Badge variant="secondary">{t(locale, 'meter.noIssues')}</Badge>
        ) : (
          <ul className="space-y-1 text-sm">
            {diagnostics.map((d, i) => (
              <li key={`${d.code}-${i}`} className={d.level === 'error' ? 'text-red-600' : 'text-amber-600'}>
                {t(locale, d.messageKey as MessageKey, d.params)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
