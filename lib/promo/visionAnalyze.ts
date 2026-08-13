import 'server-only'
import { GEMINI_API_KEY } from '@/lib/promo/config'
import { ANALYSIS_PROMPT, ANALYSIS_RESPONSE_SCHEMA, parseStyleAnalysis, type StyleAnalysis } from '@/lib/promo/reference'

/**
 * Разбор референса это текстовая задача с картинкой на входе, рисовать тут
 * нечего, поэтому модель другая: обычная flash с vision. Она и дешевле, и
 * умеет responseSchema, чего image-модель не умеет вовсе.
 *
 * Живёт отдельно от app/actions/promo.ts и от lib/ai/providers: это не
 * image-провайдер (интерфейс ImageProvider ждёт картинку на выходе, а тут
 * структурированный JSON), подменять vision-разбор нечем, fallback у него
 * нет. Вынесен сюда, а не в действие, чтобы структурный тест "весь сетевой
 * ход к моделям идёт через выделенные модули, а не прямо из app/actions и
 * components" не путал этот единственный законный обходной путь с забытым
 * прямым fetch.
 */
const GEMINI_VISION_MODEL = 'gemini-2.5-flash'
const GEMINI_VISION_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VISION_MODEL}:generateContent`

/** Разбор кадра это несколько сотен токенов текста: столько ждать незачем. */
const VISION_TIMEOUT_MS = 20_000

interface GeminiPart {
  readonly text?: string
}
interface GeminiResponse {
  readonly candidates?: readonly { readonly content?: { readonly parts?: readonly GeminiPart[] } }[]
  readonly error?: { readonly status?: string; readonly code?: number }
}

/** Весь текст ответа одной строкой: JSON модель иногда режет на несколько частей. */
function allText(body: GeminiResponse): string {
  return (body.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim()
}

export type VisionOutcome =
  | { readonly kind: 'style'; readonly style: StyleAnalysis }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'failed' }

/** Перенос существующей логики разбора один в один: та же модель, тот же таймаут, тот же разбор ответа. */
export async function analyzeReferenceImage(image: { readonly mimeType: string; readonly data: string }): Promise<VisionOutcome> {
  try {
    const res = await fetch(GEMINI_VISION_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: ANALYSIS_PROMPT }, { inlineData: image }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: ANALYSIS_RESPONSE_SCHEMA },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
    })
    if (!res.ok) {
      let code = ''
      try {
        code = ((await res.json()) as GeminiResponse).error?.status ?? ''
      } catch {
        code = ''
      }
      console.error(`gemini reference: HTTP ${res.status}${code === '' ? '' : ` ${code}`}`)
      return { kind: 'failed' }
    }
    const body = (await res.json()) as GeminiResponse
    const style = parseStyleAnalysis(allText(body))
    if (style === null) {
      // Ответ без разбора: чаще всего модель отказалась смотреть на картинку.
      console.error('gemini reference: ответ без разбора')
      return (body.candidates?.length ?? 0) === 0 ? { kind: 'blocked' } : { kind: 'failed' }
    }
    return { kind: 'style', style }
  } catch (err) {
    console.error(`gemini reference: ${err instanceof Error ? err.name : 'unknown error'}`)
    return { kind: 'failed' }
  }
}
