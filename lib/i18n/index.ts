import en from './en'
import ru from './ru'

export type Locale = 'ru' | 'en'
export type MessageKey = keyof typeof ru

export const dictionaries: Record<Locale, Record<MessageKey, string>> = { ru, en }

export function t(locale: Locale, key: MessageKey, params: Record<string, string | number> = {}): string {
  const template = dictionaries[locale][key]
  if (template === undefined) return String(key)
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    if (value === undefined) return match
    if (typeof value === 'number') return String(Number(value.toFixed(2)))
    return String(value)
  })
}

export interface PluralForms {
  /** Именительный (1), счётная форма (2-4), родительный множественного (5+, 0, 11-14 и т.д.). */
  readonly ru: readonly [one: string, few: string, many: string]
  readonly en: readonly [singular: string, plural: string]
}

/**
 * Слово в зависимости от числа: рус. считает по правилу one/few/many (с учётом 11-14),
 * англ. упрощённо singular/plural. Используется там, где число подставляется в шаблон
 * рядом со счётным существительным (steps.crosscut, steps.gluePanel и т.п.).
 */
export function plural(locale: Locale, n: number, forms: PluralForms): string {
  if (locale === 'en') {
    const [singular, many] = forms.en
    return n === 1 ? singular : many
  }
  const [one, few, many] = forms.ru
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few
  return many
}
