'use client'

import { useId, useState } from 'react'
import { Shirt } from 'lucide-react'
import { createMerchMockupsAction } from '@/app/actions/promo'
import { Button } from '@/components/ui/button'
import { PatternCells } from '@/components/promo/PatternCells'
import type { BoardModel } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { fitPatternCover } from '@/lib/promo/fit'
import { MERCH_SILHOUETTE_BY_ID, type MerchSilhouette } from '@/lib/promo/merch'
import { MERCH_PRODUCTS, type MerchProduct } from '@/lib/promo/types'
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
  const [printful, setPrintful] = useState<boolean | null>(null)
  const [failed, setFailed] = useState(false)

  const run = async (): Promise<void> => {
    setBusy(true)
    setFailed(false)
    try {
      // Мокапы уже нарисованы локально: у сервера спрашиваем ровно одно, есть ли ключ Printful.
      setPrintful((await createMerchMockupsAction()).printful)
    } catch (err) {
      console.error(err)
      setPrintful(null)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

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
        <Button size="sm" data-testid="merch-generate" disabled={busy} onClick={() => { void run() }}>
          <Shirt data-icon="inline-start" />
          {busy ? t(locale, 'merch.busy') : t(locale, 'merch.generate')}
        </Button>
      </div>

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'merch.subtitle')}</p>

      {failed ? (
        <p
          data-testid="merch-error"
          role="alert"
          className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
        >
          {t(locale, 'merch.error')}
        </p>
      ) : null}

      <ul data-testid="merch-gallery" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(180px,1fr))]">
        {MERCH_PRODUCTS.map((product: MerchProduct) => {
          const silhouette = MERCH_SILHOUETTE_BY_ID.get(product.id)
          const label = t(locale, product.titleKey)
          return (
            <li
              key={product.id}
              data-testid={`merch-item-${product.id}`}
              className="flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised p-3 shadow-sm"
            >
              <div className="rounded-md bg-canvas p-2">
                {silhouette === undefined ? null : <LocalMockup silhouette={silhouette} model={model} label={label} />}
              </div>
              <span className="text-sm font-semibold">{label}</span>
            </li>
          )
        })}
      </ul>

      <p data-testid="merch-note" className="text-xs text-ink-muted">
        {t(locale, printful === null ? 'merch.idle' : printful ? 'merch.localNote' : 'merch.needKey')}
      </p>
    </section>
  )
}
