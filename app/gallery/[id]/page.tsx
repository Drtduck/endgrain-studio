import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CopyToMyProjects } from '@/components/gallery/CopyToMyProjects'
import { LikeButton } from '@/components/gallery/LikeButton'
import { PriceBadge } from '@/components/gallery/PriceBadge'
import { Button } from '@/components/ui/button'
import { compile } from '@/lib/engine'
import { renderBoardSvg } from '@/lib/export'
import { getPublishedProject, getPublishedProjectDesign, hasLiked } from '@/lib/gallery/list'
import { parseSummary, speciesDisplayNames } from '@/lib/gallery/summary'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { getCurrentUser } from '@/lib/supabase/session'

const PROJECT_PX = 720

export async function generateMetadata(props: PageProps<'/gallery/[id]'>): Promise<Metadata> {
  const { id } = await props.params
  const row = await getPublishedProject(id)
  return { title: row?.title ?? 'Endgrain App' }
}

export default async function GalleryProjectPage(props: PageProps<'/gallery/[id]'>) {
  const { id } = await props.params
  const [locale, row, user] = await Promise.all([getLandingLocale(), getPublishedProject(id), getCurrentUser()])

  if (row === null || row.status === 'removed') notFound()

  const summary = parseSummary(row.summary)
  // Полный design - только отсюда: getPublishedProjectDesign зовёт security
  // definer функцию published_project_design, которая сама возвращает null для
  // платной работы без покупки. Анониму и не купившему design никогда не
  // достаётся, значит и превью для них честно пустое - ровно как раньше вело
  // себя состояние «без Supabase».
  const design = await getPublishedProjectDesign(row.id)
  let previewSvg = ''
  if (design !== null) {
    try {
      previewSvg = renderBoardSvg(compile(design), { maxPx: PROJECT_PX }).svg
    } catch {
      previewSvg = ''
    }
  }
  const species = summary === null ? [] : speciesDisplayNames(summary.species, locale)
  const liked = user === null ? false : await hasLiked(user.id, row.id)

  return (
    <div className="min-h-screen bg-app">
      <main className="px-4 py-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-6">
          <Link href="/gallery" data-testid="gallery-project-back" className="text-[13px] text-accent hover:underline">
            {t(locale, 'gallery.title')}
          </Link>

          <div className="flex flex-col gap-6 md:flex-row">
            <div className="flex flex-1 items-center justify-center rounded-lg bg-canvas p-6">
              {previewSvg !== '' ? (
                <div
                  data-testid="gallery-project-preview"
                  className="w-full [&_svg]:h-auto [&_svg]:w-full"
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              ) : null}
            </div>

            <div className="flex w-full flex-col gap-4 md:w-72">
              <div>
                <h1 className="font-display text-2xl font-semibold" data-testid="gallery-project-title">
                  {row.title}
                </h1>
                {summary !== null ? (
                  <p className="font-mono text-[13px] text-ink-secondary">
                    {summary.widthMm} x {summary.lengthMm} x {summary.thicknessMm} mm
                  </p>
                ) : null}
                {species.length > 0 ? <p className="text-[13px] text-ink-secondary">{species.join(', ')}</p> : null}
              </div>

              <PriceBadge locale={locale} priceCents={row.price_cents} />

              <div className="flex flex-wrap items-center gap-2">
                <LikeButton locale={locale} publishedId={row.id} initialLiked={liked} initialCount={row.likes_count} />
              </div>

              {row.price_cents === 0 ? (
                <CopyToMyProjects locale={locale} publishedId={row.id} />
              ) : (
                <Button size="sm" disabled data-testid="gallery-purchase-soon">
                  {t(locale, 'gallery.purchaseSoon')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
