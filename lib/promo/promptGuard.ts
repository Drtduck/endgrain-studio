/**
 * Защита каркаса промпта (спека, раздел 6.3). Человек может править только
 * текст сцены - описание доски и общие правила всегда приклеиваются сервером,
 * и сервер обязан проверить присланный текст сцены сам, даже если клиент уже
 * проверил его локально.
 *
 * Файл чистый: ни сети, ни server-only, тестируется напрямую.
 */

/** Максимум символов пользовательской сцены. Длиннее - это не сцена, а попытка забить контекст. */
export const SCENE_MAX_CHARS = 1200

/**
 * Стоп-паттерны. Не «модерация», а защита каркаса: попытки отменить наши
 * правила, попросить текст на картинке, попросить чужой бренд или лицо.
 * Список короткий и конкретный: длинный чёрный список - это иллюзия защиты,
 * настоящая защита в том, что правила приклеиваются ПОСЛЕ пользовательского
 * текста, и модель видит их последними (см. composePrompt в prompts.ts).
 */
export const SCENE_BLOCKED_PATTERNS: readonly RegExp[] = [
  /ignore (all |the )?(previous|above|prior) (instructions?|rules?|prompts?)/i,
  /disregard (all |the )?(previous|above|prior)/i,
  /\bsystem prompt\b/i,
  /\b(nude|nsfw|explicit|porn)\b/i,
  /\b(nike|adidas|apple|ikea|disney|coca[- ]cola)\b/i,
]

export type SceneVerdict =
  | { readonly ok: true; readonly scene: string }
  | { readonly ok: false; readonly reason: 'tooLong' | 'blocked' | 'empty' }

/** Чистая функция: тестируется без сети, зовётся только на сервере. */
export function checkScene(raw: unknown): SceneVerdict {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' }
  const scene = raw.trim()
  if (scene.length === 0) return { ok: false, reason: 'empty' }
  if (scene.length > SCENE_MAX_CHARS) return { ok: false, reason: 'tooLong' }
  if (SCENE_BLOCKED_PATTERNS.some((pattern) => pattern.test(scene))) return { ok: false, reason: 'blocked' }
  return { ok: true, scene }
}
