import { describe, expect, it } from 'vitest'
import { allPosts, allTags, postBySlug, postsByTag } from './posts'

describe('allPosts', () => {
  it('возвращает все три стартовые статьи', () => {
    expect(allPosts()).toHaveLength(3)
  })

  it('сортирует по дате убыванием', () => {
    const dates = allPosts().map((p) => p.date)
    const sorted = [...dates].sort((a, b) => b.localeCompare(a))
    expect(dates).toEqual(sorted)
  })

  it('каждая запись проходит зод-валидацию (иначе allPosts бросил бы)', () => {
    for (const post of allPosts()) {
      expect(post.slug.length).toBeGreaterThan(0)
      expect(post.title.length).toBeGreaterThan(0)
      expect(post.description.length).toBeGreaterThan(0)
      expect(post.answer.length).toBeGreaterThan(0)
      expect(post.tags.length).toBeGreaterThan(0)
    }
  })

  it('отбрасывает черновики', () => {
    for (const post of allPosts()) {
      expect(post.draft).not.toBe(true)
    }
  })
})

describe('postBySlug', () => {
  it('находит статью по slug', () => {
    expect(postBySlug('kerf-i-pripuski')?.title).toContain('Пропил и припуски')
  })

  it('возвращает undefined для несуществующего slug', () => {
    expect(postBySlug('nonexistent')).toBeUndefined()
  })
})

describe('postsByTag', () => {
  it('фильтрует по тегу', () => {
    const posts = postsByTag('раскрой')
    expect(posts.length).toBeGreaterThan(0)
    for (const post of posts) expect(post.tags).toContain('раскрой')
  })

  it('пустой список для неизвестного тега', () => {
    expect(postsByTag('нет-такого-тега')).toEqual([])
  })
})

describe('allTags', () => {
  it('считает частоту тегов и сортирует по убыванию', () => {
    const tags = allTags()
    expect(tags.length).toBeGreaterThan(0)
    for (let i = 1; i < tags.length; i++) {
      expect(tags[i - 1]!.count).toBeGreaterThanOrEqual(tags[i]!.count)
    }
  })

  it('раскрой встречается дважды', () => {
    const tags = allTags()
    const raskroi = tags.find((t) => t.tag === 'раскрой')
    expect(raskroi?.count).toBe(2)
  })
})
