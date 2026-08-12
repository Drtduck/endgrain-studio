import { cache } from 'react'
import { isSupabaseConfigured } from './config'
import { getSupabaseServer } from './server'

export interface SessionUser {
  readonly id: string
  readonly email: string
}

/**
 * Текущий пользователь, мемоизированный на один серверный рендер (react cache,
 * не unstable_cache: cookies читать можно). Возвращаем узкий тип, а не User из
 * supabase-js: в клиентский контекст не должно уехать ничего лишнего.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = await getSupabaseServer()
    const { data } = await sb.auth.getUser()
    const user = data.user
    if (!user) return null
    return { id: user.id, email: user.email ?? '' }
  } catch {
    // Supabase лежит или сеть моргнула: студия обязана открыться и без аккаунта.
    return null
  }
})
