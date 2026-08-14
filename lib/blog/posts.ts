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

/**
 * Статья на другом языке из той же пары перевод/оригинал, если она есть.
 * Пара связана через translationOf: у перевода оно указывает на исходный slug,
 * у оригинала своего translationOf нет, поэтому его находим по чужому полю.
 */
export function translationOf(post: PostMeta): PostMeta | undefined {
  if (post.translationOf) return postBySlug(post.translationOf)
  return allPosts().find((meta) => meta.translationOf === post.slug)
}

/**
 * Лента статей под конкретную локаль читателя: язык - свойство статьи, а не
 * читателя, поэтому у каждой темы (оригинал + перевод) в ленте ровно одна
 * карточка - версия на локали читателя, если она есть, иначе оригинал
 * (PostCard в этом случае сама показывает бейдж «на другом языке»).
 */
export function feedPosts(locale: PostMeta['lang']): readonly PostMeta[] {
  const groups = new Map<string, PostMeta[]>()
  for (const meta of allPosts()) {
    const key = meta.translationOf ?? meta.slug
    const group = groups.get(key) ?? []
    group.push(meta)
    groups.set(key, group)
  }

  const result: PostMeta[] = []
  for (const group of groups.values()) {
    const preferred = group.find((meta) => meta.lang === locale) ?? group[0]
    if (preferred) result.push(preferred)
  }
  return result.sort((a, b) => b.date.localeCompare(a.date))
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
