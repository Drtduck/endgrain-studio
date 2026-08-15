'use client'

import { create } from 'zustand'
import { readAiAccessAction } from '@/app/actions/credits'
import type { AiAccess } from '@/lib/ai/quota'

/**
 * Свежий остаток кадров поверх снапшота из ProProvider (баг ручной приёмки
 * 15.08.2026). Состояние доступа считает серверный layout ровно один раз, на
 * загрузку страницы, и после генерации серии счётчик под кнопкой продолжал
 * показывать старое число: человек видел «Осталось 7 кадров», жал генерацию и
 * упирался в отказ сервера, у которого на балансе было два.
 *
 * Стор отдельный, а не поле в ProProvider: провайдер получает значение пропсом
 * с сервера и по своей природе неизменяем в пределах рендера страницы, а
 * перечитать остаток нужно из любой панели, которая только что списала кадры.
 * null значит «после загрузки страницы ничего не списывали» - тогда в силе
 * серверный снапшот.
 */
export interface AiAccessStoreState {
  readonly access: AiAccess | null
  /** Перечитывает остаток с сервера. Ошибку глотает: счётчик не повод падать. */
  refresh(): Promise<void>
}

export const useAiAccessStore = create<AiAccessStoreState>((set) => ({
  access: null,

  refresh: async () => {
    try {
      const fresh = await readAiAccessAction()
      // mock/unavailable значат «считать нечем» (нет ключей или лежит база), а не
      // «кадры кончились»: перекрывать таким состоянием честный серверный снапшот
      // нельзя, иначе панель вместо цифры покажет замок на пустом месте.
      if (fresh.state === 'mock' || fresh.state === 'unavailable') return
      set({ access: fresh })
    } catch (err) {
      console.error('readAiAccessAction failed', err)
    }
  },
}))
