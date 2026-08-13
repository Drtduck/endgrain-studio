import { POST_METAS } from './registry'
import { postMetaSchema, type PostMeta } from './types'

/**
 * Валидирует каждую запись реестра зод-схемой перед тем, как отдать её дальше:
 * опечатка в дате или отсутствующий description иначе доедут до sitemap и
 * JSON-LD, где превратятся в невалидную разметку. Отбрасывает черновики.
 */
export function allPosts(): readonly PostMeta[] {
  return POST_METAS.map((meta) => postMetaSchema.parse(meta))
    .filter((meta) => !meta.draft)
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function postBySlug(slug: string): PostMeta | undefined {
  return allPosts().find((meta) => meta.slug === slug)
}

export function postsByTag(tag: string): readonly PostMeta[] {
  return allPosts().filter((meta) => meta.tags.includes(tag))
}

export interface TagCount {
  readonly tag: string
  readonly count: number
}

/** Уникальные теги со счётчиками, отсортированные по частоте (по убыванию), затем по имени. */
export function allTags(): readonly TagCount[] {
  const counts = new Map<string, number>()
  for (const meta of allPosts()) {
    for (const tag of meta.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
