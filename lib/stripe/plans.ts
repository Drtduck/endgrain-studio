import { STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY } from './config'

export type PlanId = 'monthly' | 'yearly'

// Числовые лимиты живут в ./limits: их читают клиентские компоненты, а этот
// модуль импортирует ./config с серверными ключами.

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
