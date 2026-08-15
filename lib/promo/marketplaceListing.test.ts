import { describe, expect, it } from 'vitest'
import type { BoardDescription } from './describe'
import { boardSizeInches } from './listing'
import { demoListingForMarketplace, marketplaceListingPrompt, parseMarketplaceListing } from './marketplaceListing'
import { marketplaceById } from './marketplaces'

const DESC: BoardDescription = {
  species: ['Black Walnut', 'Hard Maple'],
  sizeMm: '300 x 450 x 30 mm',
  cellCount: 64,
  text: 'An end-grain cutting board, 300 x 450 x 30 mm, made of Black Walnut, Hard Maple.',
}
const SIZE_IN = boardSizeInches(300, 450, 30)

describe('demoListingForMarketplace', () => {
  it('соблюдает лимиты Amazon (5 буллетов, заголовок <=200)', () => {
    const spec = marketplaceById('amazon')
    const draft = demoListingForMarketplace(DESC, SIZE_IN, spec)
    expect(draft.title.length).toBeLessThanOrEqual(spec.listing.titleMax)
    expect(draft.bullets.length).toBeLessThanOrEqual(spec.listing.bulletCount)
    expect(draft.bullets.every((b) => b.length <= spec.listing.bulletMax)).toBe(true)
  })

  it('площадка без буллетов (Ozon) отдаёт пустой массив буллетов', () => {
    const spec = marketplaceById('ozon')
    expect(spec.listing.bulletCount).toBe(0)
    const draft = demoListingForMarketplace(DESC, SIZE_IN, spec)
    expect(draft.bullets).toEqual([])
  })

  it('площадка без тегов (Yandex) отдаёт пустой массив тегов', () => {
    const spec = marketplaceById('yandexmarket')
    expect(spec.listing.tagCount).toBe(0)
    const draft = demoListingForMarketplace(DESC, SIZE_IN, spec)
    expect(draft.tags).toEqual([])
  })

  it('Etsy отдаёт ровно 13 тегов, каждый до 20 символов', () => {
    const spec = marketplaceById('etsy')
    const draft = demoListingForMarketplace(DESC, SIZE_IN, spec)
    expect(draft.tags.length).toBeLessThanOrEqual(spec.listing.tagCount)
    expect(draft.tags.every((tag) => tag.length <= spec.listing.tagMax)).toBe(true)
  })

  it('детерминирован', () => {
    const spec = marketplaceById('amazon')
    const a = demoListingForMarketplace(DESC, SIZE_IN, spec)
    const b = demoListingForMarketplace(DESC, SIZE_IN, spec)
    expect(a).toEqual(b)
  })
})

describe('marketplaceListingPrompt', () => {
  it('упоминает id площадки, размеры и лимиты полей', () => {
    const spec = marketplaceById('wildberries')
    const prompt = marketplaceListingPrompt(DESC, SIZE_IN, spec, ['hero shot on white'])
    expect(prompt).toContain('wildberries')
    expect(prompt).toContain(DESC.sizeMm)
    expect(prompt).toContain('hero shot on white')
  })

  it('честно говорит модели, что у площадки без буллетов их быть не должно', () => {
    const spec = marketplaceById('ozon')
    const prompt = marketplaceListingPrompt(DESC, SIZE_IN, spec, [])
    expect(prompt).toContain('no bullet field')
  })
})

describe('parseMarketplaceListing', () => {
  it('разбирает валидный JSON и обрезает под лимиты площадки', () => {
    const spec = marketplaceById('amazon')
    const raw = JSON.stringify({
      title: 'A'.repeat(300),
      description: 'B'.repeat(3000),
      bullets: Array.from({ length: 8 }, (_, i) => `bullet ${i}`),
      tags: ['x', 'y'],
    })
    const draft = parseMarketplaceListing(raw, spec)
    expect(draft).not.toBeNull()
    expect(draft?.title.length).toBe(spec.listing.titleMax)
    expect(draft?.description.length).toBe(spec.listing.descriptionMax)
    expect(draft?.bullets).toHaveLength(spec.listing.bulletCount)
  })

  it('вырезает JSON из окружающего текста', () => {
    const spec = marketplaceById('etsy')
    const raw = `Here is the listing:\n${JSON.stringify({ title: 't', description: 'd', bullets: [], tags: ['a'] })}\nDone.`
    expect(parseMarketplaceListing(raw, spec)).not.toBeNull()
  })

  it('битый JSON даёт null, а не бросает', () => {
    expect(parseMarketplaceListing('not json', marketplaceById('amazon'))).toBeNull()
  })

  it('площадка без буллетов обнуляет их, даже если модель их прислала', () => {
    const spec = marketplaceById('ozon')
    const raw = JSON.stringify({ title: 't', description: 'd', bullets: ['one', 'two'], tags: [] })
    const draft = parseMarketplaceListing(raw, spec)
    expect(draft?.bullets).toEqual([])
  })
})
