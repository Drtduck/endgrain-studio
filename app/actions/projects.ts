'use server'

import { z } from 'zod'
import type { Design } from '@/lib/engine'
import { parseDesign } from '@/lib/persist'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import type { ProjectSummary } from '@/lib/supabase/types'

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ProjectsError }

/** Коды, а не готовые фразы: текст выбирает клиент по своей локали. */
export type ProjectsError = 'unauthenticated' | 'invalid' | 'notFound' | 'failed'

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

// Точка расширения фазы 8: обновление существующей записи ("Сохранить" поверх,
// а не всегда новая строка). В фазу 7 не входит сознательно.
