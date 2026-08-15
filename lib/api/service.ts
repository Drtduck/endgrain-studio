import 'server-only'
import { z } from 'zod'
import { calcProject, type CalcResult } from '@/lib/calc'
import { compile, type Design } from '@/lib/engine'
import { buildCutPlan, buildGlueUpSteps, CSV_BOM, cutPlanToCsv, type CutPlan, type GlueUpStep } from '@/lib/export'
import { type Locale } from '@/lib/i18n'
import { encodeDesignToHash, parseDesign } from '@/lib/persist'
import { APP_ORIGIN } from '@/lib/routing/host'
import { FREE_PROJECT_LIMIT } from '@/lib/stripe/limits'
import { proStatusForUser } from '@/lib/stripe/pro'
import { getSupabaseService } from '@/lib/supabase/service'
import type { ProjectSummary } from '@/lib/supabase/types'
import type { ProjectsError } from '@/app/actions/projects'

/**
 * Единственный модуль, где живёт продуктовая логика API. REST, MCP и server
 * actions это три тонких адаптера над ним, не наоборот.
 *
 * КРИТИЧНО: клиент Supabase здесь всегда service-role (см. lib/supabase/service.ts),
 * потому что вызывающий - не браузер с cookie-сессией, а проверенный API-ключ или
 * MCP-инструмент. Service-role обходит RLS целиком. Поэтому КАЖДЫЙ запрос к
 * таблице projects в этом файле обязан нести явный .eq('user_id', userId) -
 * без него забытый фильтр означает, что чужие проекты читаются, правятся или
 * удаляются одним неверным вызовом. lib/api/service.test.ts перебирает все
 * экспортируемые функции и проверяет ровно это.
 */

export type ServiceError = ProjectsError | 'forbidden' | 'rateLimited' | 'unavailable'
export type ActionResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: ServiceError }

export interface ProjectListPage {
  readonly items: readonly ProjectSummary[]
  readonly nextCursor: string | null
}

export interface CutlistPayload {
  readonly plan: CutPlan
  readonly steps: readonly GlueUpStep[]
  readonly calc: CalcResult
  readonly model: { readonly widthMm: number; readonly lengthMm: number; readonly thicknessMm: number }
  readonly csv?: string
}

const nameSchema = z.string().trim().min(1).max(120)
const idSchema = z.uuid()
const DEFAULT_LIST_LIMIT = 50
const MAX_LIST_LIMIT = 100

function clampLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit) || limit <= 0) return DEFAULT_LIST_LIMIT
  return Math.min(Math.floor(limit), MAX_LIST_LIMIT)
}

function encodeCursor(updatedAt: string): string {
  return Buffer.from(updatedAt, 'utf8').toString('base64url')
}

/** null на любой мусор: битый курсор не должен бросать, только дать invalid выше по стеку. */
function decodeCursor(cursor: string): string | null {
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(decoded) ? decoded : null
  } catch {
    return null
  }
}

function toSummary(row: { id: unknown; name: unknown; updated_at: unknown }): ProjectSummary {
  return { id: String(row.id), name: String(row.name), updatedAt: String(row.updated_at) }
}

export async function listProjects(
  userId: string,
  opts: { readonly limit?: number; readonly cursor?: string } = {},
): Promise<ActionResult<ProjectListPage>> {
  const limit = clampLimit(opts.limit)
  let before: string | null = null
  if (opts.cursor !== undefined) {
    before = decodeCursor(opts.cursor)
    if (before === null) return { ok: false, error: 'invalid' }
  }

  const sb = getSupabaseService()
  let query = sb
    .from('projects')
    .select('id, name, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1)
  if (before !== null) query = query.lt('updated_at', before)

  const { data, error } = await query
  if (error || !data) return { ok: false, error: 'failed' }

  const hasMore = data.length > limit
  const page = hasMore ? data.slice(0, limit) : data
  const items = page.map(toSummary)
  const last = page[page.length - 1]
  const nextCursor = hasMore && last ? encodeCursor(String(last.updated_at)) : null

  return { ok: true, data: { items, nextCursor } }
}

export async function createProject(userId: string, name: string, design: unknown): Promise<ActionResult<ProjectSummary>> {
  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: 'invalid' }

  let checked: Design
  try {
    checked = parseDesign(design)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const sb = getSupabaseService()
  const { pro } = await proStatusForUser(userId)
  if (!pro) {
    const { count, error: countError } = await sb
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (countError) return { ok: false, error: 'failed' }
    if ((count ?? 0) >= FREE_PROJECT_LIMIT) return { ok: false, error: 'limit' }
  }

  const { data, error } = await sb
    .from('projects')
    .insert({ user_id: userId, name: parsedName.data, design: checked })
    .select('id, name, updated_at')
    .single()
  if (error || !data) return { ok: false, error: 'failed' }
  return { ok: true, data: toSummary(data) }
}

export async function getProject(
  userId: string,
  id: string,
): Promise<ActionResult<{ summary: ProjectSummary; design: Design }>> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('projects')
    .select('id, name, design, updated_at')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { ok: false, error: 'failed' }
  if (!data) return { ok: false, error: 'notFound' }

  try {
    const design = parseDesign(data.design)
    return { ok: true, data: { summary: toSummary(data), design } }
  } catch {
    return { ok: false, error: 'invalid' }
  }
}

export async function updateProject(
  userId: string,
  id: string,
  patch: { readonly name?: string; readonly design?: unknown },
): Promise<ActionResult<ProjectSummary>> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }
  if (patch.name === undefined && patch.design === undefined) return { ok: false, error: 'invalid' }

  const update: { name?: string; design?: Design } = {}

  if (patch.name !== undefined) {
    const parsedName = nameSchema.safeParse(patch.name)
    if (!parsedName.success) return { ok: false, error: 'invalid' }
    update.name = parsedName.data
  }

  if (patch.design !== undefined) {
    try {
      update.design = parseDesign(patch.design)
    } catch {
      return { ok: false, error: 'invalid' }
    }
  }

  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('projects')
    .update(update)
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, name, updated_at')
    .maybeSingle()
  if (error) return { ok: false, error: 'failed' }
  if (!data) return { ok: false, error: 'notFound' }
  return { ok: true, data: toSummary(data) }
}

/**
 * Create-or-update в одну атомарную операцию (лечение D12/D13,
 * docs/specs/promo-studio.md раздел 3.3). projectId с клиента не является
 * доверенным: UPDATE идёт с явным .eq('user_id', userId), и чужой/устаревший
 * id просто не найдёт строку - тогда функция падает в INSERT, а не в отказ,
 * потому что отказ здесь означал бы потерянную работу пользователя.
 *
 * UPDATE и проверка владения - один SQL-запрос (WHERE id=? AND user_id=?),
 * поэтому гонки «прочитали строку - но её увели/удалили между select и update»
 * здесь нет: Postgres сам атомарен на update с условием.
 */
export async function upsertProject(
  userId: string,
  projectId: string | null,
  name: string,
  design: unknown,
): Promise<ActionResult<ProjectSummary>> {
  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: 'invalid' }

  let checked: Design
  try {
    checked = parseDesign(design)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const sb = getSupabaseService()

  if (projectId !== null) {
    if (!idSchema.safeParse(projectId).success) return { ok: false, error: 'invalid' }
    const { data, error } = await sb
      .from('projects')
      .update({ name: parsedName.data, design: checked })
      .eq('id', projectId)
      .eq('user_id', userId)
      .select('id, name, updated_at')
      .maybeSingle()
    if (error) return { ok: false, error: 'failed' }
    if (data) return { ok: true, data: toSummary(data) }
    // Не нашли: проект удалили или id чужой/устаревший. Не отказ, а создание новой строки.
  }

  const { pro } = await proStatusForUser(userId)
  if (!pro) {
    const { count, error: countError } = await sb
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (countError) return { ok: false, error: 'failed' }
    if ((count ?? 0) >= FREE_PROJECT_LIMIT) return { ok: false, error: 'limit' }
  }

  const { data, error } = await sb
    .from('projects')
    .insert({ user_id: userId, name: parsedName.data, design: checked })
    .select('id, name, updated_at')
    .single()
  if (error || !data) return { ok: false, error: 'failed' }
  return { ok: true, data: toSummary(data) }
}

export async function deleteProject(userId: string, id: string): Promise<ActionResult<null>> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  const sb = getSupabaseService()
  const { error, count } = await sb
    .from('projects')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) return { ok: false, error: 'failed' }
  if (!count) return { ok: false, error: 'notFound' }
  return { ok: true, data: null }
}

/**
 * parseDesign -> compile -> calcProject -> buildCutPlan -> buildGlueUpSteps.
 * Все четыре чистые, DOM не нужен: работает в serverless без оговорок.
 * Сервис ничего не пересчитывает по-своему, только собирает готовые чистые функции.
 */
export async function computeCutlist(
  design: unknown,
  locale: Locale,
  opts: { readonly csv?: boolean } = {},
): Promise<ActionResult<CutlistPayload>> {
  let checked: Design
  try {
    checked = parseDesign(design)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const model = compile(checked)
  const calc = calcProject(checked, model)
  const plan = buildCutPlan(checked, locale)
  const steps = buildGlueUpSteps(plan, locale)

  const csv: string | undefined = opts.csv ? CSV_BOM + cutPlanToCsv(plan, { locale }) : undefined

  return {
    ok: true,
    data: {
      plan,
      steps,
      calc,
      model: { widthMm: model.widthMm, lengthMm: model.lengthMm, thicknessMm: model.thicknessMm },
      ...(csv === undefined ? {} : { csv }),
    },
  }
}

/** encodeDesignToHash плюс APP_ORIGIN. Синхронная и чистая, в базу не ходит. */
export function shareLink(design: unknown): ActionResult<{ url: string }> {
  let checked: Design
  try {
    checked = parseDesign(design)
  } catch {
    return { ok: false, error: 'invalid' }
  }
  return { ok: true, data: { url: `${APP_ORIGIN}/#${encodeDesignToHash(checked)}` } }
}
