import { PRINTFUL_PLACEMENTS, centeredSquare, type PrintfulPosition } from './printfulCatalog'
import type { MerchProductId } from './types'

/**
 * Клиент Printful Mockup Generator (API v1: /mockup-generator/create-task/{id}
 * и /mockup-generator/task?task_key=...). Версия v2 (/v2/mockup-tasks) умеет то
 * же самое, но требует ровно тех же прав и того же store_id, а v1 отдаёт готовую
 * ссылку одним полем mockup_url, без разбора слоёв, поэтому взят v1.
 *
 * Сеть спрятана за параметром fetchImpl, а разбор ответа вынесен в чистые
 * функции: тест гоняет весь пайплайн с подменённым fetch и без единого байта наружу.
 */

export const PRINTFUL_API = 'https://api.printful.com'

/** Один поход в Printful не должен висеть дольше, чем терпит serverless. */
export const PRINTFUL_TIMEOUT_MS = 15_000

/** Пауза между опросами задачи. Printful рисует мокап единицы секунд. */
export const PRINTFUL_POLL_INTERVAL_MS = 1_500

/**
 * Потолок опросов. 12 попыток по 1.5 с это 18 секунд ожидания сверх создания
 * задачи: вместе с загрузкой макета укладываемся в maxDuration = 60 страницы.
 */
export const PRINTFUL_POLL_ATTEMPTS = 12

export type PrintfulFetch = (url: string, init: RequestInit) => Promise<Response>

export interface PrintfulAuth {
  readonly apiKey: string
  /** Пусто для токена уровня магазина: заголовок тогда не отправляется вовсе. */
  readonly storeId: string
}

/**
 * Что пошло не так. Наружу уезжает кодом, текст выбирает клиент по локали.
 *
 * busy отделён от прочего не для красоты: генератор мокапов у Printful заметно
 * жаднее остального API. Замерено 12.08.2026 на живом ключе: create-task пускает
 * ДВА запроса в минуту, третий отвечает 429 с «try again after 59 seconds».
 * Ждать окно внутри запроса нельзя (maxDuration страницы 60 с), поэтому товар,
 * которому не хватило лимита, честно остаётся локальной компоновкой, а человеку
 * говорят, что остальные мокапы получатся через минуту.
 */
export type PrintfulError = 'auth' | 'store' | 'rejected' | 'busy' | 'timeout' | 'failed'

export type PrintfulOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: PrintfulError }

export interface PrintfulMockup {
  readonly id: MerchProductId
  readonly url: string
}

interface TaskCreateResponse {
  readonly code?: number
  readonly result?: { readonly task_key?: string; readonly status?: string }
  readonly error?: { readonly reason?: string; readonly message?: string }
}

interface TaskResultResponse {
  readonly code?: number
  readonly result?: {
    readonly status?: string
    readonly error?: string
    readonly mockups?: readonly { readonly mockup_url?: string; readonly placement?: string }[]
  }
  readonly error?: { readonly reason?: string; readonly message?: string }
}

export function printfulHeaders(auth: PrintfulAuth): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.apiKey}`,
    'Content-Type': 'application/json',
  }
  // Токен уровня аккаунта без этого заголовка получает 400 «requires store_id».
  if (auth.storeId.length > 0) headers['X-PF-Store-Id'] = auth.storeId
  return headers
}

/** Тело задачи на генерацию мокапа одного товара. Чистая функция: тестируется напрямую. */
export function createTaskBody(id: MerchProductId, imageUrl: string): {
  readonly variant_ids: readonly number[]
  readonly format: string
  readonly files: readonly { readonly placement: string; readonly image_url: string; readonly position: PrintfulPosition }[]
} {
  const place = PRINTFUL_PLACEMENTS[id]
  return {
    variant_ids: [place.variantId],
    // jpg, а не png: мокап это фотография товара, прозрачность в ней не нужна,
    // а вес картинки уезжает в браузер пользователя.
    format: 'jpg',
    files: [{ placement: place.placement, image_url: imageUrl, position: centeredSquare(place) }],
  }
}

/** Код ошибки по статусу HTTP. Ключ и store_id это разные беды с разным лечением. */
function errorFromStatus(status: number, message: string): PrintfulError {
  if (status === 401 || status === 403) return 'auth'
  // 400 «requires store_id» и 404 «Store not found» это одно и то же: магазин не задан.
  if (message.toLowerCase().includes('store')) return 'store'
  if (status === 429) return 'busy'
  return 'failed'
}

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Создаёт задачу и возвращает её ключ. */
export async function createMockupTask(
  id: MerchProductId,
  imageUrl: string,
  auth: PrintfulAuth,
  fetchImpl: PrintfulFetch,
): Promise<PrintfulOutcome<string>> {
  const place = PRINTFUL_PLACEMENTS[id]
  try {
    const res = await fetchImpl(`${PRINTFUL_API}/mockup-generator/create-task/${place.productId}`, {
      method: 'POST',
      headers: printfulHeaders(auth),
      body: JSON.stringify(createTaskBody(id, imageUrl)),
      cache: 'no-store',
      signal: AbortSignal.timeout(PRINTFUL_TIMEOUT_MS),
    })
    const body = await readJson<TaskCreateResponse>(res)
    if (!res.ok) {
      const message = body?.error?.message ?? ''
      // В лог только статус и текст Printful: ключа тут нет и быть не должно.
      console.error(`printful ${id}: HTTP ${res.status} ${message}`)
      return { ok: false, error: errorFromStatus(res.status, message) }
    }
    const key = body?.result?.task_key ?? ''
    if (key === '') {
      console.error(`printful ${id}: ответ без task_key`)
      return { ok: false, error: 'failed' }
    }
    return { ok: true, value: key }
  } catch (err) {
    console.error(`printful ${id}: ${err instanceof Error ? err.name : 'unknown error'}`)
    return { ok: false, error: 'failed' }
  }
}

/** Один опрос задачи: ещё рисуется, готова со ссылкой или отбита. */
export async function readMockupTask(
  taskKey: string,
  auth: PrintfulAuth,
  fetchImpl: PrintfulFetch,
): Promise<PrintfulOutcome<string> | 'pending'> {
  try {
    const res = await fetchImpl(`${PRINTFUL_API}/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`, {
      method: 'GET',
      headers: printfulHeaders(auth),
      cache: 'no-store',
      signal: AbortSignal.timeout(PRINTFUL_TIMEOUT_MS),
    })
    const body = await readJson<TaskResultResponse>(res)
    if (!res.ok) {
      const message = body?.error?.message ?? ''
      console.error(`printful task: HTTP ${res.status} ${message}`)
      return { ok: false, error: errorFromStatus(res.status, message) }
    }
    const result = body?.result
    const status = result?.status ?? ''
    if (status === 'pending' || status === '') return 'pending'
    if (status === 'failed') {
      // Чаще всего это «мы не смогли забрать файл по ссылке» или макет не по размеру.
      console.error(`printful task: failed ${result?.error ?? ''}`)
      return { ok: false, error: 'rejected' }
    }
    const url = result?.mockups?.find((m) => typeof m.mockup_url === 'string' && m.mockup_url.length > 0)?.mockup_url
    if (url === undefined) {
      console.error('printful task: completed без mockup_url')
      return { ok: false, error: 'failed' }
    }
    return { ok: true, value: url }
  } catch (err) {
    console.error(`printful task: ${err instanceof Error ? err.name : 'unknown error'}`)
    return { ok: false, error: 'failed' }
  }
}

/**
 * Поллинг до готовности с жёстким потолком попыток. sleepImpl вынесен наружу,
 * чтобы тест не ждал восемнадцать секунд по-настоящему.
 */
export async function pollMockupTask(
  taskKey: string,
  auth: PrintfulAuth,
  fetchImpl: PrintfulFetch,
  sleepImpl: (ms: number) => Promise<void>,
  attempts: number = PRINTFUL_POLL_ATTEMPTS,
): Promise<PrintfulOutcome<string>> {
  for (let i = 0; i < attempts; i += 1) {
    const outcome = await readMockupTask(taskKey, auth, fetchImpl)
    if (outcome !== 'pending') return outcome
    await sleepImpl(PRINTFUL_POLL_INTERVAL_MS)
  }
  console.error(`printful task: не дождались за ${attempts} опросов`)
  return { ok: false, error: 'timeout' }
}

/**
 * Полный путь одного товара: создать задачу, дождаться, отдать ссылку.
 * Товары гоняются параллельно вызывающим кодом, поэтому здесь ровно один товар.
 */
export async function generateMockup(
  id: MerchProductId,
  imageUrl: string,
  auth: PrintfulAuth,
  fetchImpl: PrintfulFetch,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<PrintfulOutcome<PrintfulMockup>> {
  const task = await createMockupTask(id, imageUrl, auth, fetchImpl)
  if (!task.ok) return task
  const done = await pollMockupTask(task.value, auth, fetchImpl, sleepImpl)
  if (!done.ok) return done
  return { ok: true, value: { id, url: done.value } }
}
