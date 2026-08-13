import { z } from 'zod'

/**
 * Метаданные статьи объявляются прямо в MDX как `export const meta` (frontmatter
 * @next/mdx не поддерживает). Схема ловит опечатку в дате или отсутствующий
 * description до того, как она доедет до sitemap или JSON-LD, где превратится
 * в невалидную разметку.
 */
export const postMetaSchema = z.object({
  slug: z.string().min(1),
  /** Язык это свойство статьи, а не читателя: один URL - один язык - один канон. */
  lang: z.enum(['ru', 'en']),
  title: z.string().min(1).max(110),
  description: z.string().min(1),
  /**
   * Готовый факт-ответ на вопрос из заголовка, два-три предложения. Это то, что
   * ИИ-ассистент вырезает и цитирует; отличается от description, написанного для
   * человека в выдаче. Уходит в компонент <Answer> и в llms.txt.
   */
  answer: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(z.string().min(1)).min(1),
  cover: z.string().min(1),
  readingMinutes: z.number().int().positive(),
  /** Не публикуется, но остаётся в реестре: черновики отбрасывает allPosts(). */
  draft: z.boolean().optional(),
  /** slug статьи-пары на другом языке. Пока переводов нет, поле не заполняется. */
  translationOf: z.string().min(1).optional(),
})

export type PostMeta = z.infer<typeof postMetaSchema>
