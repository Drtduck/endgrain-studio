import type { Metadata } from 'next'
import Link from 'next/link'
import { GalleryGrid } from '@/components/gallery/GalleryGrid'
import { GalleryPager } from '@/components/gallery/GalleryPager'
import { parseGalleryParams } from '@/lib/gallery/query'
import { listGallery } from '@/lib/gallery/list'
import { GALLERY_SORTS } from '@/lib/gallery/types'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'

// Кэш на минуту: лайк и публикация зовут revalidatePath('/gallery') сами,
// а анонимный трафик не должен пересчитывать список на каждый заход.
export const revalidate = 60

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return { title: t(locale, 'gallery.navTitle'), description: t(locale, 'gallery.subtitle') }
}

export default async function GalleryPage(props: PageProps<'/gallery'>) {
  const locale = await getLandingLocale()
  const rawParams = await props.searchParams
  const { sort, page } = parseGalleryParams(rawParams)
  const result = await listGallery(sort, page)

  return (
    <main className="min-h-screen bg-app px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-col gap-1">
          <Link href="/" data-testid="gallery-back" className="text-[13px] text-accent hover:underline">
            {t(locale, 'app.title')}
          </Link>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{t(locale, 'gallery.title')}</h1>
          <p className="max-w-[60ch] text-ink-secondary">{t(locale, 'gallery.subtitle')}</p>
        </div>

        <div className="inline-flex w-fit rounded-md bg-surface-sunken p-0.5" role="group" aria-label={t(locale, 'gallery.sort')}>
          {GALLERY_SORTS.map((s) => (
            <Link
              key={s}
              href={`/gallery?sort=${s}`}
              data-testid={`gallery-sort-${s}`}
              className={
                s === sort
                  ? 'rounded-sm bg-surface-raised px-3 py-1.5 text-sm font-semibold shadow-sm'
                  : 'rounded-sm px-3 py-1.5 text-sm text-ink-secondary'
              }
            >
              {t(locale, s === 'new' ? 'gallery.sortNew' : 'gallery.sortPopular')}
            </Link>
          ))}
        </div>

        <GalleryGrid locale={locale} items={result.items} />

        <GalleryPager locale={locale} sort={sort} page={page} hasMore={result.hasMore} />
      </div>
    </main>
  )
}
