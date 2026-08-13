'use server'

import { assertAiAllowed, releaseAiQuota } from '@/lib/ai/entitlements'
import { compile } from '@/lib/engine'
import { parseDesign } from '@/lib/persist'
import { isGeminiConfigured } from '@/lib/promo/config'
import { describeBoard } from '@/lib/promo/describe'
import { boardSizeInches, demoListing, listingPrompt, type SaleListing } from '@/lib/promo/listing'
import { requestListing } from '@/lib/promo/listingRequest'
import type { AiDenyReason } from '@/lib/ai/quota'

/**
 * Отдельное действие от app/actions/promo.ts: тот файл уже 19 КБ, а карточка
 * товара логически не про фото. Сетевой ход к модели живёт в
 * lib/promo/listingRequest.ts (структурный тест network.test.ts), здесь
 * остаётся оркестрация: парсинг, гейт, квота.
 */

export type ListingError = AiDenyReason | 'invalid' | 'failed'

export type ListingResult =
  | { readonly ok: true; readonly mock: true; readonly listing: SaleListing }
  | { readonly ok: true; readonly mock: false; readonly listing: SaleListing; readonly remaining: number }
  | { readonly ok: false; readonly error: ListingError }

/**
 * Гейт: assertAiAllowed('saleListing', 1), ровно как у остальных платных
 * AI-фич, никакой второй проверки Pro тут быть не должно (lib/ai/entitlements.ts).
 * В демо-режиме (нет GEMINI_API_KEY) карточка собирается детерминированной
 * функцией demoListing и квота не трогается вовсе: платить не за что.
 */
export async function generateListingAction(design: unknown): Promise<ListingResult> {
  let checked
  try {
    checked = parseDesign(design)
  } catch {
    return { ok: false, error: 'invalid' }
  }

  const model = compile(checked)
  const description = describeBoard(checked, model)
  const sizeIn = boardSizeInches(model.widthMm, model.lengthMm, model.thicknessMm)

  if (!isGeminiConfigured()) {
    return { ok: true, mock: true, listing: demoListing(description, sizeIn) }
  }

  const grant = await assertAiAllowed('saleListing', 1)
  if (!grant.ok) return { ok: false, error: grant.reason }

  const result = await requestListing(listingPrompt(description, sizeIn))
  if (!result.ok) {
    await releaseAiQuota(grant)
    return { ok: false, error: 'failed' }
  }
  return { ok: true, mock: false, listing: result.listing, remaining: grant.remaining }
}
