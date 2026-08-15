import type { OneTimeShipping } from '@/lib/stripe/oneTime'

/**
 * Получатель заказа Printful, собранный из адреса Stripe Checkout (§6.3 спеки).
 * `null` из recipientFrom означает «печатать физически некуда»: ретраить нечего,
 * адрес в событии больше не появится, заказ уходит в failed.
 */
export interface MerchRecipient {
  readonly name: string
  readonly address1: string
  readonly address2: string | null
  readonly city: string
  /** Обязателен для US/CA/AU, для остальных стран должен быть null, не пустой строкой. */
  readonly stateCode: string | null
  readonly countryCode: string
  readonly zip: string
  readonly email: string
  readonly phone: string | null
}

/** Страны, где Printful требует state_code. Лишний state_code на прочих странах даёт 400. */
const STATE_REQUIRED_COUNTRIES: ReadonlySet<string> = new Set(['US', 'CA', 'AU'])

function nonEmpty(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Обязательные поля: address1, city, country_code, zip, name, email, плюс
 * state_code для US/CA/AU. Печать без адреса невозможна физически (§6.3).
 */
export function recipientFrom(shipping: OneTimeShipping | null): MerchRecipient | null {
  if (shipping === null) return null

  const name = nonEmpty(shipping.name)
  const address1 = nonEmpty(shipping.line1)
  const city = nonEmpty(shipping.city)
  const country = nonEmpty(shipping.country)
  const zip = nonEmpty(shipping.postalCode)
  const email = nonEmpty(shipping.email)
  if (name === null || address1 === null || city === null || country === null || zip === null || email === null) {
    return null
  }

  const state = nonEmpty(shipping.state)
  if (STATE_REQUIRED_COUNTRIES.has(country) && state === null) return null

  return {
    name,
    address1,
    address2: nonEmpty(shipping.line2),
    city,
    stateCode: state,
    countryCode: country,
    zip,
    email,
    phone: nonEmpty(shipping.phone),
  }
}
