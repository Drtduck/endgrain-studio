import Link from 'next/link'
import { Heart } from 'lucide-react'
import { PriceBadge } from '@/components/gallery/PriceBadge'
import { compile } from '@/lib/engine'
import { renderBoardSvg } from '@/lib/export'
import { GALLERY_CELL_LIMIT, type GalleryCard as GalleryCardData } from '@/lib/gallery/types'
import { speciesDisplayNames } from '@/lib/gallery/summary'
import { t, type Locale } from '@/lib/i18n'

const CARD_PX = 320

/**
 * Карточка галереи: серверный компонент, SSR-превью через
 * renderBoardSvg(compile(design), { maxPx: 320 }) вставляется через
 * dangerouslySetInnerHTML. Дробные узоры выше GALLERY_CELL_LIMIT рисуют
 * упрощённый плейсхолдер с габаритом и породами вместо тысяч узлов SVG:
 * решение принимается по summary.cellCount, без похода в compile.
 */
export function GalleryCard({ locale, card }: { readonly locale: Locale; readonly card: GalleryCardData }) {
  const heavy = card.summary.cellCount > GALLERY_CELL_LIMIT
  const species = speciesDisplayNames(card.summary.species.slice(0, 3), locale)

  let previewSvg = ''
  if (!heavy) {
    try {
      previewSvg = renderBoardSvg(compile(card.design), { maxPx: CARD_PX }).svg
    } catch {
      previewSvg = ''
    }
  }

  return (
    <Link
      href={`/gallery/${card.id}`}
      data-testid={`gallery-card-${card.id}`}
      className="group flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-canvas p-3">
        {previewSvg !== '' ? (
          <div className="h-full w-full [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: previewSvg }} />
        ) : (
          <div className="flex flex-col items-center gap-1 text-center text-[11px] text-ink-secondary">
            <span className="font-mono">
              {card.summary.widthMm} x {card.summary.lengthMm} mm
            </span>
            {species.length > 0 ? <span>{species.join(', ')}</span> : null}
            <span>{t(locale, 'gallery.cellCount', { count: card.summary.cellCount })}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{card.title}</span>
        <PriceBadge locale={locale} priceCents={card.priceCents} />
      </div>

      <div className="flex items-center gap-1 text-[11px] text-ink-secondary">
        <Heart aria-hidden className="size-3.5 shrink-0" />
        <span data-testid={`gallery-card-${card.id}-likes`}>{card.likesCount}</span>
      </div>
    </Link>
  )
}
