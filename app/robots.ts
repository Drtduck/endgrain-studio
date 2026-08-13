import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/routing/host'

// robots.ts отдаётся с обоих доменов одинаково, потому что проект один: Next не
// умеет разводить файловые конвенции по заголовку Host. Для конкурсного продукта
// это приемлемо; если понадобится разводить по домену, делается через route
// handler, который читает заголовок Host сам.
export default function robots(): MetadataRoute.Robots {
  return {
    // ИИ-краулеров (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, OAI-SearchBot)
    // не блокируем и отдельных правил под них не пишем: общее allow их и так
    // пропускает, а цель этого кластера - чтобы нас цитировали, а не наоборот.
    rules: { userAgent: '*', allow: '/', disallow: ['/auth/', '/reset-password', '/api/'] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
