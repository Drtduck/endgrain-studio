/**
 * Гео-скрытие кнопки «Войти через Google». Косметическая мера, не запрет:
 * Google требует юр. лицо вне РФ на верификации consent screen, поэтому
 * кнопку прячем для РФ, но сам OAuth-эндпоинт остаётся рабочим для всех.
 */
export const GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT: readonly string[] = ['RU']

/** HTTP-заголовок, которым proxy.ts прокидывает код страны из x-vercel-ip-country дальше. */
export const COUNTRY_HEADER = 'x-egs-country'

/**
 * Список стран, где кнопка скрыта. Env-override через запятую (например "RU,BY"),
 * пустая или неверная переменная не используется - остаётся дефолт.
 */
export function hiddenCountries(envValue: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_AUTH_HIDDEN_COUNTRIES): readonly string[] {
  if (!envValue) return GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT
  const parsed = envValue
    .split(',')
    .map((code) => code.trim().toUpperCase())
    .filter((code) => code.length > 0)
  return parsed.length > 0 ? parsed : GOOGLE_AUTH_HIDDEN_COUNTRIES_DEFAULT
}

/**
 * true, если кнопку показывать можно. Локалка и продакшен без заголовка
 * (например, вне Vercel) считаются доступными - скрытие не должно ломать
 * разработку и другие площадки хостинга.
 */
export function isGoogleAuthAvailable(country: string | null | undefined, hidden: readonly string[] = hiddenCountries()): boolean {
  if (!country) return true
  return !hidden.includes(country.trim().toUpperCase())
}
