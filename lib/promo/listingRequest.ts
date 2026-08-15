import 'server-only'

import { GEMINI_API_KEY, OPENROUTER_API_KEY, OPENROUTER_TEXT_MODEL, isGeminiConfigured, isOpenRouterConfigured } from '@/lib/promo/config'
import { isMeaningfulListing, LISTING_RESPONSE_SCHEMA, parseListing, type SaleListing } from '@/lib/promo/listing'

/**
 * Сетевой ход к моделям за карточкой товара, вынесен из server action по тому
 * же правилу, что lib/promo/visionAnalyze.ts: наружу к моделям ходят только
 * модули в lib, действие остаётся оркестрацией гейта и квоты (см. структурный
 * тест lib/ai/providers/network.test.ts).
 *
 * Основной путь - Gemini с responseSchema (строгий JSON без блуждания формата).
 * Fallback - OpenRouter (chat.completions, бесплатная модель): responseSchema
 * там нет, поэтому формат ответа держится жёсткой инструкцией в промпте и
 * снисходительным разбором. Картинки на OpenRouter не переезжают - это
 * текстовый fallback только для карточки товара, генератор кадров остаётся
 * на fal (lib/ai/providers/fal.ts).
 */
const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const REQUEST_TIMEOUT_MS = 20_000

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
/**
 * nano-30b по замерам отвечает ~21с, в 20-секундный таймаут Gemini не укладывается -
 * отдельная, более длинная константа именно под OpenRouter.
 */
const OPENROUTER_REQUEST_TIMEOUT_MS = 45_000
/** Карточка - это ~600 токенов JSON, 4000 был явно с запасом. */
const OPENROUTER_MAX_TOKENS = 1600
/** Запасной автороутер бесплатных моделей: одна попытка, если основная бесплатная модель отказала или отдала пустой ответ. */
const OPENROUTER_FALLBACK_MODEL = 'openrouter/free'
/**
 * Запасную модель имеет смысл пробовать только если основная отказала быстро
 * (например, мгновенный 429 rate-limit) - тогда есть время на вторую попытку.
 * Если основная уже съела время до этого порога, две долгие попытки подряд не
 * влезают в лимит серверной функции, и юзер ждёт вечность ради демо-черновика.
 */
const FALLBACK_ATTEMPT_THRESHOLD_MS = 10_000

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

async function requestGemini(prompt: string): Promise<SaleListing | null> {
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
      return null
    }
    const body = (await res.json()) as GeminiResponse
    const listing = parseListing(allText(body))
    if (listing === null) {
      console.error('gemini listing: ответ без карточки')
      return null
    }
    const meaningful = isMeaningfulListing(listing)
    if (meaningful === null) {
      console.error('gemini listing: карточка без содержания (плейсхолдеры)')
      return null
    }
    return meaningful
  } catch (err) {
    console.error(`gemini listing: ${err instanceof Error ? err.name : 'unknown error'}`)
    return null
  }
}

/** System-сообщение под reasoning:false - жёстко задаёт формат ответа отдельно от пользовательского промпта. */
const OPENROUTER_SYSTEM_PROMPT = 'You write marketplace product listings. Output ONLY a JSON object matching the given schema, no commentary.'

/** Жёсткая инструкция по формату ответа: у OpenRouter нет responseSchema, модель без неё иногда добавляет прозу или ```-заборы. */
function openRouterListingPrompt(prompt: string): string {
  return [
    prompt,
    '',
    'Return ONLY a JSON object matching this schema, no markdown fences, no commentary:',
    JSON.stringify(LISTING_RESPONSE_SCHEMA),
  ].join('\n')
}

/** Срезает возможные ```json-заборы и текст до/после JSON-объекта: тот же приём, что и в parseListing/parseMarketplaceListing, но нужен ДО разбора, а не внутри. */
function stripToJsonObject(text: string): string {
  const withoutFences = text.replace(/```json/gi, '').replace(/```/g, '').trim()
  const start = withoutFences.indexOf('{')
  const end = withoutFences.lastIndexOf('}')
  if (start >= 0 && end > start) return withoutFences.slice(start, end + 1)
  return withoutFences
}

interface OpenRouterResponse {
  readonly choices?: readonly { readonly message?: { readonly content?: string } }[]
  readonly error?: { readonly message?: string; readonly code?: unknown }
}

/** Один запрос к chat.completions под конкретную модель. null - модель отказала, вызывающий код сам решает, пробовать ли следующую. */
async function requestOpenRouterModel(prompt: string, model: string): Promise<SaleListing | null> {
  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: OPENROUTER_SYSTEM_PROMPT },
          { role: 'user', content: openRouterListingPrompt(prompt) },
        ],
        max_tokens: OPENROUTER_MAX_TOKENS,
        // nemotron - reasoning-модель: без явного отключения "размышления" съедают
        // max_tokens целиком, а в ответ прилетает огрызок JSON с плейсхолдерами
        // ('...' вместо title/description) - баг с прода, воспроизведён и подтверждён
        // живым запросом. С этим флагом модель отвечает чистым JSON без раздумий.
        reasoning: { enabled: false },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(OPENROUTER_REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      let message = ''
      try {
        message = ((await res.json()) as OpenRouterResponse).error?.message ?? ''
      } catch {
        message = ''
      }
      console.error(`openrouter listing: HTTP ${res.status}${message === '' ? '' : ` ${message}`} (${model})`)
      return null
    }
    const body = (await res.json()) as OpenRouterResponse
    const content = body.choices?.[0]?.message?.content ?? ''
    if (content.trim().length === 0) {
      console.error(`openrouter listing: пустой ответ (${model})`)
      return null
    }
    const listing = parseListing(stripToJsonObject(content))
    if (listing === null) {
      console.error(`openrouter listing: ответ без карточки (${model})`)
      return null
    }
    const meaningful = isMeaningfulListing(listing)
    if (meaningful === null) {
      console.error(`openrouter listing: карточка без содержания (плейсхолдеры) (${model})`)
      return null
    }
    return meaningful
  } catch (err) {
    console.error(`openrouter listing: ${err instanceof Error ? err.name : 'unknown error'} (${model})`)
    return null
  }
}

/**
 * Основная бесплатная модель, при отказе - запасной автороутер, но только если
 * основная модель отказала быстро (см. FALLBACK_ATTEMPT_THRESHOLD_MS): иначе
 * бюджет серверной функции на вторую долгую попытку уже не остаётся.
 */
async function requestOpenRouter(prompt: string): Promise<SaleListing | null> {
  if (!isOpenRouterConfigured()) return null
  const startedAt = Date.now()
  const primary = await requestOpenRouterModel(prompt, OPENROUTER_TEXT_MODEL)
  if (primary !== null) return primary
  const elapsedMs = Date.now() - startedAt
  if (elapsedMs >= FALLBACK_ATTEMPT_THRESHOLD_MS) return null
  return requestOpenRouterModel(prompt, OPENROUTER_FALLBACK_MODEL)
}

/**
 * Пробует Gemini, при неудаче (или если он не настроен) - OpenRouter. Оба
 * недоступны или оба упали - { ok: false }: действие само решит, отдавать ли
 * демо-заготовку вместо красной плашки (app/actions/listing.ts).
 */
export async function requestListing(prompt: string): Promise<ListingRequestResult> {
  if (isGeminiConfigured()) {
    const listing = await requestGemini(prompt)
    if (listing !== null) return { ok: true, listing }
  }
  if (isOpenRouterConfigured()) {
    const listing = await requestOpenRouter(prompt)
    if (listing !== null) return { ok: true, listing }
  }
  return { ok: false }
}
