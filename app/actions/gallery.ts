'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { compile } from '@/lib/engine'
import { PRICE_MAX_CENTS, parsePriceInput } from '@/lib/gallery/price'
import { buildSummary } from '@/lib/gallery/summary'
import type { GalleryError } from '@/lib/gallery/types'
import { parseDesign } from '@/lib/persist'
import { FREE_PROJECT_LIMIT } from '@/lib/stripe/limits'
import { getProStatus } from '@/lib/stripe/pro'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export type ActionResult<T> = { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: GalleryError }

/**
 * Публикаций на аккаунт: защита от превращения галереи в свалку, а не монетизация.
 * Не экспортируется: файл с 'use server' может экспортировать только асинхронные
 * функции (см. тот же приём в app/actions/promo.ts), поэтому константа локальная.
 */
const PUBLISH_LIMIT = 20

const titleSchema = z.string().trim().min(1).max(120)
const idSchema = z.uuid()

async function requireUser(): Promise<{ readonly id: string } | null> {
  if (!isSupabaseConfigured()) return null
  const sb = await getSupabaseServer()
  const { data } = await sb.auth.getUser()
  return data.user ? { id: data.user.id } : null
}

/**
 * Публикация своего проекта в галерею. Документ читается под RLS (значит уже
 * проверено, что проект свой), прогоняется через parseDesign - в витрину не
 * должно попасть то, что редактор потом не сможет открыть, - и снапшотится:
 * design в published_projects больше не связан живой ссылкой с projects.design.
 */
export async function publishProjectAction(
  projectId: string,
  title: string,
  priceCentsInput: number | string,
): Promise<ActionResult<{ readonly id: string }>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }

  const parsedId = idSchema.safeParse(projectId)
  const parsedTitle = titleSchema.safeParse(title)
  if (!parsedId.success || !parsedTitle.success) return { ok: false, error: 'invalid' }

  const priceCents =
    typeof priceCentsInput === 'number'
      ? Number.isInteger(priceCentsInput) && priceCentsInput >= 0 && priceCentsInput <= PRICE_MAX_CENTS
        ? priceCentsInput
        : null
      : parsePriceInput(priceCentsInput)
  if (priceCents === null) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()

  const { count, error: countError } = await sb
    .from('published_projects')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', user.id)
  if (countError) return { ok: false, error: 'failed' }
  if ((count ?? 0) >= PUBLISH_LIMIT) return { ok: false, error: 'limit' }

  const { data: project, error: readError } = await sb
    .from('projects')
    .select('design')
    .eq('id', parsedId.data)
    .maybeSingle()
  if (readError) return { ok: false, error: 'failed' }
  if (!project) return { ok: false, error: 'notFound' }

  let design
  try {
    design = parseDesign(project.design)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const summary = buildSummary(compile(design))

  const { data, error } = await sb
    .from('published_projects')
    .insert({
      author_id: user.id,
      source_project_id: parsedId.data,
      title: parsedTitle.data,
      design,
      summary,
      price_cents: priceCents,
    })
    .select('id')
    .single()
  if (error || !data) return { ok: false, error: 'failed' }

  revalidatePath('/gallery')
  return { ok: true, data: { id: String(data.id) } }
}

export interface PublishedPatch {
  readonly title?: string
  readonly priceCents?: number
  readonly status?: 'public' | 'unlisted' | 'removed'
}

/**
 * Правит ровно те три колонки, на которые выдан column-level grant в миграции
 * (title, price_cents, status). Попытка тронуть что-то ещё (design, счётчики)
 * тут просто не собрать в update-объект: их нет в PublishedPatch.
 */
export async function updatePublishedAction(id: string, patch: PublishedPatch): Promise<ActionResult<null>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  const update: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    const parsed = titleSchema.safeParse(patch.title)
    if (!parsed.success) return { ok: false, error: 'invalid' }
    update['title'] = parsed.data
  }
  if (patch.priceCents !== undefined) {
    if (!Number.isInteger(patch.priceCents) || patch.priceCents < 0 || patch.priceCents > PRICE_MAX_CENTS) {
      return { ok: false, error: 'invalid' }
    }
    update['price_cents'] = patch.priceCents
  }
  if (patch.status !== undefined) {
    if (!['public', 'unlisted', 'removed'].includes(patch.status)) return { ok: false, error: 'invalid' }
    update['status'] = patch.status
  }
  if (Object.keys(update).length === 0) return { ok: true, data: null }

  const sb = await getSupabaseServer()
  const { error } = await sb.from('published_projects').update(update).eq('id', id)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/gallery')
  revalidatePath(`/gallery/${id}`)
  return { ok: true, data: null }
}

export async function unpublishAction(id: string): Promise<ActionResult<null>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()
  const { error } = await sb.from('published_projects').delete().eq('id', id)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/gallery')
  return { ok: true, data: null }
}

export async function likeAction(publishedId: string): Promise<ActionResult<null>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(publishedId).success) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()
  // ignoreDuplicates: двойной клик по кнопке лайка не должен давать ошибку в интерфейсе,
  // составной первичный ключ (published_id, user_id) и так не даст удвоить счётчик.
  const { error } = await sb
    .from('project_likes')
    .upsert({ published_id: publishedId, user_id: user.id }, { onConflict: 'published_id,user_id', ignoreDuplicates: true })
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/gallery')
  return { ok: true, data: null }
}

export async function unlikeAction(publishedId: string): Promise<ActionResult<null>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(publishedId).success) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()
  const { error } = await sb.from('project_likes').delete().eq('published_id', publishedId).eq('user_id', user.id)
  if (error) return { ok: false, error: 'failed' }

  revalidatePath('/gallery')
  return { ok: true, data: null }
}

/**
 * Копия в свои проекты. Разрешена для бесплатной публикации или купленной
 * (в MVP покупок нет, поэтому вторая ветка всегда ложна - см. спеку раздел 2.4
 * и раздел «Отложено»). Проходит тот же FREE_PROJECT_LIMIT, что и обычное
 * сохранение: копия из галереи не должна обходить лимит бесплатного тарифа.
 */
export async function copyPublishedAction(publishedId: string): Promise<ActionResult<{ readonly id: string }>> {
  const user = await requireUser()
  if (!user) return { ok: false, error: 'unauthenticated' }
  if (!idSchema.safeParse(publishedId).success) return { ok: false, error: 'invalid' }

  const sb = await getSupabaseServer()

  const { data: published, error: readError } = await sb
    .from('published_projects')
    .select('title, design, price_cents')
    .eq('id', publishedId)
    .maybeSingle()
  if (readError) return { ok: false, error: 'failed' }
  if (!published) return { ok: false, error: 'notFound' }

  if (Number(published.price_cents) > 0) {
    const { data: purchase, error: purchaseError } = await sb
      .from('project_purchases')
      .select('id')
      .eq('published_id', publishedId)
      .eq('buyer_id', user.id)
      .eq('status', 'paid')
      .maybeSingle()
    if (purchaseError) return { ok: false, error: 'failed' }
    if (!purchase) return { ok: false, error: 'alreadyOwned' }
  }

  const { pro } = await getProStatus()
  if (!pro) {
    const { count, error: countError } = await sb.from('projects').select('id', { count: 'exact', head: true })
    if (countError) return { ok: false, error: 'failed' }
    if ((count ?? 0) >= FREE_PROJECT_LIMIT) return { ok: false, error: 'limit' }
  }

  let design
  try {
    design = parseDesign(published.design)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const { data: inserted, error: insertError } = await sb
    .from('projects')
    .insert({ user_id: user.id, name: String(published.title), design })
    .select('id')
    .single()
  if (insertError || !inserted) return { ok: false, error: 'failed' }

  await sb.rpc('bump_save_count', { p_id: publishedId })

  return { ok: true, data: { id: String(inserted.id) } }
}
