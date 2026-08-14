import type { MetadataRoute } from 'next'
import { SITE_ORIGIN } from '@/lib/routing/host'

// robots.ts отдаётся с обоих доменов одинаково, потому что проект один: Next не
// умеет разводить файловые конвенции по заголовку Host. Для конкурсного продукта
// это приемлемо; если понадобится разводить по домену, делается через route
// handler, который читает заголовок Host сам.
// ИИ-краулеров общее правило `userAgent: '*'` и так пропускает: allow: '/' не
// блокирует никого. Но отдельные секции под них добавлены явно, потому что
// цель этого продукта - чтобы нас цитировали ChatGPT, Claude, Perplexity и
// Google AI Overviews, а явное разрешение снимает любую двусмысленность у
// агрегаторов, которые проверяют robots.txt на предмет прямого запрета по
// имени бота, а не только общий wildcard.
const AI_CRAWLER_AGENTS: readonly string[] = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-Web',
  'anthropic-ai',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
]

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/', disallow: ['/auth/', '/reset-password', '/api/'] },
      ...AI_CRAWLER_AGENTS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: ['/auth/', '/reset-password', '/api/'],
      })),
    ],
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  }
}
