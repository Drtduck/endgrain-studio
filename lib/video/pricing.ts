/**
 * Чистая цена видео: ни одного импорта, ни одного похода в сеть.
 * $2 за 5 секунд, длительность жёстко ограничена двумя значениями: 5 и 10 секунд.
 */

export type VideoSeconds = 5 | 10

export const VIDEO_ALLOWED_SECONDS: readonly VideoSeconds[] = [5, 10]

export function isVideoSeconds(value: unknown): value is VideoSeconds {
  return typeof value === 'number' && (VIDEO_ALLOWED_SECONDS as readonly number[]).includes(value)
}

/**
 * Цена в центах за длительность. Разрешены только 5 и 10 секунд (см.
 * VIDEO_ALLOWED_SECONDS), всё остальное - в том числе 0 и любое дробное или
 * непредусмотренное число секунд - отсекается на сервере и здесь же отдаёт null,
 * а не молчаливое округление до ближайшего разрешённого значения.
 */
export function videoCostCents(seconds: number): number | null {
  if (!isVideoSeconds(seconds)) return null
  return Math.ceil(seconds / 5) * 200
}
