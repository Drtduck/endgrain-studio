// Импорт роняет сборку, если модуль случайно затянут в клиентский бандл:
// ключ fal.ai не должен уехать в браузер.
import 'server-only'
import type { VideoSeconds } from './pricing'

/**
 * Клиент fal.ai за гвардом. Ключа нет вообще, поэтому файл описывает контракт
 * запроса и разбор ответа заранее: включение FAL_API_KEY не потребует
 * проектирования заново, только реализации fetch внутри requestVideo.
 */
export const FAL_API_KEY: string = process.env['FAL_API_KEY'] ?? ''

export function isFalConfigured(): boolean {
  return FAL_API_KEY.length > 0
}

export interface VideoJobInput {
  readonly prompt: string
  readonly seconds: VideoSeconds
  /** data:URL рендера доски: fal.ai сгенерирует ролик, отталкиваясь от кадра. */
  readonly boardPng: string
}

export interface VideoJobResult {
  readonly ok: true
  readonly videoUrl: string
  readonly posterUrl: string
}

export interface VideoJobError {
  readonly ok: false
  readonly error: 'notConfigured' | 'failed' | 'timeout'
}

/**
 * Живой вызов fal.ai. Не реализован: ключа нет, а значит и контракта ответа
 * никто ещё не видел на реальных данных. Зовущий код обязан проверить
 * isFalConfigured() до вызова и на false использовать mockVideoJob вместо этого.
 */
export async function requestVideo(input: VideoJobInput): Promise<VideoJobResult | VideoJobError> {
  if (!isFalConfigured()) return { ok: false, error: 'notConfigured' }
  // Точка расширения: включается вместе с FAL_API_KEY, контракт запроса и
  // разбор ответа появятся здесь при подключении живого ключа. Параметр уже
  // принят в сигнатуре, чтобы вызывающий код (app/actions/video.ts) не менялся.
  void input
  return { ok: false, error: 'notConfigured' }
}
