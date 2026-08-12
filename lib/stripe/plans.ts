import { STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY } from './config'

export type PlanId = 'monthly' | 'yearly'

/** Сколько проектов в облаке держит бесплатный аккаунт. */
export const FREE_PROJECT_LIMIT = 3

/** Максимальная сторона PNG: обычный экспорт и экспорт для печати. */
export const PNG_MAX_PX_FREE = 2400
export const PNG_MAX_PX_PRO = 4000
export const PNG_SCALE_FREE = 2
export const PNG_SCALE_PRO = 4

export function priceIdFor(plan: PlanId): string {
  return plan === 'monthly' ? STRIPE_PRICE_MONTHLY : STRIPE_PRICE_YEARLY
}

/**
 * Обратное сопоставление для вебхука: событие приносит id цены, а в таблицу
 * мы кладём человеческое 'monthly' | 'yearly'. Пустая строка не совпадает ни с чем
 * сознательно: без ключей обе переменные пусты, и пустой price id из чужого
 * события иначе притворился бы месячным планом.
 */
export function planForPriceId(priceId: string): PlanId | null {
  if (priceId.length === 0) return null
  if (STRIPE_PRICE_MONTHLY.length > 0 && priceId === STRIPE_PRICE_MONTHLY) return 'monthly'
  if (STRIPE_PRICE_YEARLY.length > 0 && priceId === STRIPE_PRICE_YEARLY) return 'yearly'
  return null
}
