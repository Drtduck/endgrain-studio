'use server'

import { z } from 'zod'
import { currentUtcDay } from '@/lib/api/auth'
import { generateApiKey } from '@/lib/api/keys'
import { API_KEYS_PER_USER } from '@/lib/api/limits'
import { getCurrentUser } from '@/lib/supabase/session'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

/**
 * Server actions для страницы «Аккаунт -> API» (app/account/api/page.tsx).
 * Чтение своих ключей идёт через обычную cookie-сессию: у таблицы api_keys
 * есть политика select на свою строку (миграция 20260813120000). Создание и
 * отзыв - через service-role: insert/update-политик у таблицы нет сознательно
 * (раздел 2.1 дизайн-документа), строку заводит и правит только сервер,
 * потому что только он умеет посчитать sha256 и проверить лимит числа ключей.
 */

export type ApiKeysError = 'unauthenticated' | 'invalid' | 'limit' | 'notFound' | 'unavailable' | 'failed'
export type ApiKeysResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ApiKeysError }

export interface ApiKeySummary {
  readonly id: string
  readonly name: string
  readonly prefix: string
  readonly tier: 'free' | 'developer'
  readonly createdAt: string
  readonly lastUsedAt: string | null
  readonly revokedAt: string | null
  /** Расход за сегодняшний день UTC из api_usage. 0, если ключ сегодня не звали. */
  readonly usedToday: number
}

const nameSchema = z.string().trim().min(1).max(60)
const idSchema = z.uuid()

async function requireUserId(): Promise<string | null> {
  const user = await getCurrentUser()
  return user ? user.id : null
}

function toSummary(
  row: {
    id: unknown
    name: unknown
    prefix: unknown
    tier: unknown
    created_at: unknown
    last_used_at: unknown
    revoked_at: unknown
  },
  usedToday: number,
): ApiKeySummary {
  return {
    id: String(row.id),
    name: String(row.name),
    prefix: String(row.prefix),
    tier: row.tier === 'developer' ? 'developer' : 'free',
    createdAt: String(row.created_at),
    lastUsedAt: row.last_used_at === null ? null : String(row.last_used_at),
    revokedAt: row.revoked_at === null ? null : String(row.revoked_at),
    usedToday,
  }
}

export async function listApiKeysAction(): Promise<ApiKeysResult<readonly ApiKeySummary[]>> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'unauthenticated' }

  const sb = await getSupabaseServer()
  const { data, error } = await sb
    .from('api_keys')
    .select('id, name, prefix, tier, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false })
  if (error || !data) return { ok: false, error: 'failed' }

  // Расход за сегодня - отдельным запросом по своим ключам за текущий день UTC.
  // Политика api_usage_select_own читает свою строку, второй поход в базу не
  // требует service-role. Если запрос не удался, страница всё равно откроется
  // с нулевым расходом - это не повод ронять список ключей.
  const day = currentUtcDay()
  const { data: usage } = await sb.from('api_usage').select('key_id, used').eq('day', day)
  const usedByKey = new Map<string, number>((usage ?? []).map((row) => [String(row.key_id), Number(row.used)]))

  return { ok: true, data: data.map((row) => toSummary(row, usedByKey.get(String(row.id)) ?? 0)) }
}

/** Ключ виден один раз: plaintext уезжает в ответ, но никогда не сохраняется. */
export async function createApiKeyAction(name: string): Promise<ApiKeysResult<{ readonly plaintext: string; readonly summary: ApiKeySummary }>> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'unauthenticated' }

  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: 'invalid' }

  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }
  const sb = getSupabaseService()

  const { count, error: countError } = await sb
    .from('api_keys')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('revoked_at', null)
  if (countError) return { ok: false, error: 'failed' }
  // Тир на выдаче всегда free: раздел 9.3 - апгрейд на developer только руками в базе.
  if ((count ?? 0) >= API_KEYS_PER_USER.free) return { ok: false, error: 'limit' }

  const key = await generateApiKey('live')
  const { data, error } = await sb
    .from('api_keys')
    .insert({ user_id: userId, name: parsedName.data, prefix: key.prefix, key_hash: key.hash })
    .select('id, name, prefix, tier, created_at, last_used_at, revoked_at')
    .single()
  if (error || !data) return { ok: false, error: 'failed' }

  return { ok: true, data: { plaintext: key.plaintext, summary: toSummary(data, 0) } }
}

export async function revokeApiKeyAction(id: string): Promise<ApiKeysResult<null>> {
  const userId = await requireUserId()
  if (!userId) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }
  const sb = getSupabaseService()

  const { data, error } = await sb
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: 'failed' }
  if (!data) return { ok: false, error: 'notFound' }
  return { ok: true, data: null }
}
