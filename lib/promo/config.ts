/**
 * Гвард ровно по образцу lib/resend/config.ts и lib/supabase/config.ts:
 * без ключей вкладка «Промо» полностью рабочая, просто показывает локальные
 * заглушки и честно говорит, что для настоящей генерации нужен ключ.
 * Обе переменные серверные: ни Gemini, ни Printful в клиентский бандл
 * попасть не должны, поэтому никакого NEXT_PUBLIC_ у них нет и быть не может.
 */
export const GEMINI_API_KEY: string = process.env['GEMINI_API_KEY'] ?? ''
export const PRINTFUL_API_KEY: string = process.env['PRINTFUL_API_KEY'] ?? ''

export function isGeminiConfigured(): boolean {
  return GEMINI_API_KEY.length > 0
}

export function isPrintfulConfigured(): boolean {
  return PRINTFUL_API_KEY.length > 0
}
