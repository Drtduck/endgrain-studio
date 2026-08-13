import { allPosts } from '@/lib/blog/posts'
import { buildLlmsTxt } from '@/lib/geo/llms'

// Папка с точкой в имени - рабочая конвенция App Router, файл отдаётся как /llms.txt.
// Путь оканчивается на .txt: матчер прокси его пропускает, поэтому он одинаково
// открывается и на endgrain.app, и на app.endgrain.app без отдельной настройки.
export const dynamic = 'force-static'

export function GET(): Response {
  const txt = buildLlmsTxt(allPosts())
  return new Response(txt, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
