'use client'

import { create } from 'zustand'

/**
 * Состояние глобального индикатора навигации.
 *
 * Роутер App Router своих событий наружу не даёт, поэтому переход отмечают две
 * стороны: ссылка сообщает о старте через onNavigate у next/link (срабатывает
 * синхронно на клике и только для клиентской навигации), а завершение ловит
 * NavProgress по смене pathname/searchParams. Стор нужен, чтобы эти две точки
 * не были связаны пропсами через полдерева.
 */
interface NavState {
  readonly active: boolean
  /** Номер перехода: меняется на каждом старте и перезапускает CSS-анимацию полоски. */
  readonly run: number
  /** Клик по ссылке: полоска должна появиться сразу, до ответа сервера. */
  readonly start: () => void
  /** Маршрут доехал (или сработал предохранитель по таймауту). */
  readonly done: () => void
}

export const useNavProgress = create<NavState>((set) => ({
  active: false,
  run: 0,
  start: () => set((s) => ({ active: true, run: s.run + 1 })),
  done: () => set((s) => (s.active ? { active: false } : s)),
}))

/** Старт перехода из мест, где хук вызвать негде (обработчики, render-пропсы). */
export function startNavProgress(): void {
  useNavProgress.getState().start()
}
