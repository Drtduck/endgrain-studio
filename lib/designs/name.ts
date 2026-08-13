import type { Design } from '@/lib/engine'
import { t, type Locale, type MessageKey } from '@/lib/i18n'

/** Имя документа, если человек не назвал проект сам: шахматка стартового образца. */
export const DEFAULT_NAME_KEY = 'design.default'

/**
 * Единственная точка чтения имени документа. Собственное имя всегда выигрывает,
 * иначе имя собирается из ключа словаря: узор, пришедший из шаблона или генератора,
 * обязан менять язык вместе с интерфейсом, а не застывать на языке момента загрузки.
 */
export function designDisplayName(design: Design, locale: Locale): string {
  const own = design.name.trim()
  if (own !== '') return own
  const key = (design.nameKey ?? DEFAULT_NAME_KEY) as MessageKey
  return t(locale, key, design.nameParams ?? {})
}
