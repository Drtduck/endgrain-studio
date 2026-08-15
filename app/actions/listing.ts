'use server'

import { headers } from 'next/headers'
import { assertAiAllowed, releaseAiQuota } from '@/lib/ai/entitlements'
import type { AiDenyReason } from '@/lib/ai/quota'
import { compile } from '@/lib/engine'
import { t } from '@/lib/i18n'
import { parseDesign } from '@/lib/persist'
import { isGeminiConfigured } from '@/lib/promo/config'
import { describeBoard } from '@/lib/promo/describe'
import { boardSizeInches } from '@/lib/promo/listing'
import { demoListingForMarketplace, marketplaceListingPrompt, parseMarketplaceListing, type PromoListingDraft } from '@/lib/promo/marketplaceListing'
import { marketplaceById, MARKETPLACE_IDS, type MarketplaceId } from '@/lib/promo/marketplaces'
import { PROMO_SHOT_META } from '@/lib/promo/types'
import { requestListing } from '@/lib/promo/listingRequest'
import { PER_IP_PER_HOUR, PER_IP_PER_HOUR_ANON, clientIp, promoLimiter } from '@/lib/promo/rateLimit'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/supabase/session'
import { z } from 'zod'

/**
 * Тот же счётчик по адресу, что закрывает остальные платные действия промо-
 * студии (app/actions/promo.ts): до похода в базу и до вызова модели.
 */
async function passRateLimit(): Promise<boolean> {
  const head = await headers()
  const anonymous = isSupabaseConfigured() && (await getCurrentUser()) === null
  const verdict = promoLimiter.take(
    clientIp(head.get('x-forwarded-for'), head.get('x-real-ip')),
    anonymous ? PER_IP_PER_HOUR_ANON : PER_IP_PER_HOUR,
    Date.now(),
  )
  return verdict === 'ok'
}

/**
 * SEO-описание карточки под конкретную площадку (спека, раздел 8). Отдельный
 * файл от app/actions/promo.ts по той же причине, что и раньше: карточка
 * товара логически не про фото, хотя и делит с ним отобранные кадры.
 *
 * requestListing/parseMarketplaceListing переиспользуют тот же сетевой ход к
 * Gemini (lib/promo/listingRequest.ts), что и старая generic-карточка -
 * responseSchema там не завязана на форму ответа, JSON-парсинг общий.
 */

export type ListingError = AiDenyReason | 'invalid' | 'failed' | 'notFound' | 'rateLimited'

export interface PromoListingView extends PromoListingDraft {
  readonly marketplace: MarketplaceId
  readonly selectedShotIds: readonly string[]
}

export type ListingResult =
  | { readonly ok: true; readonly mock: true; readonly listing: PromoListingDraft }
  | { readonly ok: true; readonly mock: false; readonly listing: PromoListingDraft; readonly remaining: number }
  | { readonly ok: false; readonly error: ListingError }

const idSchema = z.uuid()

const readListingSchema = z.object({
  projectId: idSchema,
  marketplace: z.enum(MARKETPLACE_IDS),
})

const generateListingSchema = z.object({
  projectId: idSchema,
  marketplace: z.enum(MARKETPLACE_IDS),
  shotIds: z.array(idSchema).max(64),
  walletRef: idSchema,
  // Демо-режим без Supabase (CI, дев без ключей) не может прочитать design
  // проекта из базы - её попросту нет. Клиент присылает design как fallback,
  // ИМЕННО КАК В promoSeriesSchema: используется только когда Supabase
  // недоступен вовсе, платный путь его никогда не читает и пересчитывает
  // description сам из базы (спека 6.3, тот же принцип «не доверяем клиенту»).
  design: z.unknown().optional(),
})

const saveListingSchema = z.object({
  projectId: idSchema,
  marketplace: z.enum(MARKETPLACE_IDS),
  title: z.string().trim().max(500),
  description: z.string().trim().max(20_000),
  bullets: z.array(z.string().trim().max(2000)).max(20),
  tags: z.array(z.string().trim().max(200)).max(60),
  selectedShotIds: z.array(idSchema).max(64),
})

function emptyDraft(): PromoListingDraft {
  return { title: '', description: '', bullets: [], tags: [] }
}

async function loadDesignDescription(
  projectId: string,
  userId: string,
): Promise<{ readonly description: ReturnType<typeof describeBoard>; readonly sizeIn: string } | null> {
  const sb = getSupabaseService()
  const { data: projectRow, error } = await sb.from('projects').select('design').eq('id', projectId).eq('user_id', userId).maybeSingle()
  if (error || !projectRow) return null
  let design
  try {
    design = parseDesign((projectRow as { readonly design: unknown }).design)
  } catch {
    return null
  }
  const model = compile(design)
  const description = describeBoard(design, model)
  const sizeIn = boardSizeInches(model.widthMm, model.lengthMm, model.thicknessMm)
  return { description, sizeIn }
}

/** Короткие английские заметки по отмеченным кадрам: "hero shot..." - модель пишет текст под то, что реально покажет фото (спека 8.2). */
async function sceneNotes(shotIds: readonly string[], userId: string): Promise<readonly string[]> {
  if (shotIds.length === 0 || !isSupabaseServiceConfigured()) return []
  const sb = getSupabaseService()
  const { data } = await sb.from('promo_shots').select('kind_slug').in('id', shotIds).eq('user_id', userId).eq('status', 'done')
  const kinds = ((data ?? []) as readonly { readonly kind_slug: string }[]).map((r) => r.kind_slug)
  const metaByKind = new Map(PROMO_SHOT_META.map((m) => [m.kind, m]))
  return kinds.map((kind) => {
    const meta = metaByKind.get(kind as (typeof PROMO_SHOT_META)[number]['kind'])
    return meta ? t('en', meta.noteKey) : kind
  })
}

/** Читает сохранённую карточку. Нет строки - пустая заготовка под площадку (спека 8.3). */
export async function readListingAction(input: unknown): Promise<{ readonly ok: true; readonly data: PromoListingView } | { readonly ok: false; readonly error: ListingError }> {
  const parsed = readListingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'anonymous' }
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('promo_listings')
    .select('title, description, bullets, tags, selected_shot_ids')
    .eq('project_id', parsed.data.projectId)
    .eq('user_id', user.id)
    .eq('marketplace', parsed.data.marketplace)
    .maybeSingle()
  if (error) return { ok: false, error: 'failed' }

  const row = data as { readonly title: string; readonly description: string; readonly bullets: readonly string[]; readonly tags: readonly string[]; readonly selected_shot_ids: readonly string[] } | null
  return {
    ok: true,
    data: row
      ? { marketplace: parsed.data.marketplace, title: row.title, description: row.description, bullets: row.bullets, tags: row.tags, selectedShotIds: row.selected_shot_ids }
      : { marketplace: parsed.data.marketplace, ...emptyDraft(), selectedShotIds: [] },
  }
}

/**
 * Генерирует текст под площадку. Стоит 1 кадр по общему счётчику (feature
 * 'saleListing', та же цена, что была у старой generic-карточки): это
 * обращение к модели, притворяться бесплатным нечестно. Результат НЕ
 * сохраняется автоматически - человек сначала смотрит и правит (спека 8.3).
 */
export async function generateListingAction(input: unknown): Promise<ListingResult> {
  const parsed = generateListingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  const user = await getCurrentUser()
  const spec = marketplaceById(parsed.data.marketplace)

  // Нет Supabase вовсе (CI, дев без ключей): design берём с клиента - платный
  // путь ниже это поле никогда не читает и не может, раз до него не дошли.
  if (!isSupabaseServiceConfigured() || !user) {
    let design
    try {
      design = parseDesign(parsed.data.design)
    } catch {
      return { ok: true, mock: true, listing: emptyDraft() }
    }
    const model = compile(design)
    const description = describeBoard(design, model)
    const sizeIn = boardSizeInches(model.widthMm, model.lengthMm, model.thicknessMm)
    return { ok: true, mock: true, listing: demoListingForMarketplace(description, sizeIn, spec) }
  }

  // Есть Supabase и аккаунт, но нет ключа Gemini: демо-заготовка от РЕАЛЬНОГО
  // design'а проекта, прочитанного из базы, а не с клиента.
  if (!isGeminiConfigured()) {
    const loaded = await loadDesignDescription(parsed.data.projectId, user.id)
    if (loaded === null) return { ok: false, error: 'notFound' }
    return { ok: true, mock: true, listing: demoListingForMarketplace(loaded.description, loaded.sizeIn, spec) }
  }

  const loaded = await loadDesignDescription(parsed.data.projectId, user.id)
  if (loaded === null) return { ok: false, error: 'notFound' }

  if (!(await passRateLimit())) return { ok: false, error: 'rateLimited' }

  // walletRef - ключ идемпотентности с клиента (двойной клик по «Сгенерировать
  // карточку»): раньше отбрасывался в пользу crypto.randomUUID() по умолчанию,
  // и повтор клика списывал дважды (P0-блокер ревью 14.08.2026).
  const grant = await assertAiAllowed('saleListing', 1, parsed.data.walletRef)
  if (!grant.ok) return { ok: false, error: grant.reason }

  const notes = await sceneNotes(parsed.data.shotIds, user.id)
  const prompt = marketplaceListingPrompt(loaded.description, loaded.sizeIn, spec, notes)
  const result = await requestListing(prompt)
  if (!result.ok) {
    await releaseAiQuota(grant)
    return { ok: false, error: 'failed' }
  }
  const draft = parseMarketplaceListing(JSON.stringify(result.listing), spec)
  if (draft === null) {
    await releaseAiQuota(grant)
    return { ok: false, error: 'failed' }
  }
  return { ok: true, mock: false, listing: draft, remaining: grant.remaining }
}

/** Сохраняет карточку целиком, включая ручные правки. Upsert по (project_id, marketplace). */
export async function saveListingAction(
  input: unknown,
): Promise<{ readonly ok: true; readonly data: PromoListingView } | { readonly ok: false; readonly error: ListingError }> {
  const parsed = saveListingSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: 'anonymous' }
  if (!isSupabaseServiceConfigured()) return { ok: false, error: 'unavailable' }

  const sb = getSupabaseService()

  // Проверка владения проектом (P0-блокер ревью 14.08.2026): уникальный индекс
  // на promo_listings стоит на (project_id, marketplace) без user_id, поэтому
  // upsert по чужому projectId не создаёт строку рядом - он ПЕРЕТИРАЕТ чужую
  // карточку вместе с полем user_id. До сих пор это прикрывала только
  // неугадываемость uuid, что не защита вовсе.
  const { data: projectRow, error: projectError } = await sb
    .from('projects')
    .select('id')
    .eq('id', parsed.data.projectId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (projectError) return { ok: false, error: 'failed' }
  if (!projectRow) return { ok: false, error: 'notFound' }

  const { error } = await sb
    .from('promo_listings')
    .upsert(
      {
        user_id: user.id,
        project_id: parsed.data.projectId,
        marketplace: parsed.data.marketplace,
        title: parsed.data.title,
        description: parsed.data.description,
        bullets: parsed.data.bullets,
        tags: parsed.data.tags,
        selected_shot_ids: parsed.data.selectedShotIds,
        edited_by_user: true,
      },
      { onConflict: 'project_id,marketplace' },
    )
  if (error) return { ok: false, error: 'failed' }

  return {
    ok: true,
    data: {
      marketplace: parsed.data.marketplace,
      title: parsed.data.title,
      description: parsed.data.description,
      bullets: parsed.data.bullets,
      tags: parsed.data.tags,
      selectedShotIds: parsed.data.selectedShotIds,
    },
  }
}
