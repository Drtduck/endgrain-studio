/**
 * Чистая обвязка вокруг аватара-картинки: путь объекта в bucket, публичная
 * ссылка на него и проверка, что присланная ссылка ведёт именно в свою папку
 * своего bucket. Файл намеренно без 'server-only' и без обращений к сети:
 * одни и те же правила нужны и клиентской форме (components/account/AvatarPicker),
 * и server action (app/actions/profile.ts, updateAvatarAction), который считает
 * присланную строку недоверенной.
 */

export const AVATAR_BUCKET = 'avatars'

/** Сторона квадрата после ресайза в canvas: аватар нигде не рисуется крупнее. */
export const AVATAR_SIZE_PX = 256

/** Предел на исходный файл до ресайза, синхронен file_size_limit в миграции 20260814170000. */
export const AVATAR_MAX_BYTES = 1_048_576

/** Ограничение колонки profiles.avatar_url (constraint profiles_avatar_url_len). */
export const AVATAR_URL_MAX = 512

/** Синхронен allowed_mime_types bucket avatars в той же миграции. */
export const AVATAR_ALLOWED_MIME: readonly string[] = ['image/png', 'image/jpeg', 'image/webp']

const STORAGE_PUBLIC_PREFIX = '/storage/v1/object/public'

/**
 * Один объект на пользователя, путь фиксированный. Загрузка идёт с upsert, так
 * что старые картинки не копятся мусором в bucket, а свежесть в браузере даёт
 * query-параметр версии (см. avatarPublicUrl).
 */
export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar.png`
}

/**
 * Публичная ссылка на объект. Параметр version дописывается query-строкой:
 * путь у объекта постоянный, и без него браузер показывал бы старую картинку
 * из кеша после замены аватара.
 */
export function avatarPublicUrl(supabaseUrl: string, path: string, version?: number): string {
  const base = `${supabaseUrl.replace(/\/+$/, '')}${STORAGE_PUBLIC_PREFIX}/${AVATAR_BUCKET}/${path}`
  return version === undefined ? base : `${base}?v=${String(version)}`
}

/** Пробел или управляющий символ в строке ссылки: признак склейки руками, а не ответа Storage. */
function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code <= 0x20 || code === 0x7f) return true
  }
  return false
}

/**
 * Ссылка на аватар, которой можно верить. Проверка нужна потому, что значение
 * приходит от клиента: без неё в profiles.avatar_url легла бы любая чужая
 * ссылка (в лучшем случае трекинг-пиксель на чужом хосте в каждой карточке
 * галереи, в худшем - подмена своего аватара чужим объектом того же bucket).
 *
 * Проходят ровно два вида: относительный путь нашего же домена и абсолютный
 * https-адрес публичного объекта bucket avatars внутри папки {userId}/.
 * Протокол-относительный '//host' относительным путём не считается - это
 * чужой origin в маскировке.
 */
export function isOwnAvatarUrl(value: string, userId: string, supabaseUrl: string): boolean {
  if (userId.length === 0) return false
  if (value.length === 0 || value.length > AVATAR_URL_MAX) return false
  if (hasUnsafeChars(value)) return false

  if (value.startsWith('//')) return false
  if (value.startsWith('/')) return !value.includes('..')

  if (supabaseUrl.length === 0) return false
  let parsed: URL
  let base: URL
  try {
    parsed = new URL(value)
    base = new URL(supabaseUrl)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.host !== base.host) return false

  const expected = `${STORAGE_PUBLIC_PREFIX}/${AVATAR_BUCKET}/${userId}/`
  if (!parsed.pathname.startsWith(expected)) return false
  // '..' увёл бы объект из своей папки, а хост Storage отдал бы его уже после
  // нормализации пути на своей стороне.
  return !parsed.pathname.includes('..')
}
