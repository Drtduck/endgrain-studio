import { createHmac, timingSafeEqual } from 'node:crypto'

export interface VerifyInput {
  readonly payload: string
  readonly header: string | null
  readonly secret: string
  readonly nowMs?: number
  readonly toleranceSec?: number
}

export type VerifyFailure = 'no-header' | 'no-secret' | 'malformed' | 'mismatch' | 'too-old'
export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure }

const DEFAULT_TOLERANCE_SEC = 300

/**
 * Заголовок Stripe-Signature имеет вид t=1699999999,v1=hex,v1=hex.
 * Подписывается строка `${t}.${payload}` по HMAC-SHA256 секретом whsec_...
 * Схем v1 может быть несколько (во время ротации секрета), достаточно совпадения любой.
 *
 * SDK stripe тут не нужен: это двадцать строк на node:crypto, зато проверка
 * покрывается честным unit-тестом без единого мока.
 */
export function verifyStripeSignature(input: VerifyInput): VerifyResult {
  const { payload, header, secret } = input
  if (header === null || header.length === 0) return { ok: false, reason: 'no-header' }
  if (secret.length === 0) return { ok: false, reason: 'no-secret' }

  let timestamp = ''
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') timestamp = value
    else if (key === 'v1' && value.length > 0) signatures.push(value)
  }

  if (timestamp.length === 0 || signatures.length === 0) return { ok: false, reason: 'malformed' }
  const timestampSec = Number(timestamp)
  if (!Number.isFinite(timestampSec)) return { ok: false, reason: 'malformed' }

  // Подписывается исходная строка t из заголовка, а не Number(timestamp) обратно
  // в строку: '1699999999.0' и '+1699999999' дали бы то же число, но другую
  // подписанную строку, и верная подпись Stripe не сошлась бы с нашей.
  const expected = createHmac('sha256', secret).update(`${timestamp}.${payload}`, 'utf8').digest()
  const matched = signatures.some((candidate) => equalsHex(candidate, expected))
  if (!matched) return { ok: false, reason: 'mismatch' }

  // Проверка возраста последней: подделанное событие не должно отличаться
  // от просроченного по коду причины, а верное просроченное отличаться обязано.
  // Считаем только возраст, без Math.abs, как это делает stripe-node: событие
  // из будущего это разъехавшиеся часы на нашей стороне, и отвергать доставку
  // из-за них хуже, чем принять её.
  const nowMs = input.nowMs ?? Date.now()
  const toleranceSec = input.toleranceSec ?? DEFAULT_TOLERANCE_SEC
  if (nowMs / 1000 - timestampSec > toleranceSec) return { ok: false, reason: 'too-old' }

  return { ok: true }
}

/**
 * Только timingSafeEqual, никакого === на строках подписи. Длины сверяются до
 * вызова: при разной длине буферов timingSafeEqual бросает, а нам нужен обычный false.
 */
function equalsHex(candidateHex: string, expected: Buffer): boolean {
  if (!/^[0-9a-fA-F]*$/.test(candidateHex)) return false
  const candidate = Buffer.from(candidateHex, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}
