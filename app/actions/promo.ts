'use server'

import { headers } from 'next/headers'
import { GEMINI_API_KEY, isGeminiConfigured, isPrintfulConfigured } from '@/lib/promo/config'
import { PROMO_SHOTS, type MerchResult, type PromoImage, type PromoResult, type PromoShotKind } from '@/lib/promo/types'
import { shotPrompt } from '@/lib/promo/prompts'
import { promoShotsSchema } from '@/lib/promo/schema'
import { PER_IP_PER_HOUR, PER_IP_PER_HOUR_ANON, clientIp, promoLimiter } from '@/lib/promo/rateLimit'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getCurrentUser } from '@/lib/supabase/session'

const GEMINI_MODEL = 'gemini-2.5-flash-image'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/** Картинка иногда рисуется долго, но висеть до бесконечности запрос не имеет права. */
const REQUEST_TIMEOUT_MS = 30_000

interface GeminiPart {
  readonly inlineData?: { readonly mimeType?: string; readonly data?: string }
  readonly inline_data?: { readonly mime_type?: string; readonly data?: string }
}
interface GeminiResponse {
  readonly candidates?: readonly { readonly content?: { readonly parts?: readonly GeminiPart[] } }[]
  readonly error?: { readonly status?: string; readonly code?: number }
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

/** Что вышло с одним кадром: картинка, отказ модели по своим правилам или сбой. */
type ShotOutcome = { readonly kind: 'image'; readonly image: PromoImage } | 'blocked' | 'failed'

async function requestShot(kind: PromoShotKind, prompt: string, base64: string): Promise<ShotOutcome> {
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/png', data: base64 } }] },
        ],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      // В лог уходит только статус и код ошибки: ни тела ответа, ни тем более ключа.
      let code = ''
      try {
        code = ((await res.json()) as GeminiResponse).error?.status ?? ''
      } catch {
        code = ''
      }
      console.error(`gemini ${kind}: HTTP ${res.status}${code === '' ? '' : ` ${code}`}`)
      return 'failed'
    }
    const body = (await res.json()) as GeminiResponse
    const dataUrl = firstImage(body)
    if (dataUrl !== null) return { kind: 'image', image: { kind, dataUrl } }
    // 200 без единого кандидата это отказ модели по своим правилам, а не сбой связи.
    console.error(`gemini ${kind}: ответ без картинки`)
    return (body.candidates?.length ?? 0) === 0 ? 'blocked' : 'failed'
  } catch (err) {
    // Таймаут, обрыв сети или битый JSON: кадр теряем, серию нет.
    console.error(`gemini ${kind}: ${err instanceof Error ? err.name : 'unknown error'}`)
    return 'failed'
  }
}

/**
 * Серия продуктовых кадров через Gemini (модель gemini-2.5-flash-image, она же Nano Banana).
 * Ключ читается только здесь, на сервере: в клиентский бандл он не попадает никогда.
 * Без ключа возвращаем mock: true, и вкладка рисует собственные заглушки поверх рендера доски.
 *
 * Действие публичное и платное, поэтому до первого запроса наружу оно проходит счётчик
 * из lib/promo/rateLimit: личный лимит на адрес плюс общий дневной потолок.
 * maxDuration для этого действия задан на странице, которая его вызывает (app/page.tsx):
 * из файла с 'use server' Next разрешает экспортировать только асинхронные функции.
 */
export async function generatePromoShotsAction(input: unknown): Promise<PromoResult> {
  const parsed = promoShotsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }

  if (!isGeminiConfigured()) return { ok: true, mock: true, kinds: PROMO_SHOTS }

  const head = await headers()
  // Аккаунты в проекте есть, а человек не вошёл: генерацию не запрещаем, но лимит жёстче.
  const anonymous = isSupabaseConfigured() && (await getCurrentUser()) === null
  const verdict = promoLimiter.take(
    clientIp(head.get('x-forwarded-for'), head.get('x-real-ip')),
    anonymous ? PER_IP_PER_HOUR_ANON : PER_IP_PER_HOUR,
    Date.now(),
  )
  if (verdict !== 'ok') return { ok: false, error: 'rateLimited' }

  const base64 = parsed.data.boardPng.slice(parsed.data.boardPng.indexOf(',') + 1)

  // Четыре кадра параллельно: последовательно это минута ожидания на пустом экране.
  // Каждый кадр ловит свои ошибки сам, поэтому один обрыв не выбрасывает три оплаченных.
  const outcomes = await Promise.all(
    PROMO_SHOTS.map((kind) => requestShot(kind, shotPrompt(kind, parsed.data.description), base64)),
  )

  const images = outcomes.flatMap((outcome) => (typeof outcome === 'string' ? [] : [outcome.image]))
  if (images.length > 0) return { ok: true, mock: false, images }
  return { ok: false, error: outcomes.every((outcome) => outcome === 'blocked') ? 'blocked' : 'failed' }
}

/**
 * Мокапы мерча. Силуэты и узор рисует клиент сам, наружу не ходит никто, поэтому
 * единственное, чего клиент не может узнать без сервера, это наличие ключа Printful:
 * от него зависит, показывать ли кнопку «Открыть в Printful».
 * Полноценная генерация мокапов на стороне Printful отложена, причины в MerchResult.
 */
export async function createMerchMockupsAction(): Promise<MerchResult> {
  return { printful: isPrintfulConfigured() }
}
