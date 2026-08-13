// Импорт роняет сборку, если модуль случайно затянут в клиентский бандл:
// ключ fal.ai не должен уехать в браузер.
import 'server-only'
import { FAL_KEY, isFalConfigured } from '@/lib/promo/config'
import type { VideoSeconds } from './pricing'

/**
 * Клиент fal.ai за гвардом. Единственный источник имени переменной и признака
 * настроенности - lib/promo/config (FAL_KEY / isFalConfigured): раньше этот файл
 * читал свою собственную FAL_API_KEY, и включение только одной из двух переменных
 * молча рассинхронивало «промо это уже работает» и «видео всё ещё мок». Ключа
 * нет вообще, поэтому файл описывает контракт запроса и разбор ответа заранее:
 * включение FAL_KEY не потребует проектирования заново, только реализации
 * fetch внутри requestVideo.
 */
export { isFalConfigured }

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
  // Точка расширения: включается вместе с FAL_KEY, контракт запроса и
  // разбор ответа появятся здесь при подключении живого ключа. Параметр уже
  // принят в сигнатуре, чтобы вызывающий код (app/actions/video.ts) не менялся.
  void input
  void FAL_KEY
  return { ok: false, error: 'notConfigured' }
}
