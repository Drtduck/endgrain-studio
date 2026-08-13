import Link from 'next/link'
import type { PostMeta } from '@/lib/blog/types'
import { t, type Locale } from '@/lib/i18n'

/**
 * Карточка статьи в ленте /blog. У статьи на «чужом» языке (meta.lang не совпадает
 * с текущей локалью интерфейса) стоит бейдж языка - блог показывает все статьи
 * сразу, язык это свойство статьи, а не читателя (пункт 2 спеки).
 */
export function PostCard({ post, locale }: { post: PostMeta; locale: Locale }) {
  const isForeignLanguage = post.lang !== locale

  return (
    <article
      data-testid="blog-post-card"
      data-slug={post.slug}
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex items-center gap-2 font-sans text-xs text-ink-muted">
        <time dateTime={post.date}>{post.date}</time>
        {isForeignLanguage ? (
          <span className="rounded-full border border-line px-2 py-0.5" data-testid="blog-post-card-lang-badge">
            {t(locale, 'blog.post.foreignLanguage')}
          </span>
        ) : null}
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
        <Link href={`/blog/${post.slug}`} className="hover:text-accent">
          {post.title}
        </Link>
      </h2>
      <p className="font-sans text-sm text-ink-secondary">{post.description}</p>
      <Link href={`/blog/${post.slug}`} className="font-sans text-sm font-medium text-accent hover:text-accent-hover">
        {t(locale, 'blog.feed.readMore')}
      </Link>
    </article>
  )
}
