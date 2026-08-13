import 'server-only'
import { authenticateApiRequest, type ApiCaller, type ApiError, type ApiScope } from './auth'
import { API_DAILY_LIMIT } from './limits'
import type { ServiceError } from './service'

/**
 * Единственный способ объявить эндпоинт REST v1: withApiAuth делает всю
 * цепочку проверки ключа (раздел 3 дизайн-документа), ловит исключения из
 * обработчика и превращает их в 500 failed, и добавляет к любому ответу
 * заголовки лимита. Ни один route handler не ходит в lib/api/auth.ts напрямую.
 */

export type ApiErrorCode = ApiError | 'invalid' | 'notFound' | 'limit' | 'failed'

const STATUS: Readonly<Record<ApiErrorCode, number>> = {
  unauthorized: 401,
  forbidden: 403,
  invalid: 400,
  notFound: 404,
  limit: 402,
  rateLimited: 429,
  unavailable: 503,
  failed: 500,
}

/**
 * Коды сервисного слоя (ServiceError) шире кодов API ровно на unauthenticated:
 * этот код рождается в server actions от отсутствия cookie-сессии и в API
 * попасть не может, потому что вызывающий уже прошёл authenticateApiRequest.
 * Мэппинг существует для типов, а не для реального ветвления, и на случай
 * непредвиденного будущего кода валит в failed, а не роняет обработчик.
 */
export function toApiErrorCode(error: ServiceError): ApiErrorCode {
  switch (error) {
    case 'invalid':
    case 'notFound':
    case 'limit':
    case 'forbidden':
    case 'rateLimited':
    case 'unavailable':
    case 'failed':
      return error
    default:
      return 'failed'
  }
}

/**
 * Сообщения в теле - по-английски: их читает не человек, а модель, и половина
 * клиентов покажет тело как есть в своём интерфейсе. Правило «тексты по-русски»
 * относится к интерфейсу, API это не интерфейс (раздел 6.2 дизайн-документа).
 */
const MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  unauthorized: 'Invalid or missing API key',
  forbidden: 'API key lacks the required scope',
  invalid: 'Invalid request',
  notFound: 'Not found',
  limit: 'Free plan project limit reached',
  rateLimited: 'Daily request limit reached',
  unavailable: 'API is not configured',
  failed: 'Internal error',
}

export interface ApiErrorBody {
  readonly error: { readonly code: ApiErrorCode; readonly message: string }
}

function noStore(headers: Headers): Headers {
  headers.set('Cache-Control', 'no-store')
  return headers
}

function rateLimitHeaders(caller: ApiCaller): Headers {
  const headers = new Headers()
  const resetAt = new Date()
  resetAt.setUTCHours(24, 0, 0, 0)
  headers.set('X-RateLimit-Limit', String(caller.usage.limit))
  headers.set('X-RateLimit-Remaining', String(Math.max(caller.usage.limit - caller.usage.used, 0)))
  headers.set('X-RateLimit-Reset', resetAt.toISOString())
  return headers
}

/** Успешный ответ. caller опционален: /me и обычный успех несут заголовки лимита, ошибки - нет смысла (лимит уже не потрачен на unauthorized/unavailable). */
export function ok<T>(data: T, caller?: ApiCaller, init: { readonly status?: number } = {}): Response {
  const headers = caller ? rateLimitHeaders(caller) : new Headers()
  noStore(headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers })
}

export function fail(code: ApiErrorCode, caller?: ApiCaller): Response {
  const body: ApiErrorBody = { error: { code, message: MESSAGES[code] } }
  const headers = caller ? rateLimitHeaders(caller) : new Headers()
  noStore(headers)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { status: STATUS[code], headers })
}

/** Тело больше лимита не читается вовсе: узор весит килобайты, мегабайтный JSON в serverless - только способ купить таймаут. */
export const MAX_BODY_BYTES = 512 * 1024

export function bodyTooLarge(req: Request): boolean {
  const len = req.headers.get('content-length')
  if (len === null) return false
  const n = Number(len)
  return Number.isFinite(n) && n > MAX_BODY_BYTES
}

export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) throw new Error('body too large')
  if (text.length === 0) return undefined
  return JSON.parse(text)
}

export type ApiHandler<Ctx> = (req: Request, caller: ApiCaller, ctx: Ctx) => Promise<Response>

/**
 * scope: null значит "любой валидный ключ", для GET /api/v1/me - дешёвая
 * проверка, которая всё равно стоит 1 запрос квоты.
 *
 * Ctx по умолчанию unknown, а не undefined: у роутов без динамических
 * сегментов Next всё равно передаёт вторым аргументом { params: Promise<{}> },
 * и unknown - единственный тип, которому эта форма (и любая другая) присвоится
 * без конфликта в сгенерированной проверке типов роута (.next/types/validator.ts).
 */
export function withApiAuth<Ctx = unknown>(scope: ApiScope | null, handler: ApiHandler<Ctx>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    // 413 до всякой проверки ключа: незачем тратить квоту на тело, которое
    // всё равно отклонится, и не нужно ждать сеть до Supabase ради этого.
    if (bodyTooLarge(req)) {
      const headers = noStore(new Headers())
      headers.set('Content-Type', 'application/json; charset=utf-8')
      const body: ApiErrorBody = { error: { code: 'invalid', message: 'Request body exceeds 512 KB limit' } }
      return new Response(JSON.stringify(body), { status: 413, headers })
    }

    const auth = await authenticateApiRequest(req, scope)
    if (!auth.ok) return fail(auth.error)

    try {
      return await handler(req, auth.caller, ctx)
    } catch (err) {
      console.error('api route handler failed', err)
      return fail('failed', auth.caller)
    }
  }
}

/** Для документации и llms.txt: лимиты тарифов без похода в базу. */
export const dailyLimits = API_DAILY_LIMIT
