import { describe, it, expect, vi, beforeEach } from 'vitest'

let configured = true

vi.mock('@/lib/kit/config', () => ({
  KIT_API_KEY: 'test-key',
  KIT_FORM_ID: 'test-form',
  isKitConfigured: () => configured,
}))

describe('app/actions/subscribe', () => {
  beforeEach(() => {
    configured = true
    vi.unstubAllGlobals()
  })

  it('ненастроенный Kit даёт error: disabled', async () => {
    configured = false
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'stas@example.com' })
    expect(res).toEqual({ ok: false, error: 'disabled' })
  })

  it('невалидный email даёт error: invalid и fetch не зовётся', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'не-почта' })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('заполненная ловушка company даёт error: bot и fetch не зовётся', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'не-почта', company: 'бот' })
    expect(res).toEqual({ ok: false, error: 'bot' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('успешная подписка через Kit даёт ok: true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ subscriber: { id: 1 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'stas@example.com' })
    expect(res).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.kit.com/v4/subscribers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Kit-Api-Key': 'test-key' }) as unknown,
      })
    )
  })

  it('повторная подписка тоже даёт ok: true (Kit сам решает upsert)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'stas@example.com' })
    expect(res).toEqual({ ok: true })
  })

  it('422 от Kit даёт error: failed', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'stas@example.com' })
    expect(res).toEqual({ ok: false, error: 'failed' })
  })

  it('брошенное исключение из fetch даёт error: failed', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'stas@example.com' })
    expect(res).toEqual({ ok: false, error: 'failed' })
  })
})
