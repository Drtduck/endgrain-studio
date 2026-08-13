/**
 * Провайдерская абстракция генерации изображений: чистые типы, ни одного
 * импорта сети или секретов. Их читает и клиент (панель показывает, какой
 * моделью нарисован кадр), поэтому рядом с ключами этому файлу делать нечего.
 */

export type ProviderId = 'gemini' | 'fal' | 'mock'

/** good - хорошая модель за деньги (Pro), cheap - грошовая для пробных генераций. */
export type ImageTier = 'good' | 'cheap'

export interface ImageRequest {
  readonly prompt: string
  /** Рендер доски в base64 без префикса data:. Для text-to-image моделей игнорируется. */
  readonly referencePngBase64?: string
  readonly timeoutMs?: number
}

/**
 * Три исхода вместо двух: blocked это отказ модели по своим правилам (200 без
 * кандидатов), failed это сбой связи, таймаут или HTTP-ошибка. Флаг retryable
 * отделяет 429 и 5xx от 401: на протухшем ключе второй провайдер имеет смысл,
 * на 401 у первого имеет смысл тоже, а вот повтор в тот же провайдер бесполезен.
 * Решение о fallback принимается только по kind, retryable нужен логам и
 * будущему ретраю.
 */
export type ImageOutcome =
  | { readonly kind: 'image'; readonly dataUrl: string; readonly provider: ProviderId }
  | { readonly kind: 'blocked'; readonly provider: ProviderId }
  | { readonly kind: 'failed'; readonly provider: ProviderId; readonly retryable: boolean }

export interface ImageProvider {
  readonly id: ProviderId
  readonly tier: ImageTier
  generate(req: ImageRequest): Promise<ImageOutcome>
}
