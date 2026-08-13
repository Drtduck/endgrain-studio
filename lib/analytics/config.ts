/**
 * Гвард ровно по образцу lib/stripe/config.ts и lib/kit/config.ts: без measurement id
 * <Analytics/> возвращает null, ни одного тега, ни одного запроса к googletagmanager.com.
 * Публичная переменная: id инлайнится в клиентский бандл, id счётчика не секрет.
 */
export const GA_MEASUREMENT_ID: string = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ''

export function isAnalyticsConfigured(): boolean {
  return GA_MEASUREMENT_ID.length > 0
}
