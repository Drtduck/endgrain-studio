/**
 * Гвард ровно по образцу lib/resend/config.ts и lib/supabase/config.ts.
 * Без ключей Stripe приложение собирается, открывается и работает целиком:
 * Pro просто открыт всем, а кнопок оплаты нет. Это штатное состояние в CI
 * и на конкурсном проде до заведения кассы, а не поломка.
 */

/** Серверные: секретный ключ и секрет вебхука в клиентский бандл попасть не должны. */
export const STRIPE_SECRET_KEY: string = process.env['STRIPE_SECRET_KEY'] ?? ''
export const STRIPE_WEBHOOK_SECRET: string = process.env['STRIPE_WEBHOOK_SECRET'] ?? ''

/**
 * Публичные: id цен инлайнятся в клиентский бандл, поэтому только точечная
 * нотация process.env.NEXT_PUBLIC_*, как в lib/supabase/config.ts.
 * Id цены не секрет: он и так виден в URL страницы оплаты.
 */
export const STRIPE_PRICE_MONTHLY: string = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? ''
export const STRIPE_PRICE_YEARLY: string = process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY ?? ''

/** Ссылка на hosted Customer Portal (no-code link из Stripe Dashboard). Необязательна. */
export const STRIPE_PORTAL_URL: string = process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL ?? ''

/**
 * Без всех четырёх обязательных значений касса не существует: Pro открыт всем,
 * кнопки оплаты не рендерятся, вебхук отвечает 503 и ничего не пишет.
 * Зовётся только на сервере: серверные ключи на клиенте всегда пустые строки,
 * и клиентская проверка тут дала бы вечное false.
 */
export function isStripeConfigured(): boolean {
  return (
    STRIPE_SECRET_KEY.length > 0 &&
    STRIPE_WEBHOOK_SECRET.length > 0 &&
    STRIPE_PRICE_MONTHLY.length > 0 &&
    STRIPE_PRICE_YEARLY.length > 0
  )
}

/** Клиентская половина гварда: только публичные переменные, зовётся из клиентских компонентов. */
export function hasPublicPrices(): boolean {
  return STRIPE_PRICE_MONTHLY.length > 0 && STRIPE_PRICE_YEARLY.length > 0
}
