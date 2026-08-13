import type { Metadata } from 'next'
import Link from 'next/link'
import { PostCard } from '@/components/blog/PostCard'
import { postsByTag } from '@/lib/blog/posts'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { pageMetadata, siteUrl } from '@/lib/seo/metadata'

// Перетасовка тех же статей по тегу, в индексе ей делать нечего: полезна
// читателю, но это не отдельный контент.
export async function generateMetadata(props: PageProps<'/blog/tag/[tag]'>): Promise<Metadata> {
  const { tag } = await props.params
  const decoded = decodeURIComponent(tag)
  const locale = await getLandingLocale()
  return pageMetadata({
    title: t(locale, 'blog.tag.title', { tag: decoded }),
    description: t(locale, 'blog.tag.description', { tag: decoded }),
    canonical: siteUrl(`/blog/tag/${tag}`),
    locale,
    noIndex: true,
  })
}

export default async function BlogTagPage(props: PageProps<'/blog/tag/[tag]'>) {
  const { tag } = await props.params
  const decoded = decodeURIComponent(tag)
  const locale = await getLandingLocale()
  const posts = postsByTag(decoded)

  return (
    <main className="flex flex-col gap-8 px-6 py-12" data-testid="blog-tag-feed">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          {t(locale, 'blog.tag.title', { tag: decoded })}
        </h1>
        <Link href="/blog" className="font-sans text-sm text-accent hover:text-accent-hover">
          {t(locale, 'blog.tag.back')}
        </Link>
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-4">
        {posts.length === 0 ? (
          <p className="font-sans text-sm text-ink-secondary">{t(locale, 'blog.tag.empty')}</p>
        ) : (
          posts.map((post) => <PostCard key={post.slug} post={post} locale={locale} />)
        )}
      </div>
    </main>
  )
}
