/**
 * Обход оплаты по списку адресов. Нужен ровно для конкурса: жюри и автору надо
 * выдать Pro без реальной карты, а Stripe в это время работает в тестовом режиме.
 *
 * Переменные серверные, без NEXT_PUBLIC: список адресов в клиентский бандл
 * уезжать не должен, да и проверяется он только на сервере, в getProStatus.
 *
 * Имя AI_ALLOWLIST_EMAILS историческое: список заводился ради AI-фич, но даёт
 * полный Pro. Иначе пришлось бы держать две почти одинаковые сущности, а на
 * демонстрации жюри всё равно нужен весь Pro целиком, а не одна вкладка.
 */

const RAW_ALLOWLIST: string = process.env['AI_ALLOWLIST_EMAILS'] ?? ''

/**
 * Серверный аналог NEXT_PUBLIC_PRO_UNLOCK. Публичный флаг инлайнится в бандл и
 * годится, чтобы открыть интерфейс, но серверный гейт должен читать переменную,
 * которой в браузере нет вовсе.
 */
const RAW_UNLOCK_ALL: string = process.env['PRO_UNLOCK_ALL'] ?? ''

/** Чистое ядро: разбор списка и сравнение. Регистр и пробелы значения не имеют. */
export function parseAllowlist(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
}

export function matchesAllowlist(email: string | null | undefined, raw: string): boolean {
  const normalized = (email ?? '').trim().toLowerCase()
  if (normalized.length === 0) return false
  return parseAllowlist(raw).includes(normalized)
}

/** Есть ли адрес в списке из окружения. */
export function isAllowlistedEmail(email: string | null | undefined): boolean {
  return matchesAllowlist(email, RAW_ALLOWLIST)
}

/** Открыт ли Pro всем серверной переменной PRO_UNLOCK_ALL=1. */
export function isProUnlockedForAll(): boolean {
  return RAW_UNLOCK_ALL === '1'
}
