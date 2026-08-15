import { describe, expect, it } from 'vitest'
import { MERCH_SIZES_BY_PRODUCT, MERCH_VARIANTS, findMerchVariant, merchVariant } from './catalog'
import { MERCH_PRODUCT_IDS } from '../promo/types'

describe('каталог мерча', () => {
  it('каждому товару соответствуют только допустимые размеры (§1.1, §4.1 спеки)', () => {
    for (const variant of MERCH_VARIANTS) {
      expect(MERCH_SIZES_BY_PRODUCT[variant.productId]).toContain(variant.size)
    }
    // mug/poster/apron - ровно 'one', футболка - ровно s/m/l/xl, ничего лишнего.
    expect(MERCH_SIZES_BY_PRODUCT.tshirt).toEqual(['s', 'm', 'l', 'xl'])
    expect(MERCH_SIZES_BY_PRODUCT.mug).toEqual(['one'])
    expect(MERCH_SIZES_BY_PRODUCT.poster).toEqual(['one'])
    expect(MERCH_SIZES_BY_PRODUCT.apron).toEqual(['one'])
  })

  it('все variant_id уникальны', () => {
    const ids = MERCH_VARIANTS.map((v) => v.variantId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('costCents и shipCents положительны у всех вариантов', () => {
    for (const variant of MERCH_VARIANTS) {
      expect(variant.costCents).toBeGreaterThan(0)
      expect(variant.shipCents).toBeGreaterThan(0)
    }
  })

  it('у каждого товара из общего каталога мерча есть хотя бы один вариант', () => {
    for (const productId of MERCH_PRODUCT_IDS) {
      expect(MERCH_VARIANTS.some((v) => v.productId === productId)).toBe(true)
    }
  })

  it('футболка продаётся одним размером за раз, ряд S-XL полный (§2.3 спеки)', () => {
    const sizes = MERCH_VARIANTS.filter((v) => v.productId === 'tshirt').map((v) => v.size)
    expect(sizes.sort()).toEqual(['l', 'm', 's', 'xl'])
  })

  it('цена одинакова для всех размеров футболки (§2.3: одна цена на все размеры)', () => {
    const tshirts = MERCH_VARIANTS.filter((v) => v.productId === 'tshirt')
    const costs = new Set(tshirts.map((v) => v.costCents))
    const ships = new Set(tshirts.map((v) => v.shipCents))
    expect(costs.size).toBe(1)
    expect(ships.size).toBe(1)
  })

  it('findMerchVariant возвращает undefined на недопустимой паре товар+размер', () => {
    expect(findMerchVariant('mug', 's')).toBeUndefined()
    expect(findMerchVariant('tshirt', 'one')).toBeUndefined()
    expect(findMerchVariant('tshirt', 'm')).toBeDefined()
  })

  it('merchVariant кидает на недопустимой паре', () => {
    expect(() => merchVariant('poster', 's')).toThrow()
    expect(merchVariant('poster', 'one').variantId).toBe(1)
  })

  it('фартук это фартук: variant_id 22903, а не случайный сосед по каталогу', () => {
    expect(merchVariant('apron', 'one').variantId).toBe(22903)
  })
})
