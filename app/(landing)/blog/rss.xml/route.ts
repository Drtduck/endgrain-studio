import { allPosts } from '@/lib/blog/posts'
import { buildRssFeed } from '@/lib/blog/rss'

// Путь оканчивается на .xml: матчер прокси его пропускает, фид одинаково
// открывается на обоих доменах (см. комментарий в next.config.ts про isSitePath).
export const dynamic = 'force-static'

export function GET(): Response {
  const xml = buildRssFeed(allPosts())
  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
