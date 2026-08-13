import { callGtag } from './gtag'

/**
 * Пять событий продукта, имена в стиле GA4 (snake_case). Карта имя -> параметры
 * держит их вместе, чтобы вызов track() с неверным набором полей падал на
 * компиляции, а не в консоли браузера на проде.
 */
export interface AnalyticsEventParams {
  readonly project_saved: undefined
  readonly pdf_exported: { readonly pro: boolean }
  readonly pricing_viewed: undefined
  readonly checkout_started: { readonly plan: 'monthly' | 'yearly' }
  readonly subscription_paid: undefined
}

export type AnalyticsEventName = keyof AnalyticsEventParams

/**
 * Зовёт gtag('event', name, params) через общий помощник (lib/analytics/gtag.ts),
 * а не пушит объект в dataLayer напрямую: gtag.js разбирает свою очередь в
 * arguments-форме, объект с полем event для него не событие, а мусор, который
 * не долетает до GA4. Никаких проверок consent внутри: гейтом занимается
 * Consent Mode на стороне Google, дублировать его логику здесь значит завести
 * второй источник правды. Никаких проверок наличия GA: без measurement id
 * запись просто копится в dataLayer и никто её не читает.
 */
export function track<Name extends AnalyticsEventName>(
  name: Name,
  ...args: AnalyticsEventParams[Name] extends undefined ? [] : [params: AnalyticsEventParams[Name]]
): void {
  callGtag('event', name, args[0] ?? {})
}
