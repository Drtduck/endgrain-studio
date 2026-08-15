'use client'

import { create } from 'zustand'
import type { ProjectSummary } from '@/lib/supabase/types'

/**
 * Общий источник истины для списка «Мои проекты» между ProjectsPanel и
 * SaveProjectButton (мелочь 2, приёмка 15.08.2026): раньше список жил только
 * локальным useState внутри ProjectsPanel, и сохранение из кнопки в редакторе
 * (SaveProjectButton) не имело способа сообщить панели о новом/обновлённом
 * проекте без useEffect+setState (запрещённый в этом компоненте паттерн, см.
 * комментарий в ProjectsPanel.tsx про react-hooks/set-state-in-effect). Список
 * теперь пишется в один общий стор из обеих точек сохранения, без единого эффекта.
 */
export interface ProjectsStoreState {
  readonly items: readonly ProjectSummary[]
  /** true после первой успешной загрузки: отличает "ещё не грузили" от "пусто". */
  readonly loaded: boolean
  setItems(items: readonly ProjectSummary[]): void
  /** Добавляет новый проект сверху или обновляет существующий по id (upsert). */
  upsertItem(item: ProjectSummary): void
  removeItem(id: string): void
  /** Отмечает "загрузка была", не трогая items - для отказавшего обновления. */
  markLoaded(): void
}

export const useProjectsStore = create<ProjectsStoreState>((set) => ({
  items: [],
  loaded: false,

  setItems: (items) => { set({ items, loaded: true }) },

  upsertItem: (item) => {
    set((state) => {
      const exists = state.items.some((i) => i.id === item.id)
      return { items: exists ? state.items.map((i) => (i.id === item.id ? item : i)) : [item, ...state.items] }
    })
  },

  removeItem: (id) => {
    set((state) => ({ items: state.items.filter((i) => i.id !== id) }))
  },

  markLoaded: () => { set({ loaded: true }) },
}))
