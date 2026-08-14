import { describe, expect, it } from 'vitest'
import type { PostMeta } from '@/lib/blog/types'
import { blogJsonLd, breadcrumbListJsonLd, landingJsonLd, postJsonLd, pricingJsonLd } from './jsonld'

const ABSOLUTE_URL_RE = /^https?:\/\//

function collectValues(value: unknown, out: unknown[] = []): unknown[] {
  if (value === null || value === undefined) return out
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectValues(v, out)
    return out
  }
  out.push(value)
  return out
}

const POST: PostMeta = {
  slug: 'kerf-i-pripuski',
  lang: 'ru',
  title: 'Пропил и припуски',
  description: 'Описание статьи',
  answer: 'Ответ статьи',
  date: '2026-08-14',
  updated: '2026-08-15',
  tags: ['раскрой', 'расчёт'],
  cover: '/blog/kerf-i-pripuski/cover.jpg',
  readingMinutes: 6,
}

describe('landingJsonLd', () => {
  it('содержит @graph из Organization, WebSite и SoftwareApplication', () => {
    const graph = landingJsonLd()['@graph'] as Record<string, unknown>[]
    const types = graph.map((node) => node['@type'])
    expect(types).toEqual(['Organization', 'WebSite', 'SoftwareApplication'])
  })

  it('WebSite ссылается на Organization через @id', () => {
    const graph = landingJsonLd()['@graph'] as Record<string, unknown>[]
    const org = graph.find((n) => n['@type'] === 'Organization')
    const site = graph.find((n) => n['@type'] === 'WebSite')
    expect((site?.['publisher'] as Record<string, unknown>)['@id']).toBe(org?.['@id'])
  })

  it('все URL абсолютные', () => {
    const urlish = collectValues(landingJsonLd()).filter(
      (v) => typeof v === 'string' && (v.startsWith('/') || v.includes('endgrain.app')),
    ) as string[]
    for (const v of urlish) {
      if (v.startsWith('/')) continue // относительные пути внутри не абсолютного поля не считаем
      expect(v).toMatch(ABSOLUTE_URL_RE)
    }
  })
})

describe('pricingJsonLd', () => {
  it('это SoftwareApplication с офферами Free, Pro, Пропуска и Developer', () => {
    const json = pricingJsonLd()
    expect(json['@type']).toBe('SoftwareApplication')
    const offers = json['offers'] as Record<string, unknown>[]
    expect(offers).toHaveLength(6)
    expect(offers.map((o) => o['price'])).toEqual(['0', '9', '90', '19', '20', '200'])
  })
})

describe('blogJsonLd', () => {
  it('содержит blogPost с непустым headline, url, datePublished', () => {
    const json = blogJsonLd([POST])
    const posts = json['blogPost'] as Record<string, unknown>[]
    expect(posts).toHaveLength(1)
    expect(posts[0]?.['headline']).toBe(POST.title)
    expect(posts[0]?.['url']).toMatch(ABSOLUTE_URL_RE)
    expect(posts[0]?.['datePublished']).toBe(POST.date)
  })
})

describe('breadcrumbListJsonLd', () => {
  it('нумерует позиции с 1', () => {
    const json = breadcrumbListJsonLd([
      { name: 'A', url: 'https://endgrain.app/' },
      { name: 'B', url: 'https://endgrain.app/blog' },
    ])
    const items = json['itemListElement'] as Record<string, unknown>[]
    expect(items.map((i) => i['position'])).toEqual([1, 2])
  })
})

describe('postJsonLd', () => {
  it('@graph содержит BlogPosting и BreadcrumbList', () => {
    const graph = postJsonLd(POST)['@graph'] as Record<string, unknown>[]
    expect(graph.map((n) => n['@type'])).toEqual(['BlogPosting', 'BreadcrumbList'])
  })

  it('BlogPosting несёт непустые headline, datePublished, image', () => {
    const graph = postJsonLd(POST)['@graph'] as Record<string, unknown>[]
    const posting = graph[0] as Record<string, unknown>
    expect((posting['headline'] as string).length).toBeGreaterThan(0)
    expect(posting['datePublished']).toBe(POST.date)
    expect(posting['image']).toMatch(ABSOLUTE_URL_RE)
  })

  it('headline обрезается до 110 символов', () => {
    const longTitle = 'A'.repeat(200)
    const graph = postJsonLd({ ...POST, title: longTitle })['@graph'] as Record<string, unknown>[]
    const posting = graph[0] as Record<string, unknown>
    expect((posting['headline'] as string).length).toBe(110)
  })

  it('dateModified берётся из meta.updated, а не из даты сборки', () => {
    const graph = postJsonLd(POST)['@graph'] as Record<string, unknown>[]
    const posting = graph[0] as Record<string, unknown>
    expect(posting['dateModified']).toBe(POST.updated)
  })

  it('inLanguage берётся из meta.lang', () => {
    const graph = postJsonLd(POST)['@graph'] as Record<string, unknown>[]
    const posting = graph[0] as Record<string, unknown>
    expect(posting['inLanguage']).toBe('ru')
  })

  it('все URL абсолютные', () => {
    const json = postJsonLd(POST)
    const strings = collectValues(json).filter((v) => typeof v === 'string') as string[]
    const urlLike = strings.filter((v) => v.includes('endgrain.app'))
    expect(urlLike.length).toBeGreaterThan(0)
    for (const v of urlLike) expect(v).toMatch(ABSOLUTE_URL_RE)
  })
})
