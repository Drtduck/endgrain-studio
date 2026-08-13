/**
 * Чистая арифметика бесплатного тира: подпись гостевой cookie, хеш адреса,
 * сборка списка субъектов. Ни одного похода в сеть или в Supabase - запись
 * в базу живёт в entitlements.ts, а этот файл целиком покрывается юнит-тестом.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { FREE_TRIAL_IP_LIMIT, FREE_TRIAL_LIMIT } from './quota'

/** Имя cookie гостя. Ставится лениво, в server action, при первом обращении к AI. */
export const FREE_TRIAL_COOKIE_NAME = 'egs_ft'
/** Пробные генерации не сгорают, но cookie браузера не вечная: год - разумный срок жизни. */
export const FREE_TRIAL_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365

export type FreeSubjectKind = 'user' | 'guest' | 'ip'

export interface FreeSubject {
  readonly kind: FreeSubjectKind
  readonly id: string
  readonly limit: number
}

function hmacOf(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

/** Новый uuid гостя. Отдельная функция, чтобы entitlements не импортировал crypto напрямую. */
export function createGuestId(): string {
  return randomUUID()
}

/** Значение cookie egs_ft: <uuid>.<hmac-sha256 base64url>. */
export function signGuestCookie(secret: string, guestId: string): string {
  return `${guestId}.${hmacOf(secret, guestId)}`
}

/**
 * Разбор и проверка cookie. Возвращает uuid, только если подпись сходится:
 * голую cookie подделывают новым uuid на каждый запрос, и субъект guest
 * перестаёт что-либо значить, поэтому неподписанное или битое значение
 * отбрасывается целиком, а не читается как есть.
 */
export function verifyGuestCookie(secret: string, cookieValue: string | null | undefined): string | null {
  if (secret.length === 0 || cookieValue === null || cookieValue === undefined || cookieValue.length === 0) return null
  const dot = cookieValue.indexOf('.')
  if (dot <= 0) return null
  const guestId = cookieValue.slice(0, dot)
  const signature = cookieValue.slice(dot + 1)
  const expected = hmacOf(secret, guestId)

  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return null
  try {
    return timingSafeEqual(a, b) ? guestId : null
  } catch {
    return null
  }
}

/**
 * Хеш адреса, а не сам адрес: в базе не должно лежать персональных данных.
 * Секрет в хеше нужен, чтобы по таблице нельзя было перебрать диапазон
 * адресов offline.
 */
export function hashIp(secret: string, ip: string): string {
  return createHash('sha256').update(`${secret}:${ip}`).digest('hex')
}

/**
 * Список субъектов, по которым списывается попытка, и все сразу.
 * Залогиненный без Pro: [user, ip]. Гость: [guest, ip]. guestId это уже
 * проверенный uuid из cookie либо только что созданный ленивый - решение,
 * какой из них передать, принимает вызывающий код.
 */
export function freeSubjects(input: {
  readonly secret: string
  readonly userId: string | null
  readonly guestId: string | null
  readonly ip: string
}): readonly FreeSubject[] {
  const ipSubject: FreeSubject = { kind: 'ip', id: hashIp(input.secret, input.ip), limit: FREE_TRIAL_IP_LIMIT }

  if (input.userId !== null) return [{ kind: 'user', id: input.userId, limit: FREE_TRIAL_LIMIT }, ipSubject]
  if (input.guestId !== null) return [{ kind: 'guest', id: input.guestId, limit: FREE_TRIAL_LIMIT }, ipSubject]
  return [ipSubject]
}
