import { describe, expect, it } from 'vitest'
import { AMAZON_TAG, amazonUrl, BOOKS, PRODUCTS } from './index'
import type { AffiliateItem } from './types'

const ASIN_RE = /^[A-Z0-9]{10}$/
const EM_DASH = '—'

const ALL_ITEMS: readonly AffiliateItem[] = [...PRODUCTS, ...BOOKS]

function collectStrings(item: unknown): readonly string[] {
  if (typeof item === 'string') return [item]
  if (Array.isArray(item)) return item.flatMap(collectStrings)
  if (item !== null && typeof item === 'object') {
    return Object.values(item as Record<string, unknown>).flatMap(collectStrings)
  }
  return []
}

describe('affiliate data', () => {
  it('каждый ASIN ровно 10 символов из набора A-Z0-9', () => {
    for (const item of ALL_ITEMS) {
      expect(item.asin).toMatch(ASIN_RE)
    }
  })

  it('ASIN уникальны внутри каждого файла и между файлами', () => {
    const asins = ALL_ITEMS.map((item) => item.asin)
    expect(new Set(asins).size).toBe(asins.length)
  })

  it('id уникальны внутри каждого файла и между файлами', () => {
    const ids = ALL_ITEMS.map((item) => item.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('у каждой позиции непустые title/note на обоих языках, ru отличается от en', () => {
    for (const item of ALL_ITEMS) {
      expect(item.title.ru.length).toBeGreaterThan(0)
      expect(item.title.en.length).toBeGreaterThan(0)
      expect(item.note.ru.length).toBeGreaterThan(0)
      expect(item.note.en.length).toBeGreaterThan(0)
      expect(item.title.ru).not.toBe(item.title.en)
      expect(item.note.ru).not.toBe(item.note.en)
    }
  })

  it('у каждой книги непустой why на обоих языках, ru отличается от en', () => {
    for (const book of BOOKS) {
      expect(book.why.ru.length).toBeGreaterThan(0)
      expect(book.why.en.length).toBeGreaterThan(0)
      expect(book.why.ru).not.toBe(book.why.en)
    }
  })

  it('band из допустимого множества', () => {
    const bands = new Set(['under10', 'b10_25', 'b25_50', 'b50_100'])
    for (const item of ALL_ITEMS) {
      expect(bands.has(item.band)).toBe(true)
    }
  })

  it('ни в одном значении нет символа U+2014', () => {
    for (const item of ALL_ITEMS) {
      for (const value of collectStrings(item)) {
        expect(value).not.toContain(EM_DASH)
      }
    }
  })

  it('amazonUrl без тега не содержит tag=, с тегом содержит ?tag= ровно один раз', () => {
    const url = amazonUrl('B0000224B4')
    const tagMatches = url.match(/\?tag=/g) ?? []

    if (AMAZON_TAG.length === 0) {
      expect(url).toBe('https://www.amazon.com/dp/B0000224B4')
      expect(url).not.toContain('tag=')
    } else {
      expect(tagMatches.length).toBe(1)
      expect(url).toBe(`https://www.amazon.com/dp/B0000224B4?tag=${encodeURIComponent(AMAZON_TAG)}`)
    }
  })
})
