'use server'

import { GEMINI_API_KEY, PRINTFUL_API_KEY, isGeminiConfigured, isPrintfulConfigured } from '@/lib/promo/config'
import { MERCH_PRODUCTS, PROMO_SHOTS, type MerchMockup, type MerchResult, type PromoImage, type PromoResult } from '@/lib/promo/types'
import { shotPrompt } from '@/lib/promo/prompts'
import { merchSchema, promoShotsSchema } from '@/lib/promo/schema'

const GEMINI_MODEL = 'gemini-2.5-flash-image'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const PRINTFUL_API = 'https://api.printful.com'

interface GeminiPart {
  readonly inlineData?: { readonly mimeType?: string; readonly data?: string }
  readonly inline_data?: { readonly mime_type?: string; readonly data?: string }
}
interface GeminiResponse {
  readonly candidates?: readonly { readonly content?: { readonly parts?: readonly GeminiPart[] } }[]
}

/** Первая картинка из ответа. Gemini кладёт рядом с ней текст, его молча выбрасываем. */
function firstImage(body: GeminiResponse): string | null {
  const parts = body.candidates?.[0]?.content?.parts ?? []
  for (const part of parts) {
    const data = part.inlineData?.data ?? part.inline_data?.data
    const mime = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? 'image/png'
    if (typeof data === 'string' && data.length > 0) return `data:${mime};base64,${data}`
  }
  return null
}

/**
 * Серия продуктовых кадров через Gemini (модель gemini-2.5-flash-image, она же Nano Banana).
 * Ключ читается только здесь, на сервере: в клиентский бандл он не попадает никогда.
 * Без ключа возвращаем mock: true, и вкладка рисует собственные заглушки поверх рендера доски.
 */
export async function generatePromoShotsAction(input: unknown): Promise<PromoResult> {
  const parsed = promoShotsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  if (!isGeminiConfigured()) return { ok: true, mock: true, kinds: PROMO_SHOTS }

  const base64 = parsed.data.boardPng.slice(parsed.data.boardPng.indexOf(',') + 1)

  try {
    // Четыре кадра параллельно: последовательно это минута ожидания на пустом экране.
    // Упавший кадр не роняет серию, он просто не попадает в галерею.
    const settled = await Promise.all(
      PROMO_SHOTS.map(async (kind): Promise<PromoImage | null> => {
        const res = await fetch(GEMINI_URL, {
          method: 'POST',
          headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: shotPrompt(kind, parsed.data.description) },
                  { inlineData: { mimeType: 'image/png', data: base64 } },
                ],
              },
            ],
          }),
          cache: 'no-store',
        })
        if (!res.ok) return null
        const dataUrl = firstImage((await res.json()) as GeminiResponse)
        return dataUrl === null ? null : { kind, dataUrl }
      }),
    )
    const images = settled.filter((image): image is PromoImage => image !== null)
    if (images.length === 0) return { ok: false, error: 'failed' }
    return { ok: true, mock: false, images }
  } catch {
    // Сеть упала или Gemini недоступен: пользователю честная ошибка, а не белый экран.
    return { ok: false, error: 'failed' }
  }
}

interface PrintfulTask {
  readonly result?: {
    readonly status?: string
    readonly mockups?: readonly { readonly mockup_url?: string }[]
  }
}

/**
 * Мокапы мерча через Printful Mockup Generator.
 * Printful тянет картинку узора по публичному https-адресу со своей стороны, поэтому
 * без такого адреса даже с ключом честнее показать собственные силуэты, чем врать ошибкой.
 * Флаг printful в ответе включает кнопку «Открыть в Printful»: без ключа ей некуда вести.
 */
export async function createMerchMockupsAction(input: unknown): Promise<MerchResult> {
  const parsed = merchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  if (!isPrintfulConfigured()) return { ok: true, source: 'local', printful: false }

  const patternUrl = parsed.data.patternUrl
  if (patternUrl === undefined) return { ok: true, source: 'local', printful: true }

  try {
    const mockups: MerchMockup[] = []
    for (const product of MERCH_PRODUCTS) {
      const res = await fetch(`${PRINTFUL_API}/mockup-generator/create-task/${product.printfulProductId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${PRINTFUL_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [{ placement: 'front', image_url: patternUrl, position: null }] }),
        cache: 'no-store',
      })
      if (!res.ok) continue
      const body = (await res.json()) as PrintfulTask
      const url = body.result?.mockups?.[0]?.mockup_url
      if (typeof url === 'string' && url.length > 0) mockups.push({ id: product.id, url })
    }
    if (mockups.length === 0) return { ok: true, source: 'local', printful: true }
    return { ok: true, source: 'printful', mockups }
  } catch {
    return { ok: false, error: 'failed' }
  }
}
