import 'server-only'
import { isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { getSupabaseService } from '@/lib/supabase/service'
import { hashApiKey, parseApiKey, timingSafeEqualHex } from './keys'
import { API_DAILY_LIMIT, type ApiTier } from './limits'

/**
 * Проверка API-ключа. Раздел 3 дизайн-документа, шаг за шагом:
 * 1. Достать Authorization: Bearer.
 * 2. Разобрать (lib/api/keys.ts).
 * 3. Один запрос под service-role по prefix.
 * 4. Строки нет или ключ отозван - unauthorized.
 * 5. Постоянное по времени сравнение хеша.
 * 6. Скоуп.
 * 7. Квота (consume_api_quota).
 * 8. touch_api_key без ожидания результата.
 *
 * Всё под service-role, потому что запрос анонимный и RLS не за кого
 * зацепиться. Дальше, в сервисном слое, работа с projects идёт тоже под
 * service-role, но с обязательным явным .eq('user_id', caller.userId) в
 * каждом запросе - это отдельный контракт, lib/api/service.ts.
 */

export type ApiScope = 'projects:read' | 'projects:write' | 'cutlist:read'

export type ApiError = 'unauthorized' | 'forbidden' | 'rateLimited' | 'unavailable'

export interface ApiCaller {
  readonly keyId: string
  readonly userId: string
  readonly scopes: readonly ApiScope[]
  readonly tier: ApiTier
  readonly usage: { readonly used: number; readonly limit: number }
}

export type AuthResult = { readonly ok: true; readonly caller: ApiCaller } | { readonly ok: false; readonly error: ApiError }

interface ApiKeyRow {
  readonly id: string
  readonly userId: string
  readonly scopes: readonly ApiScope[]
  readonly tier: ApiTier
}

type RowResult = { readonly ok: true; readonly row: ApiKeyRow } | { readonly ok: false; readonly error: 'unauthorized' | 'unavailable' }

function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!header) return null
  const [scheme, token] = header.split(' ')
  if (scheme !== 'Bearer' || !token) return null
  return token
}

/** Календарный день UTC в формате YYYY-MM-DD, ровно как ждёт api_usage.day. */
export function currentUtcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

function normalizeTier(value: unknown): ApiTier {
  return value === 'developer' ? 'developer' : 'free'
}

function normalizeScopes(value: unknown): readonly ApiScope[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (v): v is ApiScope => v === 'projects:read' || v === 'projects:write' || v === 'cutlist:read',
  )
}

/**
 * Шаги 1-5: находит и проверяет ключ, без учёта скоупа и квоты (они у каждого
 * эндпоинта/инструмента свои и проверяются отдельно, см. authorizeAndConsume).
 */
async function authenticateKey(req: Request): Promise<RowResult> {
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const token = bearerToken(req)
  if (!token) return { ok: false, error: 'unauthorized' }

  const parsed = parseApiKey(token)
  if (!parsed) return { ok: false, error: 'unauthorized' }

  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('api_keys')
    .select('id, user_id, scopes, tier, key_hash, revoked_at')
    .eq('prefix', parsed.prefix)
    .maybeSingle()

  if (error || !data || data.revoked_at !== null) return { ok: false, error: 'unauthorized' }

  const hash = await hashApiKey(parsed.plaintext)
  if (!timingSafeEqualHex(hash, String(data.key_hash))) return { ok: false, error: 'unauthorized' }

  return {
    ok: true,
    row: {
      id: String(data.id),
      userId: String(data.user_id),
      scopes: normalizeScopes(data.scopes),
      tier: normalizeTier(data.tier),
    },
  }
}

/** Обновляет last_used_at. Ошибка глотается: это не повод ронять запрос. */
function touchApiKeyAsync(keyId: string): void {
  void getSupabaseService()
    .rpc('touch_api_key', { p_key_id: keyId })
    .then(undefined, () => undefined)
}

/**
 * Шаги 6-8 поверх уже найденного ключа: скоуп, атомарное списание квоты
 * (consume_api_quota) и обновление метки времени. Используется и REST
 * (lib/api/http.ts:withApiAuth), и MCP-инструментами (lib/api/mcpTools.ts) -
 * там ключ проверяется один раз на транспортном уровне (verifyMcpToken), а
 * скоуп и стоимость у каждого инструмента свои.
 */
export async function authorizeAndConsume(row: ApiKeyRow, scope: ApiScope, cost = 1): Promise<AuthResult> {
  if (!row.scopes.includes(scope)) return { ok: false, error: 'forbidden' }

  const sb = getSupabaseService()
  const day = currentUtcDay()
  const limit = API_DAILY_LIMIT[row.tier]
  const { data: used, error } = await sb.rpc('consume_api_quota', {
    p_key_id: row.id,
    p_user_id: row.userId,
    p_day: day,
    p_limit: limit,
    p_cost: cost,
  })

  if (error) return { ok: false, error: 'unavailable' }
  if (used === null || used === undefined) return { ok: false, error: 'rateLimited' }

  touchApiKeyAsync(row.id)

  return {
    ok: true,
    caller: { keyId: row.id, userId: row.userId, scopes: row.scopes, tier: row.tier, usage: { used: Number(used), limit } },
  }
}

/** Полный конвейер: аутентификация ключа плюс скоуп и квота для конкретного действия. */
export async function authenticateApiRequest(req: Request, scope: ApiScope, cost = 1): Promise<AuthResult> {
  const found = await authenticateKey(req)
  if (!found.ok) return { ok: false, error: found.error }
  return authorizeAndConsume(found.row, scope, cost)
}

/**
 * verifyToken для withMcpAuth. Проверяет только сам ключ (шаги 1-5): скоуп и
 * квота у каждого инструмента разные и проверяются внутри инструмента через
 * authorizeAndConsume. clientId несёт id ключа, а не сам ключ: в логи и в
 * AuthInfo не должно уехать ничего, что можно предъявить как секрет повторно.
 */
export async function verifyMcpToken(
  req: Request,
  _bearerToken?: string,
): Promise<{ token: string; clientId: string; scopes: string[]; extra: { userId: string; tier: ApiTier; scopes: readonly ApiScope[] } } | undefined> {
  const found = await authenticateKey(req)
  if (!found.ok) return undefined
  const token = bearerToken(req) ?? ''
  return {
    token,
    clientId: found.row.id,
    scopes: [...found.row.scopes],
    extra: { userId: found.row.userId, tier: found.row.tier, scopes: found.row.scopes },
  }
}
