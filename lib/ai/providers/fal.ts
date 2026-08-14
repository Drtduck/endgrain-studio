import 'server-only'
import { fal } from '@fal-ai/client'
import { FAL_KEY, isFalConfigured } from '@/lib/promo/config'
import type { ImageOutcome, ImageProvider, ImageRequest } from './types'

/** Пробный тир: грошовая text-to-image модель, референс она не умеет и не должна. */
const FAL_ENDPOINT = 'fal-ai/flux/schnell'

/**
 * Pro-тир: nano banana 2. На fal это две разные точки входа, а не один
 * эндпоинт с необязательным входом:
 *
 * - fal-ai/nano-banana-2       - чистый text-to-image, image_urls вообще нет в схеме;
 * - fal-ai/nano-banana-2/edit  - редактирование, обязательный список image_urls.
 *
 * Поэтому выбор модели делается по запросу: есть рендер доски - идём в edit,
 * нет - в create. Отправить референс в create нельзя, он его молча потеряет.
 */
export const FAL_PRO_CREATE_ENDPOINT = 'fal-ai/nano-banana-2'
export const FAL_PRO_EDIT_ENDPOINT = 'fal-ai/nano-banana-2/edit'

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
  // sync_mode у некоторых моделей отдаёт сразу data-url: тянуть его через fetch незачем.
  if (url.startsWith('data:')) return url
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

/** Референс считается переданным, только если он непустой: '' это отсутствие картинки, а не картинка. */
export function hasReference(req: ImageRequest): boolean {
  return typeof req.referencePngBase64 === 'string' && req.referencePngBase64.length > 0
}

/** Точка входа nano banana 2 под конкретный запрос: с рендером доски - edit, без него - create. */
export function proEndpoint(req: ImageRequest): string {
  return hasReference(req) ? FAL_PRO_EDIT_ENDPOINT : FAL_PRO_CREATE_ENDPOINT
}

/**
 * Вход для nano banana 2. Референс уходит Blob-ом, а не data-url строкой:
 * @fal-ai/client сам заливает Blob в своё хранилище и подставляет ссылку
 * (storage.transformInput), а рендер доски 1024px в base64 внутри JSON это
 * лишние сотни килобайт в теле каждого из двенадцати параллельных запросов.
 */
export function proInput(req: ImageRequest): Record<string, unknown> {
  const base = {
    prompt: req.prompt,
    num_images: 1,
    aspect_ratio: '1:1',
    output_format: 'png',
    resolution: '1K',
  }
  const reference = req.referencePngBase64
  if (reference === undefined || reference.length === 0) return base
  return { ...base, image_urls: [new Blob([Buffer.from(reference, 'base64')], { type: 'image/png' })] }
}

/** Общий разбор ответа fal: у обоих тиров он одинаковый, различается только точка входа и вход. */
async function run(endpoint: string, input: Record<string, unknown>, timeoutMs: number): Promise<ImageOutcome> {
  try {
    const result = await fal.subscribe(endpoint, { input })
    const data = result.data as FalOutput
    // flux с enable_safety_checker: true возвращает флаг has_nsfw_concepts вместо
    // отсутствия картинки, поэтому safety-отказ проверяем явно, до ссылки. nano
    // banana 2 такого флага не отдаёт: у неё отказ это пустой список images.
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

/** Ключа нет: причина отказа должна быть явной, а не ошибкой авторизации из недр клиента. */
function missingKey(): ImageOutcome {
  console.error('fal: FAL_KEY не задан')
  return { kind: 'failed', provider: 'fal', retryable: false }
}

/** Пробный тир: flux/schnell, всегда text-to-image. Референс сюда не передаётся сознательно. */
export async function generate(req: ImageRequest): Promise<ImageOutcome> {
  // Защита на случай прямого вызова в обход resolveImageProvider: без ключа
  // fal.subscribe упал бы своей ошибкой авторизации, а тут причина явная.
  if (!isFalConfigured()) return missingKey()
  return run(
    FAL_ENDPOINT,
    { prompt: req.prompt, image_size: 'square_hd', num_images: 1, enable_safety_checker: true },
    req.timeoutMs ?? REQUEST_TIMEOUT_MS,
  )
}

/** Pro-тир: nano banana 2, модель выбирается по наличию референса. */
export async function generatePro(req: ImageRequest): Promise<ImageOutcome> {
  if (!isFalConfigured()) return missingKey()
  return run(proEndpoint(req), proInput(req), req.timeoutMs ?? REQUEST_TIMEOUT_MS)
}

export const falProvider: ImageProvider = { id: 'fal', tier: 'cheap', generate }
export const falProProvider: ImageProvider = { id: 'fal', tier: 'good', generate: generatePro }
