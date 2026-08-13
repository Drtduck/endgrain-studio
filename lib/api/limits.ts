/**
 * Чистые числа тарифа API, без единого импорта. Тот же приём, что в
 * lib/stripe/limits.ts: значения читает и сервер (проверка лимита), и клиент
 * (страница ключей, тарифы), а сервисный слой с секретами импортировать
 * из клиентского кода нельзя.
 */

export type ApiTier = 'free' | 'developer'

/** Запросов в сутки UTC на один ключ. */
export const API_DAILY_LIMIT: Record<ApiTier, number> = {
  free: 50,
  developer: 2000,
}

/** Сколько активных ключей держит аккаунт. Защита от бесконечного обхода лимита новыми ключами. */
export const API_KEYS_PER_USER: Record<ApiTier, number> = {
  free: 2,
  developer: 10,
}
