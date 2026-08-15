'use client'

import { useId, useState, useTransition } from 'react'
import { Check, Shirt } from 'lucide-react'
import { createMerchCheckoutAction, type MerchCheckoutError } from '@/app/actions/merch'
import { createMerchMockupsAction } from '@/app/actions/promo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { AiGateNote, denialGate, useAiGate } from '@/components/promo/AiGate'
import { PatternCells } from '@/components/promo/PatternCells'
import { boardPngDataUrl } from '@/components/promo/boardPng'
import { usePro } from '@/components/ProProvider'
import type { BoardModel } from '@/lib/engine'
import { t, type MessageKey } from '@/lib/i18n'
import { MERCH_SIZES_BY_PRODUCT, type MerchSize } from '@/lib/merch/catalog'
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
import { selectDesign, useStudio } from '@/lib/store/studio'

/** Тексты ошибок покупки по коду server action (§4.1, §9.4 спеки). */
const MERCH_CHECKOUT_ERROR_KEYS: Readonly<Record<MerchCheckoutError, MessageKey>> = {
  invalid: 'merch.buy.err.invalid',
  disabled: 'merch.buy.err.disabled',
  unauthenticated: 'merch.buy.needAuth',
  render: 'merch.buy.err.render',
  storage: 'merch.buy.err.storage',
  failed: 'merch.buy.err.failed',
}

/**
 * Размерная сетка Bella+Canvas 3001 (ширина груди, см), для перепечатки
 * текстом прямо в модалке (§9.3 спеки: свою витрину размеров заводить не надо).
 */
const TSHIRT_SIZE_CHART: readonly { size: MerchSize; chestCm: string }[] = [
  { size: 's', chestCm: '86-91' },
  { size: 'm', chestCm: '97-102' },
  { size: 'l', chestCm: '107-112' },
  { size: 'xl', chestCm: '117-122' },
]

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

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
  // Мокапы входят в Pro, но, в отличие от серии фото, в пробный тир не входят
  // (merchMockups нет в AI_TRIAL_FEATURES): в trial-состоянии кнопка обязана
  // быть запертой заранее, а не тихо отваливаться после клика.
  const gate = useAiGate(null, 'merchMockups')

  // Покупка (§4, §9 спеки merch-orders.md): своё состояние, не зависящее от гейта
  // мокапов выше - кнопка «Купить» видна и работает без Pro и без сборки мокапов.
  const { merch } = usePro()
  const design = useStudio(selectDesign)
  const currentProjectId = useStudio((s) => s.currentProjectId)
  const [sizeModalProduct, setSizeModalProduct] = useState<MerchProductId | null>(null)
  const [selectedSize, setSelectedSize] = useState<MerchSize>('m')
  const [buyingProduct, setBuyingProduct] = useState<MerchProductId | null>(null)
  const [buyError, setBuyError] = useState<MerchCheckoutError | null>(null)
  const [, startBuyTransition] = useTransition()

  const toggle = (id: MerchProductId): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]))
  }

  // window.location.href - внешний домен Stripe, не router.push. Обёрнуто в
  // startTransition по тому же образцу, что и остальные кассы проекта
  // (WalletPanel, CreditsPanel, PurchaseButton): без неё react-hooks/immutability
  // считает прямое присвоение location.href мутацией вне эффекта.
  const startCheckout = (productId: MerchProductId, size: MerchSize): void => {
    setBuyError(null)
    setBuyingProduct(productId)
    startBuyTransition(async () => {
      try {
        const res = await createMerchCheckoutAction({ product: productId, size, projectId: currentProjectId, design })
        if (res.ok) {
          window.location.href = res.url
          return
        }
        // Модалка размера закрывается: иначе текст ошибки под галереей человек
        // не увидит - он перекрыт бэкдропом диалога.
        setSizeModalProduct(null)
        setBuyError(res.error)
        setBuyingProduct(null)
      } catch (err) {
        console.error(err)
        setSizeModalProduct(null)
        setBuyError('failed')
        setBuyingProduct(null)
      }
    })
  }

  const onBuyClick = (productId: MerchProductId): void => {
    setBuyError(null)
    if (productId === 'tshirt') {
      setSelectedSize('m')
      setSizeModalProduct('tshirt')
      return
    }
    startCheckout(productId, 'one')
  }

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

      {/*
       * Отказ сервера (denied) - отдельная ветка от gate.locked: гейт выше судит
       * по состоянию на момент рендера, а denied это то, что реально ответил
       * сервер на конкретный клик. Раньше при denied панель молча показывала
       * merch.idle, будто ничего не произошло - человек жал кнопку и не видел
       * ни слова о причине.
       */}
      {result?.denied !== undefined ? (
        <AiGateNote gate={denialGate(result.denied, gate.access)} locale={locale} testId="merch-gate-note" />
      ) : null}

      {failed || result?.error !== undefined ? (
        <p
          data-testid="merch-error"
          role="alert"
          className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
        >
          {t(locale, failed || result?.error === undefined ? 'merch.error' : `merch.err.${result.error}`)}
        </p>
      ) : null}

      {/* Технический текст с именем переменной виден только в dev: обычный человек её не заводит. */}
      {process.env.NODE_ENV === 'development' && result?.error === 'notConfigured' ? (
        <p data-testid="merch-error-dev" className="text-xs text-ink-muted">
          {t(locale, 'merch.err.notConfiguredDev')}
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

              {/*
               * Кнопка «Купить» видна всем, без Pro-гейта и до сборки мокапов
               * (§9.2 спеки merch-orders.md): она не зависит ни от gate, ни от
               * result выше. Цена приезжает уже посчитанной с сервера через
               * usePro(): формула серверная, клиент её не пересчитывает.
               */}
              {merch.enabled ? (
                <div className="mt-1 flex flex-col gap-1.5 border-t border-line-subtle pt-2" data-testid={`merch-buy-${product.id}`}>
                  <span className="text-sm font-semibold text-ink" data-testid={`merch-price-${product.id}`}>
                    {formatUsd(merch.prices[product.id])} · {t(locale, 'merch.shipIncluded')}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid={`merch-buy-button-${product.id}`}
                    disabled={buyingProduct !== null}
                    onClick={() => { onBuyClick(product.id) }}
                  >
                    {buyingProduct === product.id ? t(locale, 'merch.buyBusy') : t(locale, 'merch.buy')}
                  </Button>
                  <p className="text-[11px] text-ink-muted">{t(locale, 'merch.shipCountries')}</p>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      <p data-testid="merch-note" className="text-xs text-ink-muted">
        {t(locale, noteKey)}
      </p>

      {buyError !== null ? (
        <p
          data-testid="merch-buy-error"
          role="alert"
          className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text"
        >
          {t(locale, MERCH_CHECKOUT_ERROR_KEYS[buyError])}
        </p>
      ) : null}

      {/* Модалка размера - только для футболки (§9.3 спеки): у остальных товаров
          клик по «Купить» ведёт сразу в Checkout. */}
      <Dialog
        open={sizeModalProduct !== null}
        onOpenChange={(open) => {
          if (!open) setSizeModalProduct(null)
        }}
      >
        <DialogContent data-testid="merch-size-dialog" backdropTestId="merch-size-backdrop" className="w-[min(420px,92vw)] gap-4">
          <DialogTitle>{t(locale, 'merch.sizeTitle')}</DialogTitle>
          <DialogDescription>
            {sizeModalProduct === null ? null : formatUsd(merch.prices[sizeModalProduct])}
          </DialogDescription>

          <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, 'merch.sizeTitle')}>
            {MERCH_SIZES_BY_PRODUCT.tshirt.map((size) => (
              <button
                key={size}
                type="button"
                data-testid={`merch-size-${size}`}
                aria-pressed={selectedSize === size}
                onClick={() => { setSelectedSize(size) }}
                className={
                  selectedSize === size
                    ? 'flex items-center gap-1.5 rounded-full border border-accent bg-accent/10 px-3 py-1.5 text-[13px] font-semibold text-accent'
                    : 'flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface px-3 py-1.5 text-[13px] text-ink-secondary hover:border-line'
                }
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>

          <div data-testid="merch-size-chart" className="flex flex-col gap-1 text-[13px] text-ink-secondary">
            <span className="font-semibold text-ink">{t(locale, 'merch.sizeChart')}</span>
            {TSHIRT_SIZE_CHART.map((row) => (
              <span key={row.size}>
                {row.size.toUpperCase()}: {t(locale, 'merch.sizeChart.cm', { cm: row.chestCm })}
              </span>
            ))}
          </div>

          <Button
            data-testid="merch-size-checkout"
            disabled={sizeModalProduct !== null && buyingProduct === sizeModalProduct}
            onClick={() => {
              if (sizeModalProduct === null) return
              startCheckout(sizeModalProduct, selectedSize)
            }}
          >
            {sizeModalProduct !== null && buyingProduct === sizeModalProduct ? t(locale, 'merch.buyBusy') : t(locale, 'merch.toCheckout')}
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  )
}
