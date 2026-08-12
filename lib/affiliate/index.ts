/**
 * Что здесь СОЗНАТЕЛЬНО не делается и делаться не должно, пока нет доступа к
 * Amazon Product Advertising API:
 *  - не тянем и не храним картинки товаров с амазоновских CDN;
 *  - не показываем рейтинги, число отзывов и Prime-значки;
 *  - не показываем цену числом: только собственный текстовый диапазон,
 *    потому что кэшированная цена без API это прямое нарушение условий;
 *  - не скрейпим страницы товара в рантайме и ничего оттуда не показываем
 *    пользователю (разовая ручная сверка ASIN перед релизом это другое,
 *    её результат живёт в JSON и в docs/affiliate-verify.md).
 * Всё, что видит пользователь, это наш редакционный текст плюс ссылка.
 */

import products from './products.json'
import books from './books.json'
import type { AffiliateBook, AffiliateItem } from './types'

export type { AffiliateBook, AffiliateItem, PriceBand } from './types'

/**
 * Единственное место, где читается публичная переменная Amazon.
 * Точечная нотация process.env.NEXT_PUBLIC_* обязательна: Next инлайнит эти
 * значения в клиентский бандл статическим разбором и индексную запись
 * process.env['NEXT_PUBLIC_...'] не видит (та же ловушка, что в lib/supabase/config.ts).
 */
export const AMAZON_TAG: string = process.env.NEXT_PUBLIC_AMAZON_TAG ?? ''

/**
 * Тега нет (локальная разработка, CI, форк) - ссылка всё равно рабочая, просто
 * без партнёрского хвоста. Блок не должен исчезать из-за отсутствия переменной:
 * подборка полезна сама по себе.
 */
export function amazonUrl(asin: string): string {
  const base = `https://www.amazon.com/dp/${asin}`
  return AMAZON_TAG.length > 0 ? `${base}?tag=${encodeURIComponent(AMAZON_TAG)}` : base
}

/** Для непроверенных позиций ведём на поиск, чтобы битый ASIN не дал 404. */
export function amazonSearchUrl(query: string): string {
  const base = `https://www.amazon.com/s?k=${encodeURIComponent(query)}`
  return AMAZON_TAG.length > 0 ? `${base}&tag=${encodeURIComponent(AMAZON_TAG)}` : base
}

export function itemUrl(item: AffiliateItem): string {
  return item.unverified === true ? amazonSearchUrl(`${item.brand} ${item.title.en}`) : amazonUrl(item.asin)
}

export const PRODUCTS: readonly AffiliateItem[] = products as readonly AffiliateItem[]
export const BOOKS: readonly AffiliateBook[] = books as readonly AffiliateBook[]
