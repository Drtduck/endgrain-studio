import 'server-only'
import { GEMINI_API_KEY } from '@/lib/promo/config'
import type { ImageOutcome, ImageProvider, ImageRequest } from './types'

const GEMINI_MODEL = 'gemini-2.5-flash-image'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

/** Картинка иногда рисуется долго, но висеть до бесконечности запрос не имеет права. */
const REQUEST_TIMEOUT_MS = 30_000

interface GeminiPart {
  readonly text?: string
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

/**
 * Перенос существующего requestShot из app/actions/promo.ts один в один: та же
 * модель, тот же таймаут, та же схема разбора ответа, тот же лог без тела
 * ответа и без ключа. Любое изменение промпта или модели здесь запрещено,
 * иначе регрессию не отличить от рефакторинга.
 */
export async function generate(req: ImageRequest): Promise<ImageOutcome> {
  const timeoutMs = req.timeoutMs ?? REQUEST_TIMEOUT_MS
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts:
              req.referencePngBase64 === undefined
                ? [{ text: req.prompt }]
                : [{ text: req.prompt }, { inlineData: { mimeType: 'image/png', data: req.referencePngBase64 } }],
          },
        ],
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) {
      // В лог уходит только статус и код ошибки: ни тела ответа, ни тем более ключа.
      let code = ''
      try {
        code = ((await res.json()) as GeminiResponse).error?.status ?? ''
      } catch {
        code = ''
      }
      console.error(`gemini: HTTP ${res.status}${code === '' ? '' : ` ${code}`}`)
      // 401 не лечится повтором в тот же ключ, остальное (429, 5xx) может пройти со второй попытки.
      return { kind: 'failed', provider: 'gemini', retryable: res.status !== 401 }
    }
    const body = (await res.json()) as GeminiResponse
    const dataUrl = firstImage(body)
    if (dataUrl !== null) return { kind: 'image', dataUrl, provider: 'gemini' }
    // 200 без единого кандидата это отказ модели по своим правилам, а не сбой связи.
    console.error('gemini: ответ без картинки')
    return (body.candidates?.length ?? 0) === 0
      ? { kind: 'blocked', provider: 'gemini' }
      : { kind: 'failed', provider: 'gemini', retryable: true }
  } catch (err) {
    // Таймаут, обрыв сети или битый JSON: кадр теряем, серию нет.
    console.error(`gemini: ${err instanceof Error ? err.name : 'unknown error'}`)
    return { kind: 'failed', provider: 'gemini', retryable: true }
  }
}

export const geminiProvider: ImageProvider = { id: 'gemini', tier: 'good', generate }
