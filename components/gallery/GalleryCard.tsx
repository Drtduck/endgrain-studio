import Link from 'next/link'
import { Heart } from 'lucide-react'
import { AuthorLine } from '@/components/gallery/AuthorLine'
import { PriceBadge } from '@/components/gallery/PriceBadge'
import { type GalleryCard as GalleryCardData } from '@/lib/gallery/types'
import { speciesDisplayNames } from '@/lib/gallery/summary'
import { t, type Locale } from '@/lib/i18n'

/**
 * Карточка галереи: серверный компонент, но не SSR-рендерит полный SVG узора -
 * список галереи не несёт design вовсе (колонка закрыта column-grant'ом в
 * published_projects, см. миграцию 20260813100000: design платной работы не
 * должен утекать анониму просто через ленту). Карточке хватает summary:
 * габарит, породы и число ячеек. Полный превью-SVG показывается только на
 * странице проекта (/gallery/[id]) через getPublishedProjectDesign, с той же
 * проверкой price_cents = 0 / авторства / покупки, что и у самого design.
 */
export function GalleryCard({ locale, card }: { readonly locale: Locale; readonly card: GalleryCardData }) {
  const species = speciesDisplayNames(card.summary.species.slice(0, 3), locale)

  return (
    // div, а не Link: AuthorLine ниже несёт собственную ссылку на /u/[id], а
    // вложенные <a> внутри <a> - невалидный HTML с непредсказуемым кликом.
    // Переход на проект живёт на превью и заголовке отдельным Link.
    <div
      data-testid={`gallery-card-${card.id}`}
      className="group flex flex-col gap-2 overflow-hidden rounded-lg border border-line-subtle bg-surface-raised p-3 shadow-sm transition-[box-shadow,border-color] duration-hover hover:border-accent-border hover:shadow-md"
    >
      <Link href={`/gallery/${card.id}`} className="flex flex-col gap-2">
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-canvas p-3">
          <div className="flex flex-col items-center gap-1 text-center text-[11px] text-ink-secondary">
            <span className="font-mono">
              {card.summary.widthMm} x {card.summary.lengthMm} mm
            </span>
            {species.length > 0 ? <span>{species.join(', ')}</span> : null}
            <span>{t(locale, 'gallery.cellCount', { count: card.summary.cellCount })}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{card.title}</span>
          <PriceBadge locale={locale} priceCents={card.priceCents} />
        </div>
      </Link>

      {card.author ? <AuthorLine locale={locale} author={card.author} /> : null}

      <div className="flex items-center gap-1 text-[11px] text-ink-secondary">
        <Heart aria-hidden className="size-3.5 shrink-0" />
        <span data-testid={`gallery-card-${card.id}-likes`}>{card.likesCount}</span>
      </div>
    </div>
  )
}
