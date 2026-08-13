import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

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
          <Badge variant="secondary" render={<Link href={`/blog/tag/${encodeURIComponent(tag)}`} />}>
            {tag}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
