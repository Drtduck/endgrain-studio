import { describe, it, expect } from 'vitest'
import type { BoardDescription } from './describe'
import {
  AMAZON_BULLET_COUNT,
  ETSY_TAG_COUNT,
  ETSY_TAG_MAX,
  boardSizeInches,
  demoListing,
  parseListing,
} from './listing'

const DESC: BoardDescription = {
  species: ['Black Walnut', 'Hard Maple'],
  sizeMm: '300 x 450 x 30 mm',
  cellCount: 64,
  text: 'An end-grain cutting board, 300 x 450 x 30 mm, made of Black Walnut, Hard Maple.',
}

const SIZE_IN = boardSizeInches(300, 450, 30)

function validPayload(overrides: Record<string, unknown> = {}): unknown {
  return {
    title: 'Walnut End-Grain Cutting Board',
    bullets: ['one', 'two', 'three', 'four', 'five'],
    keywords: Array.from({ length: ETSY_TAG_COUNT }, (_, i) => `tag${i}`),
    description: 'A handmade board.',
    materials: ['Black walnut'],
    care: 'Hand wash only.',
    ...overrides,
  }
}

describe('boardSizeInches', () => {
  it('переводит миллиметры в дюймы', () => {
    expect(SIZE_IN).toMatch(/in$/)
    expect(SIZE_IN).toContain('x')
  })
})

describe('parseListing', () => {
  it('разбирает валидный ответ модели', () => {
    const res = parseListing(JSON.stringify(validPayload()))
    expect(res).not.toBeNull()
    expect(res?.keywords).toHaveLength(ETSY_TAG_COUNT)
    expect(res?.bullets).toHaveLength(AMAZON_BULLET_COUNT)
  })

  it('вырезает JSON из окружающего текста', () => {
    const res = parseListing(`Here is the listing:\n${JSON.stringify(validPayload())}\nHope this helps!`)
    expect(res).not.toBeNull()
  })

  it('отбивает урезанный ответ: меньше 13 тегов', () => {
    const res = parseListing(JSON.stringify(validPayload({ keywords: ['only-one'] })))
    expect(res).toBeNull()
  })

  it('отбивает тег длиннее 20 символов', () => {
    const tooLong = 'a'.repeat(ETSY_TAG_MAX + 1)
    const keywords = Array.from({ length: ETSY_TAG_COUNT }, (_, i) => (i === 0 ? tooLong : `tag${i}`))
    const res = parseListing(JSON.stringify(validPayload({ keywords })))
    expect(res).toBeNull()
  })

  it('отбивает не ровно 5 буллетов', () => {
    const res = parseListing(JSON.stringify(validPayload({ bullets: ['one', 'two'] })))
    expect(res).toBeNull()
  })

  it('битый JSON даёт null, а не бросает', () => {
    expect(parseListing('not json at all')).toBeNull()
  })
})

describe('demoListing', () => {
  it('детерминирован: одинаковый вход даёт одинаковый выход', () => {
    const a = demoListing(DESC, SIZE_IN)
    const b = demoListing(DESC, SIZE_IN)
    expect(a).toEqual(b)
  })

  it('упоминает реальный габарит и породы', () => {
    const res = demoListing(DESC, SIZE_IN)
    expect(res.title.toLowerCase()).toContain('walnut')
    expect(res.description).toContain(DESC.sizeMm)
    expect(res.bullets.join(' ')).toContain(DESC.sizeMm)
  })

  it('соблюдает лимиты площадок', () => {
    const res = demoListing(DESC, SIZE_IN)
    expect(res.keywords).toHaveLength(ETSY_TAG_COUNT)
    expect(res.keywords.every((k) => k.length <= ETSY_TAG_MAX)).toBe(true)
    expect(res.bullets).toHaveLength(AMAZON_BULLET_COUNT)
  })

  it('работает без пород, ничего не бросает', () => {
    const empty: BoardDescription = { species: [], sizeMm: '100 x 100 x 20 mm', cellCount: 4, text: 'a board' }
    const res = demoListing(empty, boardSizeInches(100, 100, 20))
    expect(res.materials.length).toBeGreaterThan(0)
  })
})
