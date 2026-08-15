'use server'

import { z } from 'zod'
import type { Design } from '@/lib/engine'
import { parseDesign } from '@/lib/persist'
import { FREE_PROJECT_LIMIT } from '@/lib/stripe/limits'
import { getProStatus } from '@/lib/stripe/pro'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import type { ProjectSummary } from '@/lib/supabase/types'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ProjectsError }

/** Коды, а не готовые фразы: текст выбирает клиент по своей локали. */
export type ProjectsError = 'unauthenticated' | 'invalid' | 'notFound' | 'failed' | 'limit'

const nameSchema = z.string().trim().min(1).max(120)
const idSchema = z.uuid()

async function requireUser(): Promise<{ id: string } | null> {
  if (!isSupabaseConfigured()) return null
  const sb = await getSupabaseServer()
  const { data } = await sb.auth.getUser()
  return data.user ? { id: data.user.id } : null
}

export async function listProjectsAction(): Promise<ActionResult<readonly ProjectSummary[]>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  const sb = await getSupabaseServer()
  const { data, error } = await sb
    .from('projects')
    .select('id, name, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error || !data) return { ok: false, error: 'failed' }
  return {
    ok: true,
    data: data.map((row) => ({ id: String(row.id), name: String(row.name), updatedAt: String(row.updated_at) })),
  }
}

export async function saveProjectAction(name: string, design: unknown): Promise<ActionResult<ProjectSummary>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: 'invalid' }

  // Документ проверяем нашей же схемой персиста: в базу не должно попасть
  // ничего, что редактор потом не сможет открыть.
  let checked: Design
  try {
    checked = parseDesign(design)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const sb = await getSupabaseServer()

  // Гейт Pro считается на сервере: из devtools его не обойти. Ненастроенный
  // Stripe больше не отдаёт pro: true, поэтому лимит работает и без кассы,
  // а открыть его можно только рубильником или списком адресов (lib/stripe/allowlist).
  const { pro } = await getProStatus()
  if (!pro) {
    // head: true не тянет строки, RLS ограничивает счёт своими проектами.
    const { count, error: countError } = await sb.from('projects').select('id', { count: 'exact', head: true })
    if (countError) return { ok: false, error: 'failed' }
    if ((count ?? 0) >= FREE_PROJECT_LIMIT) return { ok: false, error: 'limit' }
  }

  // user_id ставит сервер, а не клиент: RLS это тоже проверит, но полагаться
  // на присланное значение нельзя даже под политикой.
  const { data, error } = await sb
    .from('projects')
    .insert({ user_id: user.id, name: parsedName.data, design: checked })
    .select('id, name, updated_at')
    .single()
  if (error || !data) return { ok: false, error: 'failed' }
  return { ok: true, data: { id: String(data.id), name: String(data.name), updatedAt: String(data.updated_at) } }
}

export async function loadProjectAction(id: string): Promise<ActionResult<Design>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()
  const { data, error } = await sb.from('projects').select('design').eq('id', id).maybeSingle()
  if (error) return { ok: false, error: 'failed' }
  if (!data) return { ok: false, error: 'notFound' }
  try {
    // Документ мог быть сохранён прошлой версией схемы: parseDesign прогонит миграции.
    return { ok: true, data: parseDesign(data.design) }
  } catch {
    return { ok: false, error: 'invalid' }
  }
}

export async function deleteProjectAction(id: string): Promise<ActionResult<null>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()
  const { error } = await sb.from('projects').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }
  return { ok: true, data: null }
}

/**
 * Единая точка для «Сохранить»: создать проект или перезаписать существующий,
 * атомарно на сервере (лечение D12 - saveProjectAction всегда INSERT, и двойное
 * сохранение или гонка двух вкладок плодили дубль). Тонкая обёртка над
 * upsertProject (lib/api/service.ts), которая делает UPDATE+ownership-check
 * одним запросом, а не select-then-branch на клиенте.
 *
 * projectId приходит с клиента, но не является доверенным: сервис проверяет
 * владение и при несовпадении/отсутствии создаёт новую строку вместо отказа.
 */
export async function upsertProjectAction(input: {
  readonly projectId: string | null
  readonly name: string
  readonly design: unknown
}): Promise<ActionResult<ProjectSummary>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { upsertProject } = await import('@/lib/api/service')
  const result = await upsertProject(user.id, input.projectId, input.name, input.design)
  if (result.ok) return result
  // ServiceError шире ProjectsError на forbidden/rateLimited/unavailable - в них
  // server action без скоупов и без квоты API попасть не может, failed - честный дефолт.
  const error: ProjectsError =
    result.error === 'invalid' || result.error === 'notFound' || result.error === 'failed' || result.error === 'limit'
      ? result.error
      : 'failed'
  return { ok: false, error }
}

/**
 * «Сохранить поверх» вместо всегда новой строки. Тонкая обёртка над
 * сервисным слоем (lib/api/service.ts:updateProject), которым пользуется и
 * REST API: одна реализация вместо двух копий одной и той же логики.
 * Сервис работает под service-role с явным .eq('user_id', ...), а не под
 * cookie-сессией с RLS, поэтому unauthenticated здесь проверяется раньше вызова.
 */
export async function updateProjectAction(
  id: string,
  patch: { readonly name?: string; readonly design?: unknown },
): Promise<ActionResult<ProjectSummary>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const { updateProject } = await import('@/lib/api/service')
  const result = await updateProject(user.id, id, patch)
  if (result.ok) return result
  // ServiceError шире ProjectsError на четыре кода (forbidden/rateLimited/unavailable
  // - в это никогда не попадёт server action, у него нет ни скоупов, ни квоты API).
  // failed - честный дефолт для непредвиденной ветки, а не заглушка «на всякий случай».
  const error: ProjectsError = result.error === 'invalid' || result.error === 'notFound' || result.error === 'failed'
    ? result.error
    : 'failed'
  return { ok: false, error }
}
