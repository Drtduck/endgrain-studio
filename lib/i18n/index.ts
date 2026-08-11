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
