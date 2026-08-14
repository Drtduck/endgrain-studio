import { describe, expect, it } from 'vitest'
import { allPosts, allTags, feedPosts, postBySlug, postsByTag, translationOf } from './posts'

describe('allPosts', () => {
  it('возвращает три стартовые темы в обеих локалях, шесть статей', () => {
    expect(allPosts()).toHaveLength(6)
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

describe('translationOf', () => {
  it('находит английский перевод русской статьи', () => {
    const ru = postBySlug('kerf-i-pripuski')
    expect(ru).toBeDefined()
    expect(translationOf(ru!)?.slug).toBe('kerf-i-pripuski-en')
  })

  it('находит русский оригинал по английской статье', () => {
    const en = postBySlug('kerf-i-pripuski-en')
    expect(en).toBeDefined()
    expect(translationOf(en!)?.slug).toBe('kerf-i-pripuski')
  })
})

describe('feedPosts', () => {
  it('на английской локали отдаёт по одной статье на тему, все на английском', () => {
    const posts = feedPosts('en')
    expect(posts).toHaveLength(3)
    for (const post of posts) expect(post.lang).toBe('en')
  })

  it('на русской локали отдаёт по одной статье на тему, все на русском', () => {
    const posts = feedPosts('ru')
    expect(posts).toHaveLength(3)
    for (const post of posts) expect(post.lang).toBe('ru')
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
