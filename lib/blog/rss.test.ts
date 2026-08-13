import { describe, expect, it } from 'vitest'
import type { PostMeta } from './types'
import { buildRssFeed } from './rss'

const POST: PostMeta = {
  slug: 'kerf-i-pripuski',
  lang: 'ru',
  title: 'Пропил и припуски',
  description: 'Описание статьи',
  answer: 'Ответ статьи',
  date: '2026-08-14',
  updated: '2026-08-14',
  tags: ['раскрой'],
  cover: '/blog/kerf-i-pripuski/cover.jpg',
  readingMinutes: 6,
}

describe('buildRssFeed', () => {
  it('содержит валидную XML-обёртку и заголовки канала', () => {
    const xml = buildRssFeed([POST])
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(xml).toContain('<rss version="2.0">')
    expect(xml).toContain('<language>ru</language>')
  })

  it('один item на статью с title, link, guid, pubDate, description', () => {
    const xml = buildRssFeed([POST])
    expect((xml.match(/<item>/g) ?? []).length).toBe(1)
    expect(xml).toContain('<title>Пропил и припуски</title>')
    expect(xml).toContain('<link>https://endgrain.app/blog/kerf-i-pripuski</link>')
    expect(xml).toContain('<guid isPermaLink="true">https://endgrain.app/blog/kerf-i-pripuski</guid>')
    expect(xml).toContain('<description><![CDATA[Описание статьи]]></description>')
  })

  it('pubDate в формате RFC 822', () => {
    const xml = buildRssFeed([POST])
    expect(xml).toMatch(/<pubDate>\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT<\/pubDate>/)
  })

  it('экранирует амперсанд и угловые скобки в заголовке', () => {
    const xml = buildRssFeed([{ ...POST, title: 'Chevron & <herringbone>' }])
    expect(xml).toContain('<title>Chevron &amp; &lt;herringbone&gt;</title>')
    expect(xml).not.toContain('<title>Chevron & <herringbone></title>')
  })

  it('несколько статей дают несколько item', () => {
    const xml = buildRssFeed([POST, { ...POST, slug: 'vybor-porod', title: 'Породы' }])
    expect((xml.match(/<item>/g) ?? []).length).toBe(2)
  })

  it('пустой список статей не ломает канал', () => {
    const xml = buildRssFeed([])
    expect(xml).toContain('<rss version="2.0">')
    expect(xml).not.toContain('<item>')
  })
})
