import 'server-only'
import { fal } from '@fal-ai/client'
import { FAL_KEY, isFalConfigured } from '@/lib/promo/config'
import type { ImageOutcome, ImageProvider, ImageRequest } from './types'

const FAL_ENDPOINT = 'fal-ai/flux/schnell'

/** Картинка иногда рисуется долго, но висеть до бесконечности запрос не имеет права. */
const REQUEST_TIMEOUT_MS = 30_000

if (isFalConfigured()) fal.config({ credentials: FAL_KEY })

interface FalImage {
  readonly url?: string
}
interface FalOutput {
  readonly images?: readonly FalImage[]
  readonly has_nsfw_concepts?: readonly boolean[]
}

/**
 * Ответ fal приходит ссылкой, а не base64. Тянем её fetch с таймаутом и
 * превращаем в data-url, чтобы наружу из провайдера всегда выходил один и
 * тот же формат: панель не должна знать, кто рисовал.
 */
async function fetchAsDataUrl(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    const mime = res.headers.get('content-type') ?? 'image/png'
    return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`
  } catch {
    return null
  }
}

/** Код статуса из ошибки @fal-ai/client, если он там есть. Библиотека не экспортирует общий тип ошибки. */
function statusOf(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err) {
    const status = (err as { status?: unknown }).status
    return typeof status === 'number' ? status : undefined
  }
  return undefined
}

export async function generate(req: ImageRequest): Promise<ImageOutcome> {
  // Защита на случай прямого вызова в обход resolveImageProvider: без ключа
  // fal.subscribe упал бы своей ошибкой авторизации, а тут причина явная.
  if (!isFalConfigured()) {
    console.error('fal: FAL_KEY не задан')
    return { kind: 'failed', provider: 'fal', retryable: false }
  }
  const timeoutMs = req.timeoutMs ?? REQUEST_TIMEOUT_MS
  try {
    const result = await fal.subscribe(FAL_ENDPOINT, {
      input: {
        prompt: req.prompt,
        image_size: 'square_hd',
        num_images: 1,
        enable_safety_checker: true,
      },
    })
    const data = result.data as FalOutput
    // enable_safety_checker: true возвращает флаг has_nsfw_concepts вместо
    // отсутствия картинки, поэтому safety-отказ проверяем явно, до ссылки.
    const flagged = data.has_nsfw_concepts?.[0] === true
    const url = data.images?.[0]?.url
    if (flagged || url === undefined) {
      console.error('fal: ответ без картинки')
      return { kind: 'blocked', provider: 'fal' }
    }
    const dataUrl = await fetchAsDataUrl(url, timeoutMs)
    if (dataUrl === null) {
      console.error('fal: не удалось загрузить картинку по ссылке')
      return { kind: 'failed', provider: 'fal', retryable: true }
    }
    return { kind: 'image', dataUrl, provider: 'fal' }
  } catch (err) {
    const status = statusOf(err)
    console.error(`fal: ${status !== undefined ? `HTTP ${status}` : err instanceof Error ? err.name : 'unknown error'}`)
    // 401 не лечится повтором с тем же ключом, остальное (429, 5xx, таймаут) может пройти со второй попытки.
    return { kind: 'failed', provider: 'fal', retryable: status !== 401 }
  }
}

export const falProvider: ImageProvider = { id: 'fal', tier: 'cheap', generate }
