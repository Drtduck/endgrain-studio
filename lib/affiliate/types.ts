export type PriceBand = 'under10' | 'b10_25' | 'b25_50' | 'b50_100'

export interface AffiliateItem {
  readonly id: string
  readonly asin: string
  readonly brand: string
  readonly title: { readonly ru: string; readonly en: string }
  readonly note: { readonly ru: string; readonly en: string }
  readonly band: PriceBand
  /** Не проверен вручную владельцем: ссылка ведёт на поиск по названию, а не на ASIN. */
  readonly unverified?: boolean
}

export interface AffiliateBook extends AffiliateItem {
  readonly author: string
  readonly year: number
  /** Одна строка «почему редакция советует». Не отзыв с Amazon. */
  readonly why: { readonly ru: string; readonly en: string }
}
