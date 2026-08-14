import {
  STRIPE_PRICE_API_MONTHLY,
  STRIPE_PRICE_API_YEARLY,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  STRIPE_PRO_DEFAULT_PRICE,
} from './config'

export type PlanId = 'monthly' | 'yearly'

/** Что оплачивает подписка. 'pass' в этот тип не входит: пропуск разовый, у него нет плана. */
export type Product = 'pro' | 'api'

// Числовые лимиты живут в ./limits: их читают клиентские компоненты, а этот
// модуль импортирует ./config с серверными ключами.

export function priceIdFor(plan: PlanId): string {
  return plan === 'monthly' ? STRIPE_PRICE_MONTHLY : STRIPE_PRICE_YEARLY
}

/**
 * Цена, с которой стартует Checkout Session продукта. Для Pro решает
 * STRIPE_PRO_DEFAULT_PRICE (переключатель ветки A/B тумблера upsell из плана
 * тарифной витрины): вторая цена доступна на той же сессии через Upsell,
 * настроенный в Dashboard. Для API - всегда месячная, и это не вкусовщина:
 * upsell в Dashboard настроен веткой B «месячная -> годовая», а тумблер
 * месяц/год Stripe рисует только когда сессия стартует с месячной цены.
 * С годовой в line_items переключателя на Checkout не было вовсе.
 */
export function checkoutPriceFor(product: Product): string {
  if (product === 'api') return STRIPE_PRICE_API_MONTHLY
  return STRIPE_PRO_DEFAULT_PRICE === 'monthly' ? STRIPE_PRICE_MONTHLY : STRIPE_PRICE_YEARLY
}

/**
 * Обратное сопоставление для вебхука: событие приносит id цены, а в таблицу
 * мы кладём человеческое { product; plan }. Пустая строка не совпадает ни с чем
 * сознательно: без ключей все переменные пусты, и пустой price id из чужого
 * события иначе притворился бы известным планом.
 */
export function resolvePriceId(priceId: string): { readonly product: Product; readonly plan: PlanId } | null {
  if (priceId.length === 0) return null
  if (STRIPE_PRICE_MONTHLY.length > 0 && priceId === STRIPE_PRICE_MONTHLY) return { product: 'pro', plan: 'monthly' }
  if (STRIPE_PRICE_YEARLY.length > 0 && priceId === STRIPE_PRICE_YEARLY) return { product: 'pro', plan: 'yearly' }
  if (STRIPE_PRICE_API_MONTHLY.length > 0 && priceId === STRIPE_PRICE_API_MONTHLY) return { product: 'api', plan: 'monthly' }
  if (STRIPE_PRICE_API_YEARLY.length > 0 && priceId === STRIPE_PRICE_API_YEARLY) return { product: 'api', plan: 'yearly' }
  return null
}

/** Обёртка вокруг resolvePriceId ровно под старую сигнатуру: план без учёта продукта. */
export function planForPriceId(priceId: string): PlanId | null {
  return resolvePriceId(priceId)?.plan ?? null
}
