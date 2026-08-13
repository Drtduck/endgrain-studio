import Link from 'next/link'
import { GALLERY_MAX_PAGE } from '@/lib/gallery/types'
import { t, type Locale } from '@/lib/i18n'

/** Ссылки обычные <Link>: галерея обязана работать и индексироваться без JavaScript. */
export function GalleryPager({
  locale,
  sort,
  page,
  hasMore,
}: {
  readonly locale: Locale
  readonly sort: string
  readonly page: number
  readonly hasMore: boolean
}) {
  if (page <= 1 && !hasMore) return null

  return (
    <nav data-testid="gallery-pager" aria-label={t(locale, 'gallery.pager')} className="flex items-center justify-center gap-3">
      {page > 1 ? (
        <Link href={`/gallery?sort=${sort}&page=${page - 1}`} data-testid="gallery-prev" className="text-sm font-semibold text-accent underline-offset-4 hover:underline">
          {t(locale, 'gallery.prevPage')}
        </Link>
      ) : (
        <span className="text-sm text-ink-muted">{t(locale, 'gallery.prevPage')}</span>
      )}
      <span className="font-mono text-xs text-ink-muted">{page}</span>
      {hasMore && page < GALLERY_MAX_PAGE ? (
        <Link href={`/gallery?sort=${sort}&page=${page + 1}`} data-testid="gallery-next" className="text-sm font-semibold text-accent underline-offset-4 hover:underline">
          {t(locale, 'gallery.nextPage')}
        </Link>
      ) : (
        <span className="text-sm text-ink-muted">{t(locale, 'gallery.nextPage')}</span>
      )}
    </nav>
  )
}
