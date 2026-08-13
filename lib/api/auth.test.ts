import { describe, expect, it, vi, beforeEach } from 'vitest'
import { generateApiKey, hashApiKey } from './keys'

let configured = true
const maybeSingle = vi.fn()
const rpc = vi.fn()
const eq = vi.fn(() => ({ maybeSingle }))
const select = vi.fn(() => ({ eq }))
const from = vi.fn(() => ({ select }))

vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => configured,
  getSupabaseService: () => ({ from, rpc }),
}))

function request(bearer: string | null): Request {
  const headers = new Headers()
  if (bearer !== null) headers.set('Authorization', bearer)
  return new Request('https://app.endgrain.app/api/v1/me', { headers })
}

describe('lib/api/auth', () => {
  beforeEach(() => {
    configured = true
    maybeSingle.mockReset()
    rpc.mockReset()
    from.mockClear()
    select.mockClear()
    eq.mockClear()
  })

  it('без заголовка, не-Bearer и неизвестным префиксом даёт unauthorized', async () => {
    const { authenticateApiRequest } = await import('./auth')
    maybeSingle.mockResolvedValue({ data: null, error: null })

    const noHeader = await authenticateApiRequest(request(null), 'projects:read')
    const notBearer = await authenticateApiRequest(request('Token abc'), 'projects:read')
    const unknownPrefix = await authenticateApiRequest(request('Bearer egs_live_aaaaaaaa_' + 'x'.repeat(43)), 'projects:read')

    expect(noHeader).toEqual({ ok: false, error: 'unauthorized' })
    expect(notBearer).toEqual({ ok: false, error: 'unauthorized' })
    expect(unknownPrefix).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('отозванный ключ даёт unauthorized', async () => {
    const key = await generateApiKey('live')
    maybeSingle.mockResolvedValue({
      data: { id: 'key-1', user_id: 'user-1', scopes: ['projects:read'], tier: 'free', key_hash: key.hash, revoked_at: '2026-01-01T00:00:00Z' },
      error: null,
    })
    const { authenticateApiRequest } = await import('./auth')
    const res = await authenticateApiRequest(request(`Bearer ${key.plaintext}`), 'projects:read')
    expect(res).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('верный префикс с неверным секретом даёт unauthorized', async () => {
    const key = await generateApiKey('live')
    const wrongHash = await hashApiKey('совсем другой ключ')
    maybeSingle.mockResolvedValue({
      data: { id: 'key-1', user_id: 'user-1', scopes: ['projects:read'], tier: 'free', key_hash: wrongHash, revoked_at: null },
      error: null,
    })
    const { authenticateApiRequest } = await import('./auth')
    const res = await authenticateApiRequest(request(`Bearer ${key.plaintext}`), 'projects:read')
    expect(res).toEqual({ ok: false, error: 'unauthorized' })
  })

  it('нехватка скоупа даёт forbidden, и квота при этом не списывается', async () => {
    const key = await generateApiKey('live')
    maybeSingle.mockResolvedValue({
      data: { id: 'key-1', user_id: 'user-1', scopes: ['projects:read'], tier: 'free', key_hash: key.hash, revoked_at: null },
      error: null,
    })
    const { authenticateApiRequest } = await import('./auth')
    const res = await authenticateApiRequest(request(`Bearer ${key.plaintext}`), 'projects:write')
    expect(res).toEqual({ ok: false, error: 'forbidden' })
    expect(rpc).not.toHaveBeenCalledWith('consume_api_quota', expect.anything())
  })

  it('consume_api_quota вернула null - результат rateLimited', async () => {
    const key = await generateApiKey('live')
    maybeSingle.mockResolvedValue({
      data: { id: 'key-1', user_id: 'user-1', scopes: ['projects:read'], tier: 'free', key_hash: key.hash, revoked_at: null },
      error: null,
    })
    rpc.mockResolvedValue({ data: null, error: null })
    const { authenticateApiRequest } = await import('./auth')
    const res = await authenticateApiRequest(request(`Bearer ${key.plaintext}`), 'projects:read')
    expect(res).toEqual({ ok: false, error: 'rateLimited' })
  })

  it('isSupabaseServiceConfigured() === false - unavailable, в базу не ходили вовсе', async () => {
    configured = false
    const key = await generateApiKey('live')
    const { authenticateApiRequest } = await import('./auth')
    const res = await authenticateApiRequest(request(`Bearer ${key.plaintext}`), 'projects:read')
    expect(res).toEqual({ ok: false, error: 'unavailable' })
    expect(from).not.toHaveBeenCalled()
  })

  it('успешный путь дёргает touch_api_key, и упавший touch_api_key не ломает ответ', async () => {
    const key = await generateApiKey('live')
    maybeSingle.mockResolvedValue({
      data: { id: 'key-1', user_id: 'user-1', scopes: ['projects:read'], tier: 'free', key_hash: key.hash, revoked_at: null },
      error: null,
    })
    rpc.mockImplementation((name: string) => {
      if (name === 'consume_api_quota') return Promise.resolve({ data: 3, error: null })
      if (name === 'touch_api_key') return Promise.reject(new Error('boom'))
      return Promise.resolve({ data: null, error: null })
    })

    const { authenticateApiRequest } = await import('./auth')
    const res = await authenticateApiRequest(request(`Bearer ${key.plaintext}`), 'projects:read')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.caller.userId).toBe('user-1')
      expect(res.caller.usage).toEqual({ used: 3, limit: 50 })
    }
    // touch_api_key вызван, но его провал (mock отклонён) не должен всплыть как unhandled rejection
    await new Promise((r) => setTimeout(r, 0))
    expect(rpc).toHaveBeenCalledWith('touch_api_key', { p_key_id: 'key-1' })
  })
})
