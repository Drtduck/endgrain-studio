'use client'

import { create } from 'zustand'
import { DEFAULT_MARKETPLACE, type MarketplaceId } from '@/lib/promo/marketplaces'
import type { PromoShotKind, PromoShotView } from '@/lib/promo/types'

/**
 * Один источник истины для вкладки «Промо» между PhotoSeries/ReferenceShots
 * (пишут кадры сюда), PackDownload и ListingEditor (читают отсюда): площадка
 * выбирается один раз и одинаково видна в обоих местах (спека 8.5,
 * `listing-marketplace` - "общий со списком паков"), а выбор кадров для пака
 * и для карточки товара - один и тот же набор (спека 8.2).
 *
 * shotsById копит ВСЕ кадры текущей сессии по всем сериям (пресеты, референс,
 * правки): useSeriesRunner.upsertShot зеркалит сюда каждый апдейт, поэтому
 * variantы правки (source='edit', отдельная серия) не теряются здесь, даже
 * когда локальный runner конкретной панели про них не знает.
 */
export interface PromoStoreState {
  readonly marketplace: MarketplaceId
  readonly shotsById: Readonly<Record<string, PromoShotView>>
  readonly selectedShotIds: ReadonlySet<string>
  /**
   * Выбор пресетов серии кадров (PhotoSeries). null значит «человек ещё ничего
   * не выбирал руками»: панель тогда рисует набор по умолчанию, а гидратация
   * прошлой серии имеет право его заменить. Как только выбор сделан руками, он
   * живёт здесь и переживает уход на другую вкладку - PromoPanel вместе с
   * PhotoSeries размонтируется целиком (StudioShell рисует одну вкладку за раз),
   * и локальный useState умирал вместе с ним, откатывая выбор к дефолтным
   * четырём кадрам. Баг ручной приёмки 15.08.2026: «Спишется 4» вместо одного.
   */
  readonly selectedKinds: readonly PromoShotKind[] | null
  setMarketplace(id: MarketplaceId): void
  setSelectedKinds(kinds: readonly PromoShotKind[]): void
  upsertShot(shot: PromoShotView): void
  toggleShot(id: string): void
  selectAll(): void
  deselectAll(): void
  reset(): void
}

/** Кадр можно скачать паком или использовать в тексте листинга только когда он готов. */
export function isDownloadable(shot: PromoShotView): boolean {
  return shot.status === 'done'
}

export const usePromoStore = create<PromoStoreState>((set, get) => ({
  marketplace: DEFAULT_MARKETPLACE,
  shotsById: {},
  selectedShotIds: new Set(),
  selectedKinds: null,

  setMarketplace: (id) => { set({ marketplace: id }) },

  setSelectedKinds: (kinds) => { set({ selectedKinds: [...kinds] }) },

  upsertShot: (shot) => {
    set((state) => ({ shotsById: { ...state.shotsById, [shot.id]: shot } }))
  },

  toggleShot: (id) => {
    set((state) => {
      const next = new Set(state.selectedShotIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedShotIds: next }
    })
  },

  selectAll: () => {
    const done = Object.values(get().shotsById).filter(isDownloadable)
    set({ selectedShotIds: new Set(done.map((shot) => shot.id)) })
  },

  deselectAll: () => { set({ selectedShotIds: new Set() }) },

  reset: () => { set({ shotsById: {}, selectedShotIds: new Set(), selectedKinds: null }) },
}))
