import 'server-only'

import { GEMINI_API_KEY } from '@/lib/promo/config'
import { LISTING_RESPONSE_SCHEMA, parseListing, type SaleListing } from '@/lib/promo/listing'

/**
 * Сетевой ход к Gemini за карточкой товара, вынесен из server action по тому же
 * правилу, что lib/promo/visionAnalyze.ts: наружу к моделям ходят только модули
 * в lib, действие остаётся оркестрацией гейта и квоты (см. структурный тест
 * lib/ai/providers/network.test.ts). Текстовая задача с responseSchema, не
 * подходит под интерфейс ImageProvider и не имеет fallback по дизайну.
 */
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const REQUEST_TIMEOUT_MS = 20_000

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

export type ListingRequestResult =
  | { readonly ok: true; readonly listing: SaleListing }
  | { readonly ok: false }

export async function requestListing(prompt: string): Promise<ListingRequestResult> {
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
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
      return { ok: false }
    }
    const body = (await res.json()) as GeminiResponse
    const listing = parseListing(allText(body))
    if (listing === null) {
      console.error('gemini listing: ответ без карточки')
      return { ok: false }
    }
    return { ok: true, listing }
  } catch (err) {
    console.error(`gemini listing: ${err instanceof Error ? err.name : 'unknown error'}`)
    return { ok: false }
  }
}
