/**
 * Профиль пользователя: display_name/bio/website публичны (см. RLS и
 * column-grant в миграции 20260814100000_profiles.sql), notify_email видна
 * только владельцу через authenticated-грант той же миграции.
 */
export interface Profile {
  readonly userId: string
  readonly displayName: string | null
  readonly bio: string | null
  readonly website: string | null
  readonly notifyEmail: boolean
  readonly createdAt: string
}

/** Публичное подмножество профиля: то, что видит анонимный посетитель /u/[id] и галерея. */
export interface PublicProfile {
  readonly userId: string
  readonly displayName: string | null
  readonly bio: string | null
  readonly website: string | null
  readonly createdAt: string
}

export const PROFILE_DISPLAY_NAME_MIN = 2
export const PROFILE_DISPLAY_NAME_MAX = 40
export const PROFILE_BIO_MAX = 280
export const PROFILE_WEBSITE_MAX = 200
