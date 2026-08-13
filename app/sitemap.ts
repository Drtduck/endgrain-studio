import type { MetadataRoute } from 'next'
import { allPosts } from '@/lib/blog/posts'
import { APP_ORIGIN, SITE_ORIGIN } from '@/lib/routing/host'

// sitemap.ts отдаётся с обоих доменов одинаково (см. комментарий в app/robots.ts).
// Страницы тегов сюда не идут: они noindex. lastModified статей берётся из
// meta.updated/meta.date, а не из new Date() - иначе каждый билд врал бы о свежести.
export default function sitemap(): MetadataRoute.Sitemap {
  const posts = allPosts()
  const blogLastModified = posts[0] ? (posts[0].updated ?? posts[0].date) : undefined

  return [
    { url: `${SITE_ORIGIN}/`, priority: 1.0, changeFrequency: 'weekly' },
    {
      url: `${SITE_ORIGIN}/blog`,
      priority: 0.7,
      changeFrequency: 'weekly',
      ...(blogLastModified ? { lastModified: blogLastModified } : {}),
    },
    ...posts.map((p) => ({
      url: `${SITE_ORIGIN}/blog/${p.slug}`,
      lastModified: p.updated ?? p.date,
      priority: 0.6,
      changeFrequency: 'yearly' as const,
    })),
    { url: `${APP_ORIGIN}/`, priority: 0.8 },
    { url: `${APP_ORIGIN}/pricing`, priority: 0.6 },
  ]
}
