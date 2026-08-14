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
    // Без слеша на конце: Next.js Metadata API сам отдаёт canonical и og:url
    // корня без слеша (см. lib/seo/jsonld.ts), sitemap должен совпадать с тем,
    // что реально видит краулер, иначе три источника расходятся на один символ.
    { url: SITE_ORIGIN, priority: 1.0, changeFrequency: 'weekly' },
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
    // APP_ORIGIN + '/' сознательно не в индексе: анонимный визит на корень студии
    // ловит 307 на /login (см. lib/auth/access.ts), и поисковик индексировал бы
    // редирект вместо страницы. Первая полезная app-страница для анонима - /pricing.
    { url: `${APP_ORIGIN}/pricing`, priority: 0.6 },
    { url: `${APP_ORIGIN}/gallery`, priority: 0.6 },
    { url: `${APP_ORIGIN}/legal/privacy`, priority: 0.3 },
    { url: `${APP_ORIGIN}/legal/personal-data`, priority: 0.3 },
    { url: `${APP_ORIGIN}/legal/consent`, priority: 0.3 },
  ]
}
