import type { Metadata } from 'next'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { GalleryGrid } from '@/components/gallery/GalleryGrid'
import { GalleryPager } from '@/components/gallery/GalleryPager'
import { parseGalleryParams } from '@/lib/gallery/query'
import { listGallery } from '@/lib/gallery/list'
import { GALLERY_SORTS } from '@/lib/gallery/types'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { appUrl, pageMetadata } from '@/lib/seo/metadata'
import { cn } from '@/lib/utils'

// Кэш на минуту: лайк и публикация зовут revalidatePath('/gallery') сами,
// а анонимный трафик не должен пересчитывать список на каждый заход.
export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  // Страница в sitemap.ts, но раньше не отдавала canonical/OG/twitter -
  // единственная публичная страница без них.
  return pageMetadata({
    title: t(locale, 'gallery.navTitle'),
    description: t(locale, 'gallery.subtitle'),
    canonical: appUrl('/gallery'),
    locale,
    // Явная картинка: openGraph-объект с явными полями подавляет автоподхват
    // файловой конвенции opengraph-image, без image OG-карточка была бы пустой.
    image: appUrl('/opengraph-image.png'),
  })
}

export default async function GalleryPage(props: PageProps<'/gallery'>) {
  const locale = await getLandingLocale()
  const rawParams = await props.searchParams
  const { sort, page } = parseGalleryParams(rawParams)
  const result = await listGallery(sort, page)

  return (
    <div className="min-h-screen bg-app">
      <AppHeader />
      <main className="px-4 py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{t(locale, 'gallery.title')}</h1>
            <p className="max-w-[60ch] text-ink-secondary">{t(locale, 'gallery.subtitle')}</p>
          </div>

          <div className="inline-flex w-fit rounded-md bg-surface-sunken p-0.5" role="group" aria-label={t(locale, 'gallery.sort')}>
            {GALLERY_SORTS.map((s) => (
              <Link
                key={s}
                href={`/gallery?sort=${s}`}
                data-testid={`gallery-sort-${s}`}
                className={cn(
                  'rounded-sm px-3 py-1.5 text-sm font-semibold transition-colors duration-hover',
                  s === sort ? 'bg-surface-raised shadow-sm' : 'text-ink-secondary',
                )}
              >
                {t(locale, s === 'new' ? 'gallery.sortNew' : 'gallery.sortPopular')}
              </Link>
            ))}
          </div>

          <GalleryGrid locale={locale} items={result.items} />

          <GalleryPager locale={locale} sort={sort} page={page} hasMore={result.hasMore} />
        </div>
      </main>
    </div>
  )
}
