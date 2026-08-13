import type { PostMeta } from '@/lib/blog/types'
import { appUrl, siteUrl } from '@/lib/seo/metadata'

/**
 * Сборка llms.txt по спеке llmstxt.org (docs/research/agent-ready-saas.md):
 * H1, блоквот-описание одной строкой, свободный текст, секции ## со ссылками
 * вида `- [Название](URL): описание`.
 *
 * Описание статьи в списке - это meta.answer, обрезанный до одного предложения,
 * а не meta.description: answer написан как готовый факт для цитирования,
 * description - для человека в выдаче.
 */

/** Первое предложение answer: до первой точки, вопросительного или восклицательного знака. */
function firstSentence(answer: string): string {
  const match = /^[^.!?]*[.!?]/.exec(answer)
  return (match ? match[0] : answer).trim()
}

export function buildLlmsTxt(posts: readonly PostMeta[]): string {
  const productLines = [
    '## Продукт',
    '',
    `- [Endgrain Studio](${siteUrl()}): что делает инструмент и для кого`,
    `- [Студия](${appUrl()}): редактор узора, расчёты и экспорт`,
    `- [Тарифы](${appUrl('/pricing')}): Free и Pro, что входит в каждый`,
  ].join('\n')

  const blogLines = ['## Блог', '', ...posts.map((p) => `- [${p.title}](${siteUrl(`/blog/${p.slug}`)}): ${firstSentence(p.answer)}`)].join(
    '\n',
  )

  const optionalLines = [
    '## Optional',
    '',
    `- [RSS](${siteUrl('/blog/rss.xml')}): лента статей`,
    `- [Карта сайта](${siteUrl('/sitemap.xml')})`,
  ].join('\n')

  return `# Endgrain Studio

> Производственный инструмент для торцевых разделочных досок: узор, схема распила и переклеек, размеры деталей, расчёт материала и себестоимости, печатная инструкция в PDF.

Все размеры в миллиметрах, дюймы только представление. Расчёты учитывают толщину пропила (kerf) и припуски на выравнивание.

${productLines}

${blogLines}

${optionalLines}
`
}
