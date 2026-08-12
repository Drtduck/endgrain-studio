/**
 * Гвард ровно по образцу lib/resend/config.ts и lib/supabase/config.ts:
 * без ключей вкладка «Промо» полностью рабочая, просто показывает локальные
 * заглушки и честно говорит, что для настоящей генерации нужен ключ.
 * Обе переменные серверные: ни Gemini, ни Printful в клиентский бандл
 * попасть не должны, поэтому никакого NEXT_PUBLIC_ у них нет и быть не может.
 */
export const GEMINI_API_KEY: string = process.env['GEMINI_API_KEY'] ?? ''
export const PRINTFUL_API_KEY: string = process.env['PRINTFUL_API_KEY'] ?? ''

/**
 * Id магазина Printful. Токен уровня аккаунта сам по себе не знает, в каком
 * магазине работать, и генератор мокапов на него отвечает «This endpoint
 * requires store_id». Значение уезжает заголовком X-PF-Store-Id.
 * Пусто допустимо: токен уровня магазина заголовка не требует, и тогда запрос
 * уходит без него. Магазин заводится в кабинете Printful, через API его не создать.
 */
export const PRINTFUL_STORE_ID: string = (process.env['PRINTFUL_STORE_ID'] ?? '').trim()

export function isGeminiConfigured(): boolean {
  return GEMINI_API_KEY.length > 0
}

export function isPrintfulConfigured(): boolean {
  return PRINTFUL_API_KEY.length > 0
}
