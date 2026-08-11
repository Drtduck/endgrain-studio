import { CardTitle } from '@/components/ui/card'
import type { BoardModel } from '@/lib/engine'
import type { CalcResult } from '@/lib/calc'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { SPECIES_BY_ID } from '@/lib/species'
import { formatMm } from '@/lib/units'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

export function ComplexityMeter({
  locale,
  calc,
  unit,
  model,
}: {
  locale: Locale
  calc: CalcResult
  unit: 'mm' | 'in'
  model: BoardModel
}) {
  const unitLabel = t(locale, unit === 'mm' ? 'units.mm' : 'units.in')
  const kgLabel = t(locale, 'units.kg')
  // Порог отходов: в макете подсвечена ячейка 18%, но у нас нет отдельной диагностики
  // отходов (calc.wastePct считается, но верхняя граница нигде не задана), поэтому
  // подсветку text-warning оставляем выключенной, а не изобретаем новый порог.
  const rows: Array<[MessageKey, string, string]> = [
    ['meter.glueUps', String(calc.glueUpCount), ''],
    ['meter.cuts', String(calc.cutCount), ''],
    ['meter.cells', String(model.cells.length), ''],
    ['meter.boardFeet', calc.totalBoardFeet.toFixed(2), 'bf'],
    ['meter.waste', calc.wastePct.toFixed(1), '%'],
    ['meter.weight', calc.totalWeightKg.toFixed(2), kgLabel],
  ]

  return (
    <div className="w-full max-w-sm rounded-lg border border-line-subtle bg-surface p-3.5">
      <div className="mb-3">
        <CardTitle>{t(locale, 'meter.title')}</CardTitle>
        <p className="mt-1 text-sm text-ink-secondary">
          {t(locale, 'board.size', {
            widthMm: formatMm(model.widthMm, unit, unitLabel, 0),
            lengthMm: formatMm(model.lengthMm, unit, unitLabel, 0),
            thicknessMm: formatMm(model.thicknessMm, unit, unitLabel, 0),
          })}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-2.5 gap-y-3">
        {rows.map(([key, value, unitText]) => (
          <div key={key}>
            <dt className="text-[11px] text-ink-muted">{t(locale, key)}</dt>
            <dd className="flex items-baseline gap-1">
              <span className="font-mono text-xl leading-6 font-medium tabular-nums">{value}</span>
              {unitText ? <span className="font-mono text-[11px] text-ink-muted">{unitText}</span> : null}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-3 flex items-baseline justify-between border-t border-line-subtle pt-3">
        <span className="text-[13px] text-ink-secondary">{t(locale, 'meter.cost')}</span>
        <span className="font-mono text-[28px] leading-8 font-semibold tabular-nums">{usd.format(calc.totalCostUsd)}</span>
      </div>

      <div className="mt-3">
        <p className="mb-1 text-[11px] text-ink-muted">{t(locale, 'meter.lumberBySpecies')}</p>
        <ul className="space-y-0.5 text-[11px] text-ink-muted">
          {calc.bySpecies.map((s) => {
            const species = SPECIES_BY_ID.get(s.speciesId)
            const name = species ? (locale === 'ru' ? species.nameRu : species.nameEn) : s.speciesId
            return (
              <li key={s.speciesId} className="font-mono tabular-nums">
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

    </div>
  )
}
