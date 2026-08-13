import Link from 'next/link'

/**
 * Список тегов статьи, каждый ссылкой на /blog/tag/<tag>. Страницы тегов
 * стоят noindex, но людям они полезны как способ найти соседние статьи.
 */
export function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2" data-testid="blog-tags">
      {tags.map((tag) => (
        <li key={tag}>
          <Link
            href={`/blog/tag/${encodeURIComponent(tag)}`}
            className="rounded-full border border-line bg-surface-panel px-3 py-1 font-sans text-xs text-ink-secondary hover:text-ink"
          >
            {tag}
          </Link>
        </li>
      ))}
    </ul>
  )
}
