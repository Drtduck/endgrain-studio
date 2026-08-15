import { describe, expect, it } from 'vitest'
import { DEFAULT_MARKETPLACE, MARKETPLACE_IDS, MARKETPLACES, marketplaceById, marketplacesFor } from './marketplaces'

describe('marketplaces', () => {
  it('у каждой площадки заполнены все поля', () => {
    for (const m of MARKETPLACES) {
      expect(m.id.length, m.id).toBeGreaterThan(0)
      expect(m.labelKey.length, m.id).toBeGreaterThan(0)
      expect(m.sourceUrl.startsWith('http'), m.id).toBe(true)
      expect(typeof m.confirmed, m.id).toBe('boolean')
      expect(m.image.target.width, m.id).toBeGreaterThan(0)
      expect(m.image.target.height, m.id).toBeGreaterThan(0)
      expect(m.image.minWidth, m.id).toBeGreaterThan(0)
      expect(m.image.minHeight, m.id).toBeGreaterThan(0)
      expect(m.image.maxBytes, m.id).toBeGreaterThan(0)
      expect(m.image.maxImages, m.id).toBeGreaterThan(0)
      expect(['jpeg', 'png']).toContain(m.image.format)
      expect(m.image.aspect[0], m.id).toBeGreaterThan(0)
      expect(m.image.aspect[1], m.id).toBeGreaterThan(0)
      expect(m.listing.titleMax, m.id).toBeGreaterThan(0)
      expect(m.listing.descriptionMax, m.id).toBeGreaterThan(0)
      expect(m.listing.bulletCount, m.id).toBeGreaterThanOrEqual(0)
      expect(m.listing.tagCount, m.id).toBeGreaterThanOrEqual(0)
    }
  })

  it('только Яндекс.Маркет подтверждён первоисточником', () => {
    const confirmed = MARKETPLACES.filter((m) => m.confirmed).map((m) => m.id)
    expect(confirmed).toEqual(['yandexmarket'])
  })

  it('ru-площадки помечены scope ru, остальные global', () => {
    const ru = new Set(MARKETPLACES.filter((m) => m.scope === 'ru').map((m) => m.id))
    expect(ru).toEqual(new Set(['wildberries', 'ozon', 'yandexmarket']))
  })

  it('аспект целевого пака в разумном диапазоне (не квадратнее 1:3, не шире 3:1)', () => {
    for (const m of MARKETPLACES) {
      const ratio = m.image.aspect[0] / m.image.aspect[1]
      expect(ratio, m.id).toBeGreaterThan(1 / 3)
      expect(ratio, m.id).toBeLessThan(3)
    }
  })

  it('целевой размер пака совпадает по аспекту с полем aspect (с точностью до округления)', () => {
    for (const m of MARKETPLACES) {
      const wantRatio = m.image.aspect[0] / m.image.aspect[1]
      const gotRatio = m.image.target.width / m.image.target.height
      expect(Math.abs(wantRatio - gotRatio), m.id).toBeLessThan(0.02)
    }
  })

  it('Ozon и Wildberries продают то, что видно в выдаче: аспект пака 3:4, не 1:1', () => {
    expect(marketplaceById('ozon').image.aspect).toEqual([3, 4])
    expect(marketplaceById('wildberries').image.aspect).toEqual([3, 4])
  })

  it('marketplacesFor(en) не показывает русские площадки', () => {
    const en = marketplacesFor('en')
    expect(en.some((m) => m.scope === 'ru')).toBe(false)
    expect(en.length).toBeGreaterThan(0)
  })

  it('marketplacesFor(ru) показывает все площадки', () => {
    expect(marketplacesFor('ru')).toHaveLength(MARKETPLACES.length)
  })

  it('marketplaceById возвращает верную запись, MARKETPLACE_IDS согласован со списком', () => {
    expect(MARKETPLACE_IDS).toHaveLength(MARKETPLACES.length)
    for (const id of MARKETPLACE_IDS) {
      expect(marketplaceById(id).id).toBe(id)
    }
  })

  it('DEFAULT_MARKETPLACE - валидный id из справочника', () => {
    expect(MARKETPLACE_IDS).toContain(DEFAULT_MARKETPLACE)
  })
})
