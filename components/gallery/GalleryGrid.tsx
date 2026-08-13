import { GalleryCard } from '@/components/gallery/GalleryCard'
import type { GalleryCard as GalleryCardData } from '@/lib/gallery/types'
import { t, type Locale } from '@/lib/i18n'

export function GalleryGrid({ locale, items }: { readonly locale: Locale; readonly items: readonly GalleryCardData[] }) {
  if (items.length === 0) {
    return (
      <p data-testid="gallery-empty" className="text-sm text-ink-secondary">
        {t(locale, 'gallery.empty')}
      </p>
    )
  }

  return (
    <div data-testid="gallery-grid" className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
      {items.map((card) => (
        <GalleryCard key={card.id} locale={locale} card={card} />
      ))}
    </div>
  )
}
