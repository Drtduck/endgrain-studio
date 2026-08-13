import { siteUrl } from '@/lib/seo/metadata'
import type { PostMeta } from './types'

/**
 * RSS 2.0 для десяти полей это сорок строк сериализатора, библиотеку под это не
 * ставим. Полные тексты статей в фид не кладём, только description из meta.description.
 */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** RFC 822: Wed, 14 Aug 2026 00:00:00 GMT. Статьи хранят только дату, время фиксируем полуночью UTC. */
function toRfc822(date: string): string {
  return new Date(`${date}T00:00:00Z`).toUTCString()
}

export function buildRssFeed(posts: readonly PostMeta[]): string {
  const now = new Date().toUTCString()
  const channelLink = siteUrl('/blog')
  const items = posts
    .map((post) => {
      const link = siteUrl(`/blog/${post.slug}`)
      return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${toRfc822(post.date)}</pubDate>
      <description><![CDATA[${post.description}]]></description>
    </item>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Блог Endgrain Studio</title>
    <link>${escapeXml(channelLink)}</link>
    <description>Производственные заметки для столяра: раскрой, материалы, инструкции.</description>
    <language>ru</language>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>`
}
