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

declare global {
  interface Window {
    dataLayer?: unknown[]
  }
}

/**
 * Всегда пишет в window.dataLayer, создавая массив, если его нет, и больше ничего
 * не делает. Никаких проверок consent внутри: гейтом занимается Consent Mode на
 * стороне Google, дублировать его логику здесь значит завести второй источник
 * правды. Никаких проверок наличия GA: без measurement id массив просто никто не
 * читает. Побочный эффект - события полностью наблюдаемы в e2e без настоящего GA.
 */
export function track<Name extends AnalyticsEventName>(
  name: Name,
  ...args: AnalyticsEventParams[Name] extends undefined ? [] : [params: AnalyticsEventParams[Name]]
): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push({ event: name, ...(args[0] ?? {}) })
}
