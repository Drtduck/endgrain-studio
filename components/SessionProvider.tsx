'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { SessionUser } from '@/lib/supabase/session'

export interface SessionValue {
  readonly user: SessionUser | null
  /** false, когда переменные Supabase не заданы: весь UI аккаунта скрыт. */
  readonly enabled: boolean
  /**
   * profiles.avatar_url текущего пользователя для аватара в шапке. Живёт
   * рядом с user, а не в SessionUser: SessionUser - узкий идентификатор из
   * auth, а картинка приезжает из таблицы profiles. Поле необязательное,
   * чтобы старые вызовы провайдера (тесты, сторибуки) не ломались.
   */
  readonly avatarUrl?: string | null
}

const SessionContext = createContext<SessionValue>({ user: null, enabled: false, avatarUrl: null })

export function SessionProvider({ value, children }: { value: SessionValue; children: ReactNode }) {
  return <SessionContext value={value}>{children}</SessionContext>
}

/**
 * Пользователь приезжает пропсом из серверного layout, а не запрашивается
 * эффектом: так нет ни мигания «гость -> вошёл», ни setState в useEffect,
 * который запрещён правилом react-hooks/set-state-in-effect.
 */
export function useSession(): SessionValue {
  return useContext(SessionContext)
}
