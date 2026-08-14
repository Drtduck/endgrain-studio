'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { APP_ORIGIN } from '@/lib/routing/host'
import { PROFILE_BIO_MAX, PROFILE_DISPLAY_NAME_MAX, PROFILE_DISPLAY_NAME_MIN, PROFILE_WEBSITE_MAX } from '@/lib/profile/types'
import type { Profile } from '@/lib/profile/types'
import { getAccountIdentity, getCurrentUser } from '@/lib/supabase/session'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

/**
 * Server actions страницы «Аккаунт» (app/account/page.tsx). Публичный профиль
 * (display_name/bio/website/notify_email) пишется под обычной cookie-сессией:
 * у profiles есть update-политика на свою строку (миграция 20260814100000),
 * service-role тут не нужен. Смена почты/пароля и удаление аккаунта идут через
 * auth-методы Supabase - удаление отдельно требует service-role
 * (auth.admin.deleteUser), поэтому тем же приёмом, что revokeApiKeyAction.
 */

export type ProfileError = 'unauthenticated' | 'invalid' | 'taken' | 'failed' | 'googleOnly' | 'noPassword' | 'unavailable' | 'confirmMismatch'
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

  const sb = await getSupabaseServer()
  const { data, error } = await sb
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
    .select('user_id, display_name, bio, website, notify_email, created_at')
    .single()

  if (error || !data) return { ok: false, error: 'failed' }

  return {
    ok: true,
    data: {
      userId: String(data.user_id),
      displayName: data.display_name === null ? null : String(data.display_name),
      bio: data.bio === null ? null : String(data.bio),
      website: data.website === null ? null : String(data.website),
      notifyEmail: Boolean(data.notify_email),
      createdAt: String(data.created_at),
    },
  }
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

/** Смена пароля. Требует, чтобы у аккаунта уже был provider email (см. changeEmailAction). */
export async function changePasswordAction(password: string): Promise<ProfileResult<null>> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const parsed = passwordSchema.safeParse(password)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const identity = await getAccountIdentity()
  if (!identity?.hasPassword) return { ok: false, error: 'noPassword' }

  const sb = await getSupabaseServer()
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
