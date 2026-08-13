declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

/**
 * Единственная точка, откуда что-либо пушится в dataLayer. gtag.js (см.
 * components/Analytics.tsx) сам себя определяет так:
 * `function gtag(){dataLayer.push(arguments);}` - это НЕ `dataLayer.push({event: ...})`.
 * Раньше track() и ConsentProvider пушили объекты и массивы напрямую, обходя
 * window.gtag: gtag.js читает свою очередь именно в arguments-форме
 * (`['event', name, params]`, `['consent', 'update', payload]`), а объект
 * `{event: name, ...params}` для него просто мусор, который никогда не долетает
 * до самого GA4 - события были видны в dataLayer глазами человека, но не
 * долетали до сети.
 *
 * Если window.gtag уже объявлен инлайновым скриптом Analytics.tsx - зовём его
 * напрямую, он сам сделает dataLayer.push(arguments). Если скрипт ещё не
 * выполнился или GA не настроен вовсе (isAnalyticsConfigured() === false,
 * <Analytics/> не рендерит ничего) - кладём тот же arguments-совместимый
 * формат в dataLayer напрямую: ровно то же самое, что сделал бы сам gtag().
 */
export function callGtag(...args: readonly unknown[]): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer ?? []
  if (typeof window.gtag === 'function') {
    window.gtag(...args)
    return
  }
  window.dataLayer.push(args)
}
