'use client'

import { useId, useState } from 'react'
import { Check, Shirt } from 'lucide-react'
import { createMerchMockupsAction } from '@/app/actions/promo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AiGateNote, useAiGate } from '@/components/promo/AiGate'
import { PatternCells } from '@/components/promo/PatternCells'
import { boardPngDataUrl } from '@/components/promo/boardPng'
import type { BoardModel } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { fitPatternCover } from '@/lib/promo/fit'
import { MERCH_SILHOUETTE_BY_ID, type MerchSilhouette } from '@/lib/promo/merch'
import { MAX_PNG_CHARS } from '@/lib/promo/schema'
import {
  MERCH_DEFAULT_PRODUCTS,
  MERCH_PRODUCTS,
  type MerchProduct,
  type MerchProductId,
  type MerchResult,
} from '@/lib/promo/types'
import { useDerived } from '@/lib/store/derived'
import { useStudio } from '@/lib/store/studio'

const PRINTFUL_GENERATOR_URL = 'https://www.printful.com/dashboard/generator'

/** Локальный мокап: силуэт товара, узор доски в области печати, обрезка по clipPath. */
function LocalMockup({ silhouette, model, label }: { silhouette: MerchSilhouette; model: BoardModel; label: string }) {
  const id = useId()
  const clip = `merch-clip-${id}`
  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={label} className="h-auto w-full">
      <defs>
        <clipPath id={clip}>
          <rect
            x={silhouette.print.x}
            y={silhouette.print.y}
            width={silhouette.print.w}
            height={silhouette.print.h}
            rx={silhouette.printRadius}
          />
        </clipPath>
      </defs>
      <path d={silhouette.body} fill={silhouette.fill} stroke="var(--color-line)" strokeWidth={1.4} />
      <g clipPath={`url(#${clip})`}>
        <PatternCells model={model} fit={fitPatternCover(model.widthMm, model.lengthMm, silhouette.print)} />
      </g>
      {silhouette.strokes.map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--color-line)" strokeWidth={1.4} />
      ))}
    </svg>
  )
}

export function MerchMockups() {
  const locale = useStudio((s) => s.locale)
  const { model } = useDerived()
  const [busy, setBusy] = useState(false)
  // null - не спрашивали, поэтому про недостающий ключ ещё ничего не известно.
  const [result, setResult] = useState<MerchResult | null>(null)
  const [failed, setFailed] = useState(false)
  // Какие товары отправлять в Printful. По умолчанию два: их генератор мокапов
  // пускает пару create-task в минуту, и «все четыре разом» упрётся в его 429.
  const [selected, setSelected] = useState<readonly MerchProductId[]>(MERCH_DEFAULT_PRODUCTS)
  // Мокапы входят в Pro, поэтому кнопка живёт по тому же гейту, что и серия фото.
  const gate = useAiGate()

  const toggle = (id: MerchProductId): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  const printful = result === null || result.denied !== undefined ? null : result.printful
  const mockupById = new Map<MerchProductId, string>((result?.mockups ?? []).map((m) => [m.id, m.url]))

  const run = async (): Promise<void> => {
    setBusy(true)
    setFailed(false)
    setResult(null)
    try {
      // Настоящий мокап Printful рисует по нашему макету, а макет это тот же
      // рендер доски, что уходит в серию фото: собираем его здесь и отправляем.
      const boardPng = await boardPngDataUrl(model)
      if (boardPng.length > MAX_PNG_CHARS) {
        setResult({ printful: true, error: 'invalid' })
        return
      }
      setResult(await createMerchMockupsAction({ boardPng, products: selected }))
    } catch (err) {
      console.error(err)
      setResult(null)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  // Подпись под галереей. Порядок веток важен: сперва то, что человек только что
  // получил, потом состояние ключей, и лишь в конце приглашение нажать кнопку.
  const noteKey =
    result === null
      ? 'merch.idle'
      : result.denied !== undefined
        ? 'merch.idle'
        : !result.printful
          ? 'merch.needKey'
          : result.mockups !== undefined && result.mockups.length > 0
            ? 'merch.printfulReady'
            : 'merch.localNote'

  return (
    <section
      data-testid="promo-merch"
      aria-label={t(locale, 'merch.title')}
      className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">{t(locale, 'merch.title')}</h2>
        <div className="flex-1" />
        {printful === true ? (
          <Button
            size="sm"
            variant="outline"
            data-testid="merch-printful"
            render={<a href={PRINTFUL_GENERATOR_URL} target="_blank" rel="noopener noreferrer" />}
          >
            {t(locale, 'merch.openPrintful')}
          </Button>
        ) : null}
        <Button
          size="sm"
          data-testid="merch-generate"
          disabled={busy || gate.locked || selected.length === 0}
          onClick={() => { void run() }}
        >
          <Shirt data-icon="inline-start" />
          {busy ? t(locale, 'merch.busy') : t(locale, 'merch.generate')}
        </Button>
      </div>

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'merch.subtitle')}</p>

      <fieldset className="flex flex-col gap-2" data-testid="merch-picks">
        <legend className="mb-1 text-[13px] font-semibold">{t(locale, 'merch.products')}</legend>
        <div className="flex flex-wrap gap-2">
          {MERCH_PRODUCTS.map((product: MerchProduct) => {
            const on = selected.includes(product.id)
            return (
              <button
                key={product.id}
                type="button"
                data-testid={`merch-pick-${product.id}`}
                aria-pressed={on}
                onClick={() => { toggle(product.id) }}
                className={
                  on
                    ? 'flex items-center gap-1.5 rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-[13px] font-semibold text-accent'
                    : 'flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface-raised px-3 py-1.5 text-[13px] text-ink-secondary hover:border-line'
                }
              >
                {on ? <Check aria-hidden className="size-3.5 shrink-0" /> : null}
                {t(locale, product.titleKey)}
              </button>
            )
          })}
        </div>
        <p data-testid="merch-picks-note" className="text-[13px] text-ink-secondary">
          {t(locale, selected.length === 0 ? 'merch.pickAtLeastOne' : 'merch.picksNote')}
        </p>
      </fieldset>

      {/* Остаток квоты здесь не показываем: мокапы её не тратят, только замок с причиной. */}
      {gate.locked ? <AiGateNote gate={gate} locale={locale} testId="merch-gate" /> : null}

      {failed || (result?.error !== undefined && result.error !== 'notConfigured') ? (
        <p
          data-testid="merch-error"
          role="alert"
          className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
        >
          {t(locale, failed || result?.error === undefined ? 'merch.error' : `merch.err.${result.error}`)}
        </p>
      ) : null}

      <ul data-testid="merch-gallery" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {MERCH_PRODUCTS.map((product: MerchProduct) => {
          const silhouette = MERCH_SILHOUETTE_BY_ID.get(product.id)
          const label = t(locale, product.titleKey)
          const url = mockupById.get(product.id)
          return (
            <li
              key={product.id}
              data-testid={`merch-item-${product.id}`}
              className="flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised p-3 shadow-sm"
            >
              <div className="relative rounded-md bg-canvas p-2">
                {url === undefined ? (
                  silhouette === undefined ? null : <LocalMockup silhouette={silhouette} model={model} label={label} />
                ) : (
                  <img src={url} alt={label} className="block h-auto w-full rounded-sm" />
                )}
                {url === undefined ? (
                  <Badge className="absolute top-1 right-1 bg-surface/90">{t(locale, 'merch.localBadge')}</Badge>
                ) : null}
              </div>
              <span className="text-sm font-semibold">{label}</span>
              {url === undefined ? null : (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`merch-link-${product.id}`}
                  className="w-fit text-xs font-semibold text-accent underline-offset-4 hover:underline"
                >
                  {t(locale, 'merch.openMockup')}
                </a>
              )}
            </li>
          )
        })}
      </ul>

      <p data-testid="merch-note" className="text-xs text-ink-muted">
        {t(locale, noteKey)}
      </p>
    </section>
  )
}
