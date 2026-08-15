import { STRIPE_PRICE_API_MONTHLY, STRIPE_PRICE_API_YEARLY, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY } from './config'

export type PlanId = 'monthly' | 'yearly'

/**
 * Что оплачивает подписка. Продукт «Пропуск» снят с продажи 08.2026 (см.
 * lib/stripe/pro.ts): выданные права остаются, но новых покупок больше нет,
 * поэтому 'pass' сюда не входит.
 */
export type Product = 'pro' | 'api'

// Числовые лимиты живут в ./limits: их читают клиентские компоненты, а этот
// модуль импортирует ./config с серверными ключами.

export function priceIdFor(plan: PlanId): string {
  return plan === 'monthly' ? STRIPE_PRICE_MONTHLY : STRIPE_PRICE_YEARLY
}

/**
 * Цена, с которой стартует Checkout Session. Всегда месячная и для Pro, и для API:
 * тумблер месяц/год рисует Subscription upsell, настроенный в Dashboard, а он
 * работает только когда сессия стартует с более дешёвой (месячной) цены.
 */
export function checkoutPriceFor(product: Product): string {
  return product === 'api' ? STRIPE_PRICE_API_MONTHLY : STRIPE_PRICE_MONTHLY
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
