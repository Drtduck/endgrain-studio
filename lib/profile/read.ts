import 'server-only'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import type { Profile, PublicProfile } from './types'

/**
 * Чтение профилей идёт всегда через обычный user-context клиент (RLS открыт
 * на select всем строкам, см. миграцию 20260814100000): анониму на /u/[id] и
 * авторам в галерее service-role тут не нужен, это то же самое, что и
 * getPublishedProject в lib/gallery/list.ts.
 */
const PUBLIC_COLUMNS = 'user_id, display_name, bio, website, created_at'

interface ProfileRow {
  readonly user_id: unknown
  readonly display_name: unknown
  readonly bio: unknown
  readonly website: unknown
  readonly created_at: unknown
}

function toPublicProfile(row: ProfileRow): PublicProfile {
  return {
    userId: String(row.user_id),
    displayName: row.display_name === null ? null : String(row.display_name),
    bio: row.bio === null ? null : String(row.bio),
    website: row.website === null ? null : String(row.website),
    createdAt: String(row.created_at),
  }
}

/**
 * Собственный профиль владельца, включая notify_email: authenticated-грант
 * миграции 20260814100000 открывает эту колонку только своей строке через RLS,
 * анониму и на /u/[id] notify_email не должна быть видна вовсе, поэтому это
 * отдельная функция, а не расширение getProfile.
 */
export async function getOwnProfile(userId: string): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb
      .from('profiles')
      .select('user_id, display_name, bio, website, notify_email, created_at')
      .eq('user_id', userId)
      .maybeSingle()
    if (error || !data) return null
    return {
      userId: String(data.user_id),
      displayName: data.display_name === null ? null : String(data.display_name),
      bio: data.bio === null ? null : String(data.bio),
      website: data.website === null ? null : String(data.website),
      notifyEmail: Boolean(data.notify_email),
      createdAt: String(data.created_at),
    }
  } catch (err) {
    console.error('getOwnProfile failed', err)
    return null
  }
}

/** Публичный профиль одного автора. null, если строки ещё нет (профиль не заполнялся). */
export async function getProfile(userId: string): Promise<PublicProfile | null> {
  if (!isSupabaseConfigured()) return null
  try {
    const sb = await getSupabaseServer()
    const { data, error } = await sb.from('profiles').select(PUBLIC_COLUMNS).eq('user_id', userId).maybeSingle()
    if (error || !data) return null
    return toPublicProfile(data as unknown as ProfileRow)
  } catch (err) {
    console.error('getProfile failed', err)
    return null
  }
}

/**
 * Профили батчем по списку id: AuthorLine в карточках галереи не должен ходить
 * в базу по одному профилю на карточку. Отсутствующая строка не попадает в
 * карту - вызывающая сторона сама решает, что показать автору без профиля.
 */
export async function getProfiles(userIds: readonly string[]): Promise<ReadonlyMap<string, PublicProfile>> {
  if (!isSupabaseConfigured() || userIds.length === 0) return new Map()
  try {
    const sb = await getSupabaseServer()
    const ids = [...new Set(userIds)]
    const { data, error } = await sb.from('profiles').select(PUBLIC_COLUMNS).in('user_id', ids)
    if (error || !data) return new Map()
    const rows = data as unknown as ProfileRow[]
    return new Map(rows.map((row) => [String(row.user_id), toPublicProfile(row)]))
  } catch (err) {
    console.error('getProfiles failed', err)
    return new Map()
  }
}
