import { describe, expect, it } from 'vitest'
import { centeredSquare, PRINTFUL_PLACEMENTS } from '@/lib/promo/printfulCatalog'
import type { PrintfulAuth } from '@/lib/promo/printful'
import type { MerchRecipient } from './recipient'
import { createPrintfulOrder, orderBody, type MerchOrderInput } from './printfulOrder'

const AUTH: PrintfulAuth = { apiKey: 'secret-key', storeId: '4242' }

const US_RECIPIENT: MerchRecipient = {
  name: 'John Doe',
  address1: '1 Main St',
  address2: null,
  city: 'Springfield',
  stateCode: 'IL',
  countryCode: 'US',
  zip: '62701',
  email: 'john@example.com',
  phone: '+15551234567',
}

const DE_RECIPIENT: MerchRecipient = {
  name: 'Max Mustermann',
  address1: 'Hauptstrasse 1',
  address2: null,
  city: 'Berlin',
  stateCode: null,
  countryCode: 'DE',
  zip: '10115',
  email: 'max@example.de',
  phone: null,
}

function input(overrides: Partial<MerchOrderInput> = {}): MerchOrderInput {
  return {
    orderId: 'order-1',
    product: 'tshirt',
    variantId: 4012,
    retailCents: 2199,
    printFileUrl: 'https://cdn.example/print.png',
    recipient: US_RECIPIENT,
    ...overrides,
  }
}

function res(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response
}

describe('orderBody', () => {
  it('external_id равен id заказа', () => {
    expect(orderBody(input()).external_id).toBe('order-1')
  })

  it('retail_price строкой с двумя знаками', () => {
    expect(orderBody(input({ retailCents: 2199 })).items[0]?.retail_price).toBe('21.99')
    expect(orderBody(input({ retailCents: 100 })).items[0]?.retail_price).toBe('1.00')
  })

  it('state_code есть для US и отсутствует для DE', () => {
    expect(orderBody(input({ recipient: US_RECIPIENT })).recipient.state_code).toBe('IL')
    expect(orderBody(input({ recipient: DE_RECIPIENT })).recipient.state_code).toBeUndefined()
  })

  it('позиция макета совпадает с centeredSquare области печати товара', () => {
    const body = orderBody(input({ product: 'mug' }))
    expect(body.items[0]?.files[0]?.position).toEqual(centeredSquare(PRINTFUL_PLACEMENTS.mug))
    expect(body.items[0]?.files[0]?.type).toBe(PRINTFUL_PLACEMENTS.mug.placement)
  })

  it('quantity всегда 1, shipping STANDARD, доставка в retail_costs нулевая (вшита в цену)', () => {
    const body = orderBody(input())
    expect(body.items[0]?.quantity).toBe(1)
    expect(body.shipping).toBe('STANDARD')
    expect(body.retail_costs.shipping).toBe('0.00')
  })

  it('phone и address2 не попадают в тело, если их нет у получателя', () => {
    const body = orderBody(input({ recipient: DE_RECIPIENT }))
    expect(body.recipient.phone).toBeUndefined()
    expect(body.recipient.address2).toBeUndefined()
  })
})

describe('createPrintfulOrder', () => {
  it('2xx с id даёт исход created', async () => {
    const fetchImpl = () => Promise.resolve(res({ code: 200, result: { id: 555 } }))
    const outcome = await createPrintfulOrder(input(), false, AUTH, fetchImpl)
    expect(outcome).toEqual({ kind: 'created', printfulOrderId: '555' })
  })

  it('confirm=false и confirm=true уходят в URL как есть', async () => {
    let calledUrl = ''
    const fetchImpl = (url: string) => {
      calledUrl = url
      return Promise.resolve(res({ code: 200, result: { id: 1 } }))
    }
    await createPrintfulOrder(input(), false, AUTH, fetchImpl)
    expect(calledUrl).toContain('confirm=false')
    await createPrintfulOrder(input(), true, AUTH, fetchImpl)
    expect(calledUrl).toContain('confirm=true')
  })

  it('4xx с "external_id" в тексте ошибки трактуется как exists (§6.4)', async () => {
    const fetchImpl = () =>
      Promise.resolve(res({ code: 400, error: { message: 'Order with this external_id already exists' } }, false, 400))
    const outcome = await createPrintfulOrder(input(), false, AUTH, fetchImpl)
    expect(outcome).toEqual({ kind: 'exists' })
  })

  it('прочие 4xx дают rejected', async () => {
    const fetchImpl = () => Promise.resolve(res({ code: 400, error: { message: 'Invalid recipient country' } }, false, 400))
    const outcome = await createPrintfulOrder(input(), false, AUTH, fetchImpl)
    expect(outcome.kind).toBe('rejected')
  })

  it('5xx даёт retry', async () => {
    const fetchImpl = () => Promise.resolve(res({ error: { message: 'internal error' } }, false, 502))
    const outcome = await createPrintfulOrder(input(), false, AUTH, fetchImpl)
    expect(outcome.kind).toBe('retry')
  })

  it('429 тоже даёт retry (лимит, а не наши кривые данные)', async () => {
    const fetchImpl = () => Promise.resolve(res({ error: { message: 'too many requests' } }, false, 429))
    const outcome = await createPrintfulOrder(input(), false, AUTH, fetchImpl)
    expect(outcome.kind).toBe('retry')
  })

  it('брошенный fetch (сеть/таймаут) даёт retry, а не исключение наружу', async () => {
    const fetchImpl = () => Promise.reject(new Error('network error'))
    const outcome = await createPrintfulOrder(input(), false, AUTH, fetchImpl)
    expect(outcome.kind).toBe('retry')
  })

  it('2xx без result.id тоже даёт retry: ответ не тот, каким его ждали', async () => {
    const fetchImpl = () => Promise.resolve(res({ code: 200, result: {} }))
    const outcome = await createPrintfulOrder(input(), false, AUTH, fetchImpl)
    expect(outcome.kind).toBe('retry')
  })
})
