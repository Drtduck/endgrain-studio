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

export interface AccountIdentity {
  /** Провайдеры, привязанные к аккаунту: 'email', 'google' и т.д. */
  readonly providers: readonly string[]
  /** Есть ли провайдер 'email' - только тогда осмысленны смена/задание пароля. */
  readonly hasPassword: boolean
  /** Единственный провайдер - google-identity, свою почту в Supabase не меняет и пароль не задаёт. */
  readonly googleOnly: boolean
}

/**
 * Список identities для страницы «Аккаунт»: раздел почты и пароля должен
 * знать, чем вошёл человек, до того как предлагать смену пароля или email
 * (у входа через Google нет пароля Supabase вовсе). Отдельная функция, а не
 * поле в SessionUser: тип SessionUser used по всему приложению как узкий
 * идентификатор, а identities нужны только на одной странице.
 */
export const getAccountIdentity = cache(async (): Promise<AccountIdentity | null> => {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = await getSupabaseServer()
    const { data } = await sb.auth.getUser()
    const user = data.user
    if (!user) return null
    const providers = (user.identities ?? []).map((identity) => identity.provider)
    const hasPassword = providers.includes('email')
    const googleOnly = providers.length > 0 && providers.every((p) => p === 'google')
    return { providers, hasPassword, googleOnly }
  } catch {
    return null
  }
})
