import { createHmac } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import { verifyStripeSignature } from './signature'

// Моков нет вообще: HMAC считается прямо здесь тем же алгоритмом, что и в Stripe.
const SECRET = 'whsec_тестовый_секрет'
const PAYLOAD = '{"id":"evt_1","type":"customer.subscription.created"}'
const NOW_MS = 1_760_000_000_000
const T = Math.floor(NOW_MS / 1000)

function sign(timestampSec: number, payload: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestampSec}.${payload}`, 'utf8').digest('hex')
}

function header(timestampSec: number, ...signatures: readonly string[]): string {
  return [`t=${timestampSec}`, ...signatures.map((s) => `v1=${s}`)].join(',')
}

describe('verifyStripeSignature', () => {
  it('корректная подпись проходит', () => {
    const res = verifyStripeSignature({
      payload: PAYLOAD,
      header: header(T, sign(T, PAYLOAD, SECRET)),
      secret: SECRET,
      nowMs: NOW_MS,
    })
    expect(res).toEqual({ ok: true })
  })

  it('отсутствие заголовка даёт no-header', () => {
    expect(verifyStripeSignature({ payload: PAYLOAD, header: null, secret: SECRET, nowMs: NOW_MS })).toEqual({
      ok: false,
      reason: 'no-header',
    })
  })

  it('пустой секрет даёт no-secret, а не mismatch', () => {
    expect(
      verifyStripeSignature({ payload: PAYLOAD, header: header(T, sign(T, PAYLOAD, SECRET)), secret: '', nowMs: NOW_MS }),
    ).toEqual({ ok: false, reason: 'no-secret' })
  })

  it('заголовок без t даёт malformed', () => {
    expect(
      verifyStripeSignature({ payload: PAYLOAD, header: `v1=${sign(T, PAYLOAD, SECRET)}`, secret: SECRET, nowMs: NOW_MS }),
    ).toEqual({ ok: false, reason: 'malformed' })
  })

  it('заголовок без v1 даёт malformed', () => {
    expect(verifyStripeSignature({ payload: PAYLOAD, header: `t=${T}`, secret: SECRET, nowMs: NOW_MS })).toEqual({
      ok: false,
      reason: 'malformed',
    })
  })

  it('подпись от другого секрета даёт mismatch', () => {
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: header(T, sign(T, PAYLOAD, 'whsec_чужой')),
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: 'mismatch' })
  })

  it('подпись короче или длиннее ожидаемой даёт mismatch и не бросает', () => {
    const correct = sign(T, PAYLOAD, SECRET)
    expect(verifyStripeSignature({ payload: PAYLOAD, header: header(T, correct.slice(0, 20)), secret: SECRET, nowMs: NOW_MS })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
    expect(verifyStripeSignature({ payload: PAYLOAD, header: header(T, `${correct}abcd`), secret: SECRET, nowMs: NOW_MS })).toEqual({
      ok: false,
      reason: 'mismatch',
    })
  })

  it('timestamp старше 300 секунд даёт too-old', () => {
    const old = T - 400
    expect(
      verifyStripeSignature({ payload: PAYLOAD, header: header(old, sign(old, PAYLOAD, SECRET)), secret: SECRET, nowMs: NOW_MS }),
    ).toEqual({ ok: false, reason: 'too-old' })
  })

  it('тот же старый timestamp проходит при увеличенном допуске', () => {
    const old = T - 400
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: header(old, sign(old, PAYLOAD, SECRET)),
        secret: SECRET,
        nowMs: NOW_MS,
        toleranceSec: 100_000,
      }),
    ).toEqual({ ok: true })
  })

  it('timestamp из будущего проходит: часы могли разъехаться, а подпись верна', () => {
    const future = T + 400
    expect(
      verifyStripeSignature({ payload: PAYLOAD, header: header(future, sign(future, PAYLOAD, SECRET)), secret: SECRET, nowMs: NOW_MS }),
    ).toEqual({ ok: true })
  })

  it('подписывается исходная строка t, а не её числовое значение', () => {
    // '1760000000.0' и 1760000000 это одно число, но разные подписанные строки.
    const raw = `${T}.0`
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=${raw},v1=${sign(T, PAYLOAD, SECRET)}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: false, reason: 'mismatch' })
    expect(
      verifyStripeSignature({
        payload: PAYLOAD,
        header: `t=${raw},v1=${createHmac('sha256', SECRET).update(`${raw}.${PAYLOAD}`, 'utf8').digest('hex')}`,
        secret: SECRET,
        nowMs: NOW_MS,
      }),
    ).toEqual({ ok: true })
  })

  it('две схемы v1, из которых верна вторая, проходят (ротация секрета)', () => {
    const res = verifyStripeSignature({
      payload: PAYLOAD,
      header: header(T, sign(T, PAYLOAD, 'whsec_старый'), sign(T, PAYLOAD, SECRET)),
      secret: SECRET,
      nowMs: NOW_MS,
    })
    expect(res).toEqual({ ok: true })
  })
})
