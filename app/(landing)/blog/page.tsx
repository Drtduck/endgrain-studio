import type { Metadata } from 'next'
import { PostCard } from '@/components/blog/PostCard'
import { JsonLd } from '@/components/seo/JsonLd'
import { allPosts } from '@/lib/blog/posts'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { blogJsonLd } from '@/lib/seo/jsonld'
import { pageMetadata, siteUrl } from '@/lib/seo/metadata'

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLandingLocale()
  return pageMetadata({
    title: t(locale, 'blog.feed.title'),
    description: t(locale, 'blog.feed.description'),
    canonical: siteUrl('/blog'),
    locale,
    alternates: { types: { 'application/rss+xml': siteUrl('/blog/rss.xml') } },
  })
}

export default async function BlogFeedPage() {
  const locale = await getLandingLocale()
  const posts = allPosts()

  return (
    <main className="flex flex-col gap-8 px-6 py-12" data-testid="blog-feed">
      <JsonLd data={blogJsonLd(posts)} />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{t(locale, 'blog.feed.title')}</h1>
        <p className="font-sans text-base text-ink-secondary">{t(locale, 'blog.feed.description')}</p>
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-4">
        {posts.map((post) => (
          <PostCard key={post.slug} post={post} locale={locale} />
        ))}
      </div>
    </main>
  )
}
