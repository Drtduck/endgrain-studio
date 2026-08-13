import { describe, expect, it } from 'vitest'
import { FREE_TRIAL_IP_LIMIT, FREE_TRIAL_LIMIT } from './quota'
import { createGuestId, freeSubjects, hashIp, signGuestCookie, verifyGuestCookie } from './freeSubjects'

const SECRET = 'test-secret-32-bytes-minimum-ok'

describe('signGuestCookie / verifyGuestCookie', () => {
  it('подпись сходится: подписанный uuid проходит проверку', () => {
    const id = createGuestId()
    const cookie = signGuestCookie(SECRET, id)
    expect(verifyGuestCookie(SECRET, cookie)).toBe(id)
  })

  it('подделанная подпись отвергается', () => {
    const id = createGuestId()
    const cookie = signGuestCookie(SECRET, id)
    const [uuid] = cookie.split('.')
    const tampered = `${uuid}.forged-signature-not-valid-base64url`
    expect(verifyGuestCookie(SECRET, tampered)).toBeNull()
  })

  it('чужой секрет тоже отвергается', () => {
    const id = createGuestId()
    const cookie = signGuestCookie(SECRET, id)
    expect(verifyGuestCookie('other-secret', cookie)).toBeNull()
  })

  it('uuid без подписи (голая cookie) отвергается', () => {
    const id = createGuestId()
    expect(verifyGuestCookie(SECRET, id)).toBeNull()
  })

  it('пустая, отсутствующая или битая cookie отвергается без исключения', () => {
    expect(verifyGuestCookie(SECRET, null)).toBeNull()
    expect(verifyGuestCookie(SECRET, undefined)).toBeNull()
    expect(verifyGuestCookie(SECRET, '')).toBeNull()
    expect(verifyGuestCookie(SECRET, '.no-uuid-part')).toBeNull()
    expect(verifyGuestCookie(SECRET, 'no-dot-at-all')).toBeNull()
  })

  it('без секрета подписать и проверить нечего', () => {
    const id = createGuestId()
    expect(verifyGuestCookie('', signGuestCookie('', id))).toBeNull()
  })

  it('createGuestId отдаёт разные значения на каждый вызов', () => {
    expect(createGuestId()).not.toBe(createGuestId())
  })
})

describe('hashIp', () => {
  it('стабилен для одного и того же адреса и секрета', () => {
    expect(hashIp(SECRET, '203.0.113.7')).toBe(hashIp(SECRET, '203.0.113.7'))
  })

  it('не содержит сам адрес: в базе не должно быть персональных данных', () => {
    expect(hashIp(SECRET, '203.0.113.7')).not.toContain('203.0.113.7')
  })

  it('разный секрет или разный адрес даёт разный хеш', () => {
    expect(hashIp(SECRET, '203.0.113.7')).not.toBe(hashIp('other-secret', '203.0.113.7'))
    expect(hashIp(SECRET, '203.0.113.7')).not.toBe(hashIp(SECRET, '203.0.113.8'))
  })

  it('хеш это hex-строка sha256, 64 символа', () => {
    expect(hashIp(SECRET, '203.0.113.7')).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('freeSubjects', () => {
  it('залогиненный без Pro получает субъекты user и ip', () => {
    const subjects = freeSubjects({ secret: SECRET, userId: 'user-1', guestId: null, ip: '203.0.113.7' })
    expect(subjects.map((s) => s.kind)).toEqual(['user', 'ip'])
    expect(subjects[0]).toEqual({ kind: 'user', id: 'user-1', limit: FREE_TRIAL_LIMIT })
    expect(subjects[1]?.limit).toBe(FREE_TRIAL_IP_LIMIT)
  })

  it('гость получает субъекты guest и ip', () => {
    const guestId = createGuestId()
    const subjects = freeSubjects({ secret: SECRET, userId: null, guestId, ip: '203.0.113.7' })
    expect(subjects.map((s) => s.kind)).toEqual(['guest', 'ip'])
    expect(subjects[0]).toEqual({ kind: 'guest', id: guestId, limit: FREE_TRIAL_LIMIT })
  })

  it('user приоритетнее guest, если оба почему-то заданы', () => {
    const subjects = freeSubjects({ secret: SECRET, userId: 'user-1', guestId: 'guest-1', ip: '203.0.113.7' })
    expect(subjects.map((s) => s.kind)).toEqual(['user', 'ip'])
  })

  it('без user и без guest остаётся только ip', () => {
    const subjects = freeSubjects({ secret: SECRET, userId: null, guestId: null, ip: '203.0.113.7' })
    expect(subjects.map((s) => s.kind)).toEqual(['ip'])
  })

  it('субъект ip хеширован секретом, а не хранит адрес в открытом виде', () => {
    const subjects = freeSubjects({ secret: SECRET, userId: 'user-1', guestId: null, ip: '203.0.113.7' })
    const ipSubject = subjects.find((s) => s.kind === 'ip')
    expect(ipSubject?.id).toBe(hashIp(SECRET, '203.0.113.7'))
  })
})
