/**
 * Гвард ровно по образцу lib/stripe/config.ts и lib/promo/config.ts. Обе
 * переменные серверные, никакого NEXT_PUBLIC_ у них нет: клиент узнаёт про
 * merchEnabled пропсом от серверного компонента (§9.5 спеки), а не читает
 * process.env сам.
 */
import 'server-only'

/**
 * Рубильник приёма заказов, независимый от наличия ключей Stripe/Printful.
 * Дефолт false: до заведения ключей и первой живой проверки кнопка «Купить»
 * не показывается вовсе (§9.5).
 */
export const MERCH_ENABLED: boolean = process.env['MERCH_ENABLED'] === 'true'

/**
 * false создаёт черновик заказа у Printful (confirm=false): баланс не тратится,
 * печать не запускается, пока владелец не подтвердит вручную. true отправляет
 * в печать сразу. Переключается без деплоя (§4.3).
 */
export const PRINTFUL_CONFIRM_ORDERS: boolean = process.env['PRINTFUL_CONFIRM_ORDERS'] === 'true'

/** Приём заказов включён и обе кассы (Stripe, Printful) настроены. */
export function isMerchConfigured(isStripeReady: boolean, isPrintfulReady: boolean): boolean {
  return MERCH_ENABLED && isStripeReady && isPrintfulReady
}
