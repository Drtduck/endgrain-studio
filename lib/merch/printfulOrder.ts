import { PRINTFUL_API, PRINTFUL_TIMEOUT_MS, printfulHeaders, type PrintfulAuth, type PrintfulFetch } from '@/lib/promo/printful'
import { PRINTFUL_PLACEMENTS, centeredSquare } from '@/lib/promo/printfulCatalog'
import type { MerchProductId } from '@/lib/promo/types'
import type { MerchRecipient } from './recipient'

/**
 * Заказ Printful (§4.3, §6.4 спеки). Та же схема разделения, что в
 * lib/promo/printful.ts: сеть за параметром fetchImpl, разбор тела в чистой
 * функции orderBody, тест гоняет весь пайплайн без единого байта наружу.
 */

export interface MerchOrderInput {
  /** Наш id заказа: ключ идемпотентности Printful (external_id, §6.4). */
  readonly orderId: string
  readonly product: MerchProductId
  readonly variantId: number
  readonly retailCents: number
  readonly printFileUrl: string
  readonly recipient: MerchRecipient
}

export interface PrintfulOrderBody {
  readonly external_id: string
  readonly shipping: string
  readonly recipient: {
    readonly name: string
    readonly address1: string
    readonly address2?: string
    readonly city: string
    readonly state_code?: string
    readonly country_code: string
    readonly zip: string
    readonly email: string
    readonly phone?: string
  }
  readonly items: readonly {
    readonly variant_id: number
    readonly quantity: number
    readonly retail_price: string
    readonly files: readonly {
      readonly type: string
      readonly url: string
      readonly position: ReturnType<typeof centeredSquare>
    }[]
  }[]
  readonly retail_costs: { readonly currency: string; readonly subtotal: string; readonly shipping: string }
}

/** Тело POST /orders. Чистая функция: тестируется напрямую без сети. */
export function orderBody(input: MerchOrderInput): PrintfulOrderBody {
  const place = PRINTFUL_PLACEMENTS[input.product]
  const recipient = input.recipient
  return {
    external_id: input.orderId,
    shipping: 'STANDARD',
    recipient: {
      name: recipient.name,
      address1: recipient.address1,
      ...(recipient.address2 !== null ? { address2: recipient.address2 } : {}),
      city: recipient.city,
      ...(recipient.stateCode !== null ? { state_code: recipient.stateCode } : {}),
      country_code: recipient.countryCode,
      zip: recipient.zip,
      email: recipient.email,
      ...(recipient.phone !== null ? { phone: recipient.phone } : {}),
    },
    items: [
      {
        variant_id: input.variantId,
        quantity: 1,
        retail_price: (input.retailCents / 100).toFixed(2),
        files: [{ type: place.placement, url: input.printFileUrl, position: centeredSquare(place) }],
      },
    ],
    retail_costs: { currency: 'usd', subtotal: (input.retailCents / 100).toFixed(2), shipping: '0.00' },
  }
}

interface PrintfulOrderResponse {
  readonly code?: number
  readonly result?: { readonly id?: number | string }
  readonly error?: { readonly reason?: string; readonly message?: string }
}

/**
 * Исход похода в Printful (§6.2, §6.4). Четыре ветки, а не булев успех/провал,
 * потому что вебхуку нужно ответить Stripe по-разному на каждую:
 * - created / exists -> 200, заказ довести до draft_created;
 * - rejected (прочие 4xx) -> 200, заказ в failed, ретрай не поможет;
 * - retry (5xx/таймаут/сеть) -> 500, Stripe повторит доставку.
 */
export type PrintfulOrderOutcome =
  | { readonly kind: 'created'; readonly printfulOrderId: string }
  | { readonly kind: 'exists' }
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'retry'; readonly message: string }

async function readJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

/**
 * POST /orders?confirm=... Идемпотентность на internal_id: повторная доставка
 * события Stripe после «мы создали заказ, но не успели записать ответ» шлёт
 * тот же external_id и получает 4xx «order with this external_id already
 * exists» - трактуется как успех (§6.4, п.3). Печатать сюда некуда конкретный
 * машинный код: Printful не даёт его на этот случай, поэтому распознаём по
 * подстроке 'external_id' в тексте ошибки.
 */
export async function createPrintfulOrder(
  input: MerchOrderInput,
  confirm: boolean,
  auth: PrintfulAuth,
  fetchImpl: PrintfulFetch,
): Promise<PrintfulOrderOutcome> {
  try {
    const res = await fetchImpl(`${PRINTFUL_API}/orders?confirm=${confirm ? 'true' : 'false'}`, {
      method: 'POST',
      headers: printfulHeaders(auth),
      body: JSON.stringify(orderBody(input)),
      cache: 'no-store',
      signal: AbortSignal.timeout(PRINTFUL_TIMEOUT_MS),
    })
    const body = await readJson<PrintfulOrderResponse>(res)
    if (res.ok) {
      const id = body?.result?.id
      if (id === undefined) {
        console.error('printful order: 2xx без result.id', { orderId: input.orderId })
        return { kind: 'retry', message: 'ответ без id заказа' }
      }
      return { kind: 'created', printfulOrderId: String(id) }
    }

    const message = body?.error?.message ?? ''
    console.error(`printful order ${input.orderId}: HTTP ${res.status} ${message}`)

    if (message.toLowerCase().includes('external_id')) return { kind: 'exists' }
    if (res.status >= 500) return { kind: 'retry', message: `HTTP ${res.status} ${message}` }
    if (res.status === 429) return { kind: 'retry', message: `HTTP 429 ${message}` }
    return { kind: 'rejected', message: `HTTP ${res.status} ${message}` }
  } catch (err) {
    const message = err instanceof Error ? err.name : 'unknown error'
    console.error(`printful order ${input.orderId}: ${message}`)
    return { kind: 'retry', message }
  }
}
