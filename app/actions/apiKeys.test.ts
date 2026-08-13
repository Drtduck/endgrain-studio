import { describe, expect, it, vi, beforeEach } from 'vitest'

const getCurrentUser = vi.fn()
vi.mock('@/lib/supabase/session', () => ({ getCurrentUser }))

const serverFrom = vi.fn()
vi.mock('@/lib/supabase/server', () => ({ getSupabaseServer: async () => ({ from: serverFrom }) }))

let serviceConfigured = true
const serviceFrom = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => serviceConfigured,
  getSupabaseService: () => ({ from: serviceFrom }),
}))

describe('app/actions/apiKeys', () => {
  beforeEach(() => {
    serviceConfigured = true
    getCurrentUser.mockReset()
    serverFrom.mockReset()
    serviceFrom.mockReset()
  })

  it('без пользователя все три действия дают unauthenticated и не ходят в базу', async () => {
    getCurrentUser.mockResolvedValue(null)
    const { listApiKeysAction, createApiKeyAction, revokeApiKeyAction } = await import('./apiKeys')

    const results = await Promise.all([
      listApiKeysAction(),
      createApiKeyAction('мой ноут'),
      revokeApiKeyAction('11111111-1111-1111-1111-111111111111'),
    ])
    for (const res of results) expect(res).toEqual({ ok: false, error: 'unauthenticated' })
    expect(serverFrom).not.toHaveBeenCalled()
    expect(serviceFrom).not.toHaveBeenCalled()
  })

  it('listApiKeysAction читает свои ключи через cookie-сессию (RLS), не через service-role', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.co' })
    const order = vi.fn().mockResolvedValue({
      data: [{ id: 'k1', name: 'ноут', prefix: 'egs_live_a3f9c204', tier: 'free', created_at: '2026-01-01T00:00:00Z', last_used_at: null, revoked_at: null }],
      error: null,
    })
    const keysSelect = vi.fn().mockReturnValue({ order })
    const usageEq = vi.fn().mockResolvedValue({ data: [{ key_id: 'k1', used: 3 }], error: null })
    const usageSelect = vi.fn().mockReturnValue({ eq: usageEq })
    serverFrom.mockImplementation((table: string) => (table === 'api_usage' ? { select: usageSelect } : { select: keysSelect }))

    const { listApiKeysAction } = await import('./apiKeys')
    const res = await listApiKeysAction()
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toHaveLength(1)
      expect(res.data[0]?.usedToday).toBe(3)
    }
    expect(serviceFrom).not.toHaveBeenCalled()
  })

  it('createApiKeyAction с пустым именем даёт invalid без сетевого вызова', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.co' })
    const { createApiKeyAction } = await import('./apiKeys')
    const res = await createApiKeyAction('   ')
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(serviceFrom).not.toHaveBeenCalled()
  })

  it('createApiKeyAction без service-role даёт unavailable', async () => {
    serviceConfigured = false
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.co' })
    const { createApiKeyAction } = await import('./apiKeys')
    const res = await createApiKeyAction('мой ноут')
    expect(res).toEqual({ ok: false, error: 'unavailable' })
  })

  it('createApiKeyAction при исчерпанном лимите ключей даёт limit и не вставляет строку', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.co' })
    const is = vi.fn().mockResolvedValue({ count: 2, error: null })
    const eq = vi.fn().mockReturnValue({ is })
    const countSelect = vi.fn().mockReturnValue({ eq })
    const insert = vi.fn()
    serviceFrom.mockReturnValueOnce({ select: countSelect }).mockReturnValueOnce({ insert })

    const { createApiKeyAction } = await import('./apiKeys')
    const res = await createApiKeyAction('третий ключ')
    expect(res).toEqual({ ok: false, error: 'limit' })
    expect(insert).not.toHaveBeenCalled()
  })

  it('успешный createApiKeyAction возвращает plaintext один раз и кладёт user_id из сессии', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.co' })
    const is = vi.fn().mockResolvedValue({ count: 0, error: null })
    const eq = vi.fn().mockReturnValue({ is })
    const countSelect = vi.fn().mockReturnValue({ eq })

    const single = vi.fn().mockResolvedValue({
      data: { id: 'k1', name: 'мой ноут', prefix: 'egs_live_a3f9c204', tier: 'free', created_at: '2026-01-01T00:00:00Z', last_used_at: null, revoked_at: null },
      error: null,
    })
    const insertSelect = vi.fn().mockReturnValue({ single })
    const insert = vi.fn().mockReturnValue({ select: insertSelect })

    serviceFrom.mockReturnValueOnce({ select: countSelect }).mockReturnValueOnce({ insert })

    const { createApiKeyAction } = await import('./apiKeys')
    const res = await createApiKeyAction('мой ноут')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.plaintext).toMatch(/^egs_live_[0-9a-z]{8}_[A-Za-z0-9_-]{43}$/)
    const insertArg = insert.mock.calls[0]?.[0] as { user_id: string }
    expect(insertArg.user_id).toBe('user-1')
  })

  it('revokeApiKeyAction чужого/несуществующего id даёт notFound', async () => {
    getCurrentUser.mockResolvedValue({ id: 'user-1', email: 'a@b.co' })
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const select = vi.fn().mockReturnValue({ maybeSingle })
    const eq2 = vi.fn().mockReturnValue({ select })
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
    const update = vi.fn().mockReturnValue({ eq: eq1 })
    serviceFrom.mockReturnValue({ update })

    const { revokeApiKeyAction } = await import('./apiKeys')
    const res = await revokeApiKeyAction('11111111-1111-4111-8111-111111111111')
    expect(res).toEqual({ ok: false, error: 'notFound' })
  })
})
