'use client'

import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'
import { perFrameCents, type AiPack } from '@/lib/ai/packs'
import { formatCents } from '@/lib/wallet/format'

/** Средний пакет из трёх - выгоднее самого маленького, но без порога сотни кадров. */
const POPULAR_INDEX = 1

export function PackCard({
  locale,
  pack,
  index,
  busy,
  disabled,
  onBuy,
}: {
  readonly locale: Locale
  readonly pack: AiPack
  readonly index: number
  readonly busy: boolean
  readonly disabled: boolean
  readonly onBuy: () => void
}) {
  const popular = index === POPULAR_INDEX
  return (
    <div
      data-testid={`credits-pack-${pack.id}`}
      className={`relative flex flex-col gap-2 rounded-lg border p-4 ${
        popular ? 'border-accent-border bg-accent-soft' : 'border-line-subtle bg-surface-raised'
      }`}
    >
      {popular ? (
        <span
          data-testid="credits-pack-popular"
          className="absolute -top-2.5 left-3 flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg"
        >
          <Sparkles aria-hidden className="size-3" />
          {t(locale, 'credits.popular')}
        </span>
      ) : null}

      <span className="font-display text-xl font-semibold text-ink">{t(locale, 'credits.pack', { frames: pack.frames })}</span>
      <span className="font-mono text-2xl font-semibold tabular-nums text-ink">{formatCents(pack.priceCents, locale)}</span>
      <span className="text-[12px] text-ink-secondary">{t(locale, 'credits.perFrame', { price: formatCents(perFrameCents(pack), locale) })}</span>

      <Button
        size="sm"
        className="mt-2"
        data-testid={`credits-buy-${pack.id}`}
        onClick={onBuy}
        disabled={disabled || busy}
      >
        {busy ? t(locale, 'credits.busy') : t(locale, 'credits.buy')}
      </Button>
    </div>
  )
}
