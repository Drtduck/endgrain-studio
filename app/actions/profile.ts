'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { APP_ORIGIN } from '@/lib/routing/host'
import { isOwnAvatarUrl } from '@/lib/profile/avatar'
import { PROFILE_BIO_MAX, PROFILE_DISPLAY_NAME_MAX, PROFILE_DISPLAY_NAME_MIN, PROFILE_WEBSITE_MAX } from '@/lib/profile/types'
import type { Profile } from '@/lib/profile/types'
import { getAccountIdentity, getCurrentUser } from '@/lib/supabase/session'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

/**
 * Server actions страницы «Аккаунт» (app/account/page.tsx). Публичный профиль
 * (display_name/bio/website/notify_email) пишется service-role клиентом
 * (getSupabaseService): PostgREST-upsert с onConflict компилирует
 * INSERT ... ON CONFLICT DO UPDATE, а RETURNING этого запроса требует
 * table-level SELECT-привилегию - у роли authenticated её нет и не будет
 * (column-grant в миграции 20260814100000 намеренно режет notify_email,
 * иначе select с policy using(true) отдавал бы чужую приватную настройку
 * уведомлений). Расширять гранты нельзя, поэтому сама запись идёт мимо
 * PostgREST-роли authenticated: user.id берётся из серверной сессии
 * (getCurrentUser), валидация полей остаётся здесь же, а пишется строго
 * в свою строку - client input на user_id никогда не влияет. Смена
 * почты/пароля и удаление аккаунта идут через auth-методы Supabase -
 * удаление отдельно требует service-role (auth.admin.deleteUser), поэтому
 * тем же приёмом, что revokeApiKeyAction.
 */

export type ProfileError =
  | 'unauthenticated'
  | 'invalid'
  | 'taken'
  | 'failed'
  | 'googleOnly'
  | 'noPassword'
  | 'unavailable'
  | 'confirmMismatch'
  | 'wrongPassword'
export type ProfileResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ProfileError }

const displayNameSchema = z.string().trim().min(PROFILE_DISPLAY_NAME_MIN).max(PROFILE_DISPLAY_NAME_MAX)
const bioSchema = z.string().trim().max(PROFILE_BIO_MAX)
const websiteSchema = z.string().trim().max(PROFILE_WEBSITE_MAX).regex(/^https?:\/\//i)
const emailSchema = z.string().trim().email()
const passwordSchema = z.string().min(8)

export interface UpdateProfileInput {
  readonly displayName: string
  readonly bio: string
  readonly website: string
  readonly notifyEmail: boolean
}

/**
 * Upsert по user_id: первая правка профиля создаёт строку, следующие обновляют
 * её же. Пустые bio/website хранятся как null - в базе это осмысленное «не
 * заполнено», а не пустая строка, которую пришлось бы отдельно проверять
 * на публичной странице.
 */
export async function updateProfileAction(input: UpdateProfileInput): Promise<ProfileResult<Profile>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const nameParsed = displayNameSchema.safeParse(input.displayName)
  if (!nameParsed.success) return { ok: false, error: 'invalid' }

  const bioTrimmed = input.bio.trim()
  if (bioTrimmed.length > 0) {
    const bioParsed = bioSchema.safeParse(bioTrimmed)
    if (!bioParsed.success) return { ok: false, error: 'invalid' }
  }

  const websiteTrimmed = input.website.trim()
  if (websiteTrimmed.length > 0) {
    const websiteParsed = websiteSchema.safeParse(websiteTrimmed)
    if (!websiteParsed.success) return { ok: false, error: 'invalid' }
  }

  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }
  const service = getSupabaseService()
  const { data, error } = await service
    .from('profiles')
    .upsert(
      {
        user_id: user.id,
        display_name: nameParsed.data,
        bio: bioTrimmed.length > 0 ? bioTrimmed : null,
        website: websiteTrimmed.length > 0 ? websiteTrimmed : null,
        notify_email: input.notifyEmail,
      },
      { onConflict: 'user_id' },
    )
    // notify_email по-прежнему не в RETURNING: сервис-роль обходит RLS и грант,
    // но отдавать приватное поле обратно клиенту незачем - значение, которое
    // мы только что записали, и так известно из input.
    .select('user_id, display_name, bio, website, avatar_url, created_at')
    .single()

  if (error || !data) return { ok: false, error: 'failed' }

  return {
    ok: true,
    data: {
      userId: String(data.user_id),
      displayName: data.display_name === null ? null : String(data.display_name),
      bio: data.bio === null ? null : String(data.bio),
      website: data.website === null ? null : String(data.website),
      avatarUrl: data.avatar_url === null || data.avatar_url === undefined ? null : String(data.avatar_url),
      notifyEmail: input.notifyEmail,
      createdAt: String(data.created_at),
    },
  }
}

/**
 * Аватар: строка avatar_url отдельным действием, а не полем формы профиля.
 * Картинка уезжает в Storage прямо из браузера (bucket avatars, политика
 * avatars_insert_own пускает только в свою папку {user_id}/), сюда приходит
 * уже готовая ссылка - значит она недоверенная и проверяется isOwnAvatarUrl:
 * без проверки в profiles.avatar_url лёг бы произвольный чужой адрес, который
 * потом грузился бы с каждой карточки галереи. null снимает картинку и
 * возвращает инициал.
 *
 * Пишем тем же service-role клиентом, что и updateProfileAction, и по той же
 * причине (RETURNING PostgREST-upsert требует table-level SELECT, которого у
 * authenticated нет). user_id берётся из серверной сессии, upsert трогает
 * только колонку avatar_url - остальные поля профиля остаются как были.
 */
export async function updateAvatarAction(avatarUrl: string | null): Promise<ProfileResult<string | null>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  let value: string | null = null
  if (avatarUrl !== null) {
    const trimmed = avatarUrl.trim()
    if (!isOwnAvatarUrl(trimmed, user.id, SUPABASE_URL)) return { ok: false, error: 'invalid' }
    value = trimmed
  }

  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }
  const service = getSupabaseService()
  const { error } = await service.from('profiles').upsert({ user_id: user.id, avatar_url: value }, { onConflict: 'user_id' })
  if (error) return { ok: false, error: 'failed' }

  return { ok: true, data: value }
}

/**
 * Смена почты. Запрещена, если у аккаунта нет provider'а email (вход только
 * через Google): Supabase не даёт такому пользователю пароль, а без пароля
 * смена почты не подтверждается тем же способом, что у обычного аккаунта.
 */
export async function changeEmailAction(email: string): Promise<ProfileResult<null>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const identity = await getAccountIdentity()
  if (identity?.googleOnly) return { ok: false, error: 'googleOnly' }

  const sb = await getSupabaseServer()
  const { error } = await sb.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${APP_ORIGIN}/auth/callback?next=%2Faccount` },
  )
  if (error) {
    // Supabase не даёт отдельного кода на «email уже занят» в updateUser,
    // но текст ошибки стабильно содержит это по-английски - по нему и различаем,
    // чтобы форма показала осмысленную причину, а не общий «не получилось».
    if (/already|registered|exists|taken/i.test(error.message)) return { ok: false, error: 'taken' }
    return { ok: false, error: 'failed' }
  }
  return { ok: true, data: null }
}

/**
 * Смена пароля. Требует, чтобы у аккаунта уже был provider email (см. changeEmailAction),
 * и текущий пароль: без этой проверки открытая на чужом устройстве сессия (например
 * в интернет-кафе или на общем компьютере) давала бы захватить аккаунт простой сменой
 * пароля - signInWithPassword с текущим паролем подтверждает, что его действительно
 * знает тот, кто меняет.
 */
export async function changePasswordAction(currentPassword: string, password: string): Promise<ProfileResult<null>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const parsed = passwordSchema.safeParse(password)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const identity = await getAccountIdentity()
  if (!identity?.hasPassword) return { ok: false, error: 'noPassword' }

  const sb = await getSupabaseServer()

  const { error: signInError } = await sb.auth.signInWithPassword({ email: user.email, password: currentPassword })
  if (signInError) return { ok: false, error: 'wrongPassword' }

  const { error } = await sb.auth.updateUser({ password: parsed.data })
  if (error) return { ok: false, error: 'failed' }
  return { ok: true, data: null }
}

/**
 * «Задать пароль» для входа через Google: письмо восстановления на текущую
 * почту аккаунта заводит provider email, дальше человек попадает на уже
 * существующую страницу /reset-password (та же, что у forgot-password).
 */
export async function sendSetPasswordAction(): Promise<ProfileResult<null>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (user.email.length === 0) return { ok: false, error: 'failed' }

  const sb = await getSupabaseServer()
  const { error } = await sb.auth.resetPasswordForEmail(user.email, {
    redirectTo: `${APP_ORIGIN}/auth/callback?next=%2Freset-password`,
  })
  if (error) return { ok: false, error: 'failed' }
  return { ok: true, data: null }
}

/**
 * Удаление аккаунта. Подтверждение вводом своей же почты защищает от случайного
 * клика по единственной необратимой кнопке страницы: раздел «опасная зона»
 * дизайна прямо требует ввод почты, а не просто «да/нет» в диалоге.
 * auth.admin.deleteUser доступен только service-role - обычный updateUser его
 * не умеет, поэтому здесь тот же приём, что и revokeApiKeyAction.
 */
export async function deleteAccountAction(confirmEmail: string): Promise<ProfileResult<null>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  if (confirmEmail.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
    return { ok: false, error: 'confirmMismatch' }
  }

  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }
  const service = getSupabaseService()
  const { error } = await service.auth.admin.deleteUser(user.id)
  if (error) return { ok: false, error: 'failed' }

  const sb = await getSupabaseServer()
  await sb.auth.signOut()
  redirect('/')
}
