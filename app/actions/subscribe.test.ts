import { describe, it, expect, vi, beforeEach } from 'vitest'

let configured = true

vi.mock('@/lib/resend/config', () => ({
  RESEND_API_KEY: 'test-key',
  RESEND_AUDIENCE_ID: 'test-audience',
  isResendConfigured: () => configured,
}))

describe('app/actions/subscribe', () => {
  beforeEach(() => {
    configured = true
    vi.unstubAllGlobals()
  })

  it('ненастроенный Resend даёт error: disabled', async () => {
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

  it('успешный ответ Resend с id даёт ok: true, already: false', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'contact-1' }) })
    vi.stubGlobal('fetch', fetchMock)
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'stas@example.com' })
    expect(res).toEqual({ ok: true, already: false })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/audiences/test-audience/contacts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }) as unknown,
      })
    )
  })

  it('ответ Resend без id (уже подписан) даёт ok: true, already: true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    const { subscribeAction } = await import('./subscribe')
    const res = await subscribeAction({ email: 'stas@example.com' })
    expect(res).toEqual({ ok: true, already: true })
  })

  it('422 от Resend даёт error: failed', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) })
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
