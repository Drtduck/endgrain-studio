import type { Diagnostic } from '@/lib/engine'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { speciesName } from '@/lib/species'

/**
 * Параметры диагностик, в которых validate() кладёт id породы.
 * Движок про язык ничего не знает и отдаёт сырой id (cherry, maple), а человеку в панели
 * нужно локализованное название (вишня, клён), поэтому подмена делается на границе рендера.
 */
const SPECIES_PARAMS: readonly string[] = ['a', 'b', 'speciesId']

/**
 * Порода внутри диагностики всегда стоит в середине фразы («Соседние породы вишня и клён...»),
 * а в справочнике имена записаны с заглавной. Опускаем первую букву, остальное не трогаем:
 * «Дуб красный» -> «дуб красный», «Black walnut» -> «black walnut».
 */
function lowerFirst(text: string, locale: Locale): string {
  return text.slice(0, 1).toLocaleLowerCase(locale) + text.slice(1)
}

/** Копия params, где id пород заменены на локализованные названия. */
export function localizeDiagnosticParams(
  params: Readonly<Record<string, string | number>>,
  locale: Locale,
): Record<string, string | number> {
  const out: Record<string, string | number> = { ...params }
  for (const key of SPECIES_PARAMS) {
    const value = out[key]
    if (typeof value === 'string') out[key] = lowerFirst(speciesName(value, locale), locale)
  }
  return out
}

/** Готовый текст диагностики на языке интерфейса. */
export function diagnosticText(diagnostic: Diagnostic, locale: Locale): string {
  return t(locale, diagnostic.messageKey as MessageKey, localizeDiagnosticParams(diagnostic.params, locale))
}
