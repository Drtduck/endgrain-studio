import type { MetadataRoute } from 'next'
import { SITE_ORIGIN, APP_ORIGIN } from '@/lib/routing/host'

// sitemap.ts отдаётся с обоих доменов одинаково (см. комментарий в app/robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_ORIGIN, priority: 1.0 },
    { url: APP_ORIGIN, priority: 0.8 },
    { url: `${APP_ORIGIN}/pricing`, priority: 0.6 },
    { url: `${APP_ORIGIN}/legal/privacy`, priority: 0.3 },
    { url: `${APP_ORIGIN}/legal/personal-data`, priority: 0.3 },
    { url: `${APP_ORIGIN}/legal/consent`, priority: 0.3 },
  ]
}
