'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { SessionUser } from '@/lib/supabase/session'

export interface SessionValue {
  readonly user: SessionUser | null
  /** false, когда переменные Supabase не заданы: весь UI аккаунта скрыт. */
  readonly enabled: boolean
}

const SessionContext = createContext<SessionValue>({ user: null, enabled: false })

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
