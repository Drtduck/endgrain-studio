'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { usePro } from '@/components/ProProvider'
import { Button } from '@/components/ui/button'
import { designDisplayName } from '@/lib/designs/name'
import { colBandsMm, rowBandsMm, type Design } from '@/lib/engine'
import { buildCutPlan, buildGlueUpSteps, renderBoardSvg } from '@/lib/export'
import { areaMm2, bothUnits, speciesName } from '@/lib/export/format'
import { t, type Locale } from '@/lib/i18n'
import { readInitialDesignDetailed } from '@/lib/store/persist'
import { derive } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'
import { speciesHex } from '@/lib/species'

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

/** Открытие с автопечатью: ?autoprint=1 зовёт диалог браузера сразу после отрисовки. */
export const AUTOPRINT_PARAM = 'autoprint'

/**
 * Адрес как внешний источник: хэш читается через useSyncExternalStore, а не через
 * эффект с setState. Серверный снимок null означает «браузера ещё нет», поэтому
 * серверная разметка и первый клиентский рендер совпадают, а документ появляется
 * сразу после гидратации, без каскадного перерендера.
 */
function subscribeHash(onChange: () => void): () => void {
  window.addEventListener('hashchange', onChange)
  return () => { window.removeEventListener('hashchange', onChange) }
}

function callPrint(): void {
  // jsdom не умеет window.print, и падение здесь стоило бы всей страницы.
  try {
    window.print()
  } catch {
    // Печать недоступна: документ на экране всё равно читаемый.
  }
}

/**
 * Печатная инструкция целиком: превью доски, характеристики, схема распила, порядок работ.
 * Проект приезжает тем же хэшем, что и ссылка «поделиться» (encodeDesignToHash), а если
 * хэша нет, поднимается из localStorage: страница работает и для незалогиненного человека.
 */
export function PrintInstruction() {
  const locale = useStudio((s) => s.locale)
  const { status } = usePro()
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => null)
  // Ссылка важнее автосохранения, а без ссылки поднимаем последний локальный проект.
  const design = hash === null ? null : readInitialDesignDetailed(hash).design
  const ready = design !== null

  useEffect(() => {
    if (!ready || new URLSearchParams(window.location.search).get(AUTOPRINT_PARAM) !== '1') return undefined
    // Кадр на отрисовку документа: иначе диалог печати ловит пустую страницу.
    const timer = setTimeout(callPrint, 300)
    return () => { clearTimeout(timer) }
  }, [ready])

  if (hash === null) return null

  return (
    <main className="print-doc min-h-screen">
      <div className="print-sheet mx-auto max-w-[820px] px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3" data-print-hide>
          <Button size="sm" data-testid="print-now" onClick={callPrint}>
            {t(locale, 'print.action')}
          </Button>
          <p className="text-sm text-neutral-500">{t(locale, 'print.hint')}</p>
        </div>

        {design === null ? (
          <p data-testid="print-empty" className="text-base">
            {t(locale, 'print.empty')}
          </p>
        ) : (
          <PrintDocument design={design} locale={locale} pro={status.pro} />
        )}
      </div>
    </main>
  )
}

function Brand({ locale }: { locale: Locale }) {
  return (
    <header data-testid="print-brand" className="print-keep mb-6 flex items-center gap-3 border-b border-neutral-300 pb-3">
      <img src="/brand/beaver-mark.png" alt="" width={32} height={32} className="size-8 shrink-0" />
      <span className="text-base font-semibold text-[#6d4426]">{t(locale, 'app.title')}</span>
      <span className="ml-auto text-xs text-neutral-500">{t(locale, 'print.site')}</span>
    </header>
  )
}

function Section({ title, testId, breakBefore, children }: {
  title: string
  testId: string
  breakBefore?: boolean
  children: React.ReactNode
}) {
  return (
    <section data-testid={testId} className={breakBefore === true ? 'print-page-break mt-10' : 'mt-8'}>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function KeyValues({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
  return (
    <dl className="print-keep divide-y divide-neutral-200 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between gap-4 py-1">
          <dt className="text-neutral-600">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function PrintDocument({ design, locale, pro }: { design: Design; locale: Locale; pro: boolean }) {
  const { model, calc } = derive(design)
  // Без useMemo сознательно: расчёты держит React Compiler, а derive() к тому же
  // кэширует модель по ссылке на документ. Документ иммутабельный, пересчёт разовый.
  const plan = buildCutPlan(design, locale)
  const steps = buildGlueUpSteps(plan, locale)
  const board = renderBoardSvg(model, {
    maxPx: 1400,
    rowLabels: rowBandsMm(design),
    colLabels: colBandsMm(design),
  }).svg
  const title = designDisplayName(design, locale)

  return (
    <article>
      <Brand locale={locale} />

      <h1 className="text-2xl font-semibold" data-testid="print-title">{title}</h1>
      <p className="mt-1 text-sm text-neutral-500">{t(locale, 'app.tagline')}</p>

      {model.truncated ? (
        <p className="mt-3 text-sm font-medium text-[#b00020]">{t(locale, 'cut.truncated')}</p>
      ) : null}

      <div
        data-testid="print-preview"
        className="print-preview print-keep mt-5"
        dangerouslySetInnerHTML={{ __html: board }}
      />

      <Section title={t(locale, 'print.specs')} testId="print-specs">
        <KeyValues
          rows={[
            [t(locale, 'board.width'), bothUnits(model.widthMm, locale, 0)],
            [t(locale, 'board.length'), bothUnits(model.lengthMm, locale, 0)],
            [t(locale, 'board.thickness'), bothUnits(model.thicknessMm, locale, 0)],
            [t(locale, 'board.kerf'), bothUnits(design.kerfMm, locale, 1)],
            [t(locale, 'board.allowance'), bothUnits(design.planingAllowanceMm, locale, 1)],
            [t(locale, 'board.planerWidth'), bothUnits(design.planerWidthMm, locale, 0)],
            [t(locale, 'meter.glueUps'), String(calc.glueUpCount)],
            [t(locale, 'meter.cuts'), String(calc.cutCount)],
            [t(locale, 'meter.waste'), `${calc.wastePct.toFixed(1)} %`],
            [t(locale, 'meter.boardFeet'), `${calc.totalBoardFeet.toFixed(2)} ${t(locale, 'units.bf')}`],
            [t(locale, 'meter.cost'), usd.format(calc.totalCostUsd)],
            [t(locale, 'meter.weight'), `${calc.totalWeightKg.toFixed(2)} ${t(locale, 'units.kg')}`],
          ]}
        />
      </Section>

      <Section title={t(locale, 'meter.lumberBySpecies')} testId="print-species">
        <ul className="print-keep space-y-1 text-sm">
          {calc.bySpecies.map((need) => (
            <li key={need.speciesId} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block size-3 shrink-0 border border-neutral-400"
                style={{ background: speciesHex(need.speciesId) }}
              />
              {t(locale, 'meter.speciesRow', {
                name: speciesName(need.speciesId, locale),
                meters: need.linearMeters.toFixed(2),
                boardFeet: need.boardFeet.toFixed(2),
                costUsd: usd.format(need.costUsd),
              })}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t(locale, 'cut.title')} testId="print-cutmap" breakBefore>
        {plan.panels.map((panel) => (
          <div key={panel.panelId} className="print-panel mb-6">
            <h3 className="mb-2 text-base font-semibold">{t(locale, 'cut.panel', { panel: panel.panelId })}</h3>

            <div className="print-strip-row mb-2 flex h-10 w-full overflow-hidden border border-neutral-700">
              {panel.pieces.map((piece) => {
                const extent = piece.kind === 'strip' ? piece.widthMm : piece.thicknessMm
                const share = panel.widthMm > 0 ? (extent / panel.widthMm) * 100 : 0
                return (
                  <span
                    key={piece.elementIndex}
                    className="flex items-center justify-center border-r border-neutral-700 text-[10px] last:border-r-0"
                    style={{ width: `${share}%`, background: piece.kind === 'strip' ? speciesHex(piece.speciesId) : '#dddddd' }}
                  >
                    {share > 4 ? extent.toFixed(0) : ''}
                  </span>
                )
              })}
            </div>

            <ul className="space-y-0.5 text-sm">
              {panel.pieces.map((piece) => (
                <li key={piece.elementIndex}>
                  {piece.kind === 'strip'
                    ? t(locale, 'cut.strip', {
                        index: piece.elementIndex + 1,
                        species: speciesName(piece.speciesId, locale),
                        width: bothUnits(piece.widthMm, locale),
                      })
                    : t(locale, 'cut.sliceIn', {
                        source: piece.sourcePanelId,
                        thickness: bothUnits(piece.thicknessMm, locale),
                      })}
                </li>
              ))}
            </ul>

            <p className="mt-1 text-sm text-neutral-600">
              {t(locale, 'cut.panelSummary', {
                width: bothUnits(panel.widthMm, locale),
                length: bothUnits(panel.lengthMm, locale),
                thickness: bothUnits(panel.planedThicknessMm, locale),
              })}
            </p>

            <ul className="mt-1 space-y-0.5 text-sm">
              {panel.crosscuts.map((cut, index) => (
                <li key={`${panel.panelId}-cut-${index}`}>
                  {cut.rowNumber === null
                    ? t(locale, 'cut.crosscutInlay', {
                        index: index + 1,
                        thickness: bothUnits(cut.thicknessMm, locale),
                        panel: panel.panelId,
                      })
                    : t(locale, 'cut.crosscutRow', {
                        index: index + 1,
                        thickness: bothUnits(cut.thicknessMm, locale),
                        row: cut.rowNumber,
                      })}
                  {cut.angleDeg === 0
                    ? ''
                    : `, ${t(locale, 'cut.angleColumn', { angleDeg: cut.angleDeg })}, ${bothUnits(cut.lengthMm, locale)}`}
                </li>
              ))}
            </ul>

            {panel.angledWasteMm2 > 0 ? (
              <p className="mt-1 text-sm text-[#b00020]">
                {t(locale, 'cut.wasteAngled', { panel: panel.panelId, waste: areaMm2(panel.angledWasteMm2, locale) })}
              </p>
            ) : null}
          </div>
        ))}

        <p className="text-sm font-semibold">
          {t(locale, 'cut.totals', { strips: plan.stripCount, cuts: plan.crosscutCount, glueUps: calc.glueUpCount })}
        </p>
      </Section>

      <Section title={t(locale, 'steps.title')} testId="print-steps" breakBefore>
        <ol className="space-y-1 text-sm">
          {steps.map((step) => (
            <li key={step.number} className="print-keep">
              {step.number}. {t(locale, step.messageKey, step.params)}
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t(locale, 'rows.title')} testId="print-rows">
        <ul className="space-y-1 text-sm">
          {plan.rows.map((row) => (
            <li key={row.rowId} className="print-keep flex items-center gap-3">
              <span className="w-6 shrink-0 tabular-nums text-neutral-600">{row.number}</span>
              {/* Буква щита на полоске (мелочь 5, приёмка 15.08.2026): без неё
                  восемь одинаковых серых полосок несут ноль информации - непонятно,
                  в какую панель идёт ряд при сборке нескольких щитов. */}
              <span className="w-6 shrink-0 text-center text-xs font-semibold text-neutral-700">{row.panelId}</span>
              <span className="flex-1 border border-neutral-700 bg-neutral-100" style={{ height: `${Math.max(4, row.thicknessMm / 2)}px` }} />
              <span className="w-10 shrink-0 text-xs text-neutral-600">
                {`${row.flip ? 'F' : ''}${row.mirror ? 'M' : ''}`}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-neutral-500">
          {`${t(locale, 'steps.flipMark')}. ${t(locale, 'steps.mirrorMark')}.`}
        </p>
      </Section>

      <footer className="print-keep mt-10 border-t border-neutral-300 pt-3 text-xs text-neutral-500">
        <p>{t(locale, 'print.site')}</p>
        {pro ? null : <p data-testid="print-promo" className="mt-1">{t(locale, 'export.pdfPromo')}</p>}
      </footer>
    </article>
  )
}
