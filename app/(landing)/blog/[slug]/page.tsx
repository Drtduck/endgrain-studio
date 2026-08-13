import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PostHeader } from '@/components/blog/PostHeader'
import { JsonLd } from '@/components/seo/JsonLd'
import { allPosts, postBySlug } from '@/lib/blog/posts'
import { t } from '@/lib/i18n'
import { getLandingLocale } from '@/lib/landing/locale'
import { postJsonLd } from '@/lib/seo/jsonld'
import { pageMetadata, siteUrl } from '@/lib/seo/metadata'

export function generateStaticParams(): Array<{ slug: string }> {
  return allPosts().map((post) => ({ slug: post.slug }))
}

// Несуществующий slug отдаёт 404 вместо динамического рендера: список статей
// известен на билде целиком, рендерить что-то за его пределами незачем.
export const dynamicParams = false

// openGraph.locale берётся из meta.lang, а не из cookie eg-locale: текст статьи
// не меняется в зависимости от читателя (пункт 2 спеки), поэтому и метаданные
// вкладки следуют языку статьи, а не общей локали интерфейса.
export async function generateMetadata(props: PageProps<'/blog/[slug]'>): Promise<Metadata> {
  const { slug } = await props.params
  const post = postBySlug(slug)
  if (!post) return {}
  return pageMetadata({
    title: post.title,
    description: post.description,
    canonical: siteUrl(`/blog/${post.slug}`),
    locale: post.lang,
    type: 'article',
    image: siteUrl(post.cover),
    alternates: { types: { 'application/rss+xml': siteUrl('/blog/rss.xml') } },
  })
}

export default async function BlogPostPage(props: PageProps<'/blog/[slug]'>) {
  const { slug } = await props.params
  const post = postBySlug(slug)
  if (!post) notFound()

  const locale = await getLandingLocale()
  const { default: PostBody } = await import(`@/content/blog/${slug}.mdx`)

  return (
    <main className="flex flex-col gap-8 px-6 py-12">
      <JsonLd data={postJsonLd(post)} />
      <nav aria-label="breadcrumb" className="mx-auto w-full max-w-2xl font-sans text-xs text-ink-muted">
        <ol className="flex flex-wrap items-center gap-1">
          <li>
            <Link href="/" className="hover:text-ink">
              {t(locale, 'blog.breadcrumb.home')}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/blog" className="hover:text-ink">
              {t(locale, 'blog.breadcrumb.blog')}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li className="text-ink" aria-current="page">
            {post.title}
          </li>
        </ol>
      </nav>

      {/* lang явно на <article>: <html lang> определяется кукой и может не совпадать с языком статьи. */}
      <article lang={post.lang} className="mx-auto w-full max-w-2xl">
        <PostHeader post={post} locale={locale} />
        <PostBody />
      </article>
    </main>
  )
}
