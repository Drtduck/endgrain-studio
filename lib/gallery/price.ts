/** Чистая арифметика цены публикации: та же граница, что у published_price_range в SQL. */

export const PRICE_MAX_CENTS = 50_000

/**
 * Разбор цены, введённой человеком в долларах (строка из поля ввода), в целые
 * центы. Дробная копейка округляется, отрицательное и мусор дают null: цена
 * ноль это осознанный выбор «бесплатно», а не то же самое, что «не ввели».
 */
export function parsePriceInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.')
  if (normalized.length === 0) return 0
  const value = Number(normalized)
  if (!Number.isFinite(value) || value < 0) return null
  const cents = Math.round(value * 100)
  if (cents > PRICE_MAX_CENTS) return null
  return cents
}

export function formatPrice(cents: number, locale: 'ru' | 'en'): string {
  if (cents === 0) return locale === 'ru' ? 'Бесплатно' : 'Free'
  const formatter = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return formatter.format(cents / 100)
}
