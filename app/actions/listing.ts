'use server'

import { assertAiAllowed, releaseAiQuota } from '@/lib/ai/entitlements'
import { compile } from '@/lib/engine'
import { parseDesign } from '@/lib/persist'
import { GEMINI_API_KEY, isGeminiConfigured } from '@/lib/promo/config'
import { describeBoard } from '@/lib/promo/describe'
import {
  LISTING_RESPONSE_SCHEMA,
  boardSizeInches,
  demoListing,
  listingPrompt,
  parseListing,
  type SaleListing,
} from '@/lib/promo/listing'
import type { AiDenyReason } from '@/lib/ai/quota'

/**
 * Отдельное действие от app/actions/promo.ts: тот файл уже 19 КБ, а карточка
 * товара логически не про фото. Сама модель и приём JSON через responseSchema
 * скопированы буквально с analyzeReferenceAction, кроме vision-части: на вход
 * идёт только текст, картинки нет вовсе, поэтому запрос дешевле и быстрее.
 */
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const REQUEST_TIMEOUT_MS = 20_000

export type ListingError = AiDenyReason | 'invalid' | 'failed'

export type ListingResult =
  | { readonly ok: true; readonly mock: true; readonly listing: SaleListing }
  | { readonly ok: true; readonly mock: false; readonly listing: SaleListing; readonly remaining: number }
  | { readonly ok: false; readonly error: ListingError }

interface GeminiResponse {
  readonly candidates?: readonly { readonly content?: { readonly parts?: readonly { readonly text?: string }[] } }[]
  readonly error?: { readonly status?: string; readonly code?: number }
}

function allText(body: GeminiResponse): string {
  return (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim()
}

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

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: listingPrompt(description, sizeIn) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: LISTING_RESPONSE_SCHEMA },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      let code = ''
      try {
        code = ((await res.json()) as GeminiResponse).error?.status ?? ''
      } catch {
        code = ''
      }
      console.error(`gemini listing: HTTP ${res.status}${code === '' ? '' : ` ${code}`}`)
      await releaseAiQuota(grant)
      return { ok: false, error: 'failed' }
    }
    const body = (await res.json()) as GeminiResponse
    const listing = parseListing(allText(body))
    if (listing === null) {
      console.error('gemini listing: ответ без карточки')
      await releaseAiQuota(grant)
      return { ok: false, error: 'failed' }
    }
    return { ok: true, mock: false, listing, remaining: grant.remaining }
  } catch (err) {
    console.error(`gemini listing: ${err instanceof Error ? err.name : 'unknown error'}`)
    await releaseAiQuota(grant)
    return { ok: false, error: 'failed' }
  }
}
