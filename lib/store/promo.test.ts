import { beforeEach, describe, expect, it } from 'vitest'
import { isDownloadable, usePromoStore } from './promo'
import type { PromoShotView } from '@/lib/promo/types'

function shot(overrides: Partial<PromoShotView> = {}): PromoShotView {
  return {
    id: 'shot-1',
    seriesId: 'series-1',
    kindSlug: 'hero',
    ordinal: 0,
    status: 'queued',
    parentShotId: null,
    variantNo: 1,
    editPrompt: null,
    url: null,
    width: null,
    height: null,
    provider: null,
    prompt: null,
    error: null,
    retries: 0,
    ...overrides,
  }
}

beforeEach(() => {
  usePromoStore.getState().reset()
  usePromoStore.setState({ marketplace: 'amazon' })
})

describe('usePromoStore', () => {
  it('upsertShot не теряет варианты: root и правка живут в сторе одновременно', () => {
    const root = shot({ id: 'root', status: 'done' })
    const variant = shot({ id: 'variant', parentShotId: 'root', variantNo: 2, status: 'done' })
    usePromoStore.getState().upsertShot(root)
    usePromoStore.getState().upsertShot(variant)
    const shots = Object.values(usePromoStore.getState().shotsById)
    expect(shots.map((s) => s.id).sort()).toEqual(['root', 'variant'])
  })

  it('upsertShot по тому же id заменяет запись, а не дублирует', () => {
    usePromoStore.getState().upsertShot(shot({ id: 'a', status: 'queued' }))
    usePromoStore.getState().upsertShot(shot({ id: 'a', status: 'done' }))
    const shots = Object.values(usePromoStore.getState().shotsById)
    expect(shots).toHaveLength(1)
    expect(shots[0]?.status).toBe('done')
  })

  it('selectAll берёт только done, не queued/running/failed', () => {
    usePromoStore.getState().upsertShot(shot({ id: 'done-1', status: 'done' }))
    usePromoStore.getState().upsertShot(shot({ id: 'queued-1', status: 'queued' }))
    usePromoStore.getState().upsertShot(shot({ id: 'failed-1', status: 'failed' }))
    usePromoStore.getState().selectAll()
    expect(usePromoStore.getState().selectedShotIds).toEqual(new Set(['done-1']))
  })

  it('deselectAll очищает выбор', () => {
    usePromoStore.getState().upsertShot(shot({ id: 'done-1', status: 'done' }))
    usePromoStore.getState().selectAll()
    usePromoStore.getState().deselectAll()
    expect(usePromoStore.getState().selectedShotIds.size).toBe(0)
  })

  it('toggleShot переключает членство', () => {
    usePromoStore.getState().toggleShot('x')
    expect(usePromoStore.getState().selectedShotIds.has('x')).toBe(true)
    usePromoStore.getState().toggleShot('x')
    expect(usePromoStore.getState().selectedShotIds.has('x')).toBe(false)
  })

  it('setMarketplace меняет площадку, стор - один источник истины для пака и листинга', () => {
    usePromoStore.getState().setMarketplace('ozon')
    expect(usePromoStore.getState().marketplace).toBe('ozon')
  })

  it('isDownloadable истинно только для done', () => {
    expect(isDownloadable(shot({ status: 'done' }))).toBe(true)
    expect(isDownloadable(shot({ status: 'queued' }))).toBe(false)
    expect(isDownloadable(shot({ status: 'failed' }))).toBe(false)
  })
})
