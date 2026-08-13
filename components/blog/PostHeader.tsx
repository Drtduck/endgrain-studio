import type { PostMeta } from '@/lib/blog/types'
import { t, type Locale } from '@/lib/i18n'
import { TagList } from './TagList'

/**
 * Заголовок статьи: H1, даты публикации/обновления, время чтения и теги. Даты
 * печатаются на странице, а не только в JSON-LD - свежесть это один из немногих
 * сигналов, по которым ИИ-ассистент выбирает между двумя источниками (пункт 9 спеки).
 */
export function PostHeader({ post, locale }: { post: PostMeta; locale: Locale }) {
  return (
    <header className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{post.title}</h1>
      <div className="flex flex-wrap items-center gap-3 font-sans text-sm text-ink-muted">
        <time dateTime={post.date}>{t(locale, 'blog.post.published', { date: post.date })}</time>
        {/* Дата обновления печатается на странице всегда, не только когда отличается от даты
            публикации: свежесть - один из немногих сигналов, по которым ИИ-ассистент выбирает
            между двумя источниками (пункт 9 спеки), и это должно быть видно сразу. */}
        <span aria-hidden="true">·</span>
        <time dateTime={post.updated} data-testid="blog-post-updated">
          {t(locale, 'blog.post.updated', { date: post.updated })}
        </time>
        <span aria-hidden="true">·</span>
        <span>{t(locale, 'blog.post.readingMinutes', { minutes: post.readingMinutes })}</span>
      </div>
      <TagList tags={post.tags} />
    </header>
  )
}
