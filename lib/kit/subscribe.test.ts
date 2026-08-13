import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./config', () => ({
  KIT_API_KEY: 'test-key',
  KIT_FORM_ID: 'test-form',
}))

describe('subscribeToKit', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('успешная подписка: два запроса подряд с нужным заголовком и телами', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ subscriber: { id: 1 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { subscribeToKit } = await import('./subscribe')
    const res = await subscribeToKit('stas@example.com')

    expect(res).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.kit.com/v4/subscribers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Kit-Api-Key': 'test-key' }) as unknown,
        body: JSON.stringify({ email_address: 'stas@example.com' }),
      })
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.kit.com/v4/forms/test-form/subscribers',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Kit-Api-Key': 'test-key' }) as unknown,
        body: JSON.stringify({ email_address: 'stas@example.com' }),
      })
    )
  })

  it('повторная подписка: Kit тоже отвечает 200, результат ok: true', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ subscriber: { id: 1 } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { subscribeToKit } = await import('./subscribe')
    const res = await subscribeToKit('stas@example.com')

    expect(res).toEqual({ ok: true })
  })

  it('передаёт referrer вторым запросом, когда он указан', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { subscribeToKit } = await import('./subscribe')
    await subscribeToKit('stas@example.com', 'https://endgrain.app')

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.kit.com/v4/forms/test-form/subscribers',
      expect.objectContaining({
        body: JSON.stringify({ email_address: 'stas@example.com', referrer: 'https://endgrain.app' }),
      })
    )
  })

  it('422 от первого запроса (subscribers) даёт ok: false и второй запрос не зовётся', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 422, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { subscribeToKit } = await import('./subscribe')
    const res = await subscribeToKit('stas@example.com')

    expect(res).toEqual({ ok: false, error: 'kit subscribers 422' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ошибка второго запроса (forms) даёт ok: false', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    const { subscribeToKit } = await import('./subscribe')
    const res = await subscribeToKit('stas@example.com')

    expect(res).toEqual({ ok: false, error: 'kit forms 500' })
  })

  it('сетевой сбой превращается в ошибку, а не исключение', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)

    const { subscribeToKit } = await import('./subscribe')
    const res = await subscribeToKit('stas@example.com')

    expect(res).toEqual({ ok: false, error: 'network error' })
  })

  it('ключ Kit не утекает ни в текст ошибки, ни в консоль ни на одной ветке', async () => {
    const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => {})
    )
    const branches = [
      // Отказ первого запроса, отказ второго и сетевой сбой: три способа завершиться ошибкой.
      vi.fn().mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ key: 'test-key' }) }),
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ key: 'test-key' }) }),
      vi.fn().mockRejectedValue(new Error('auth failed for key test-key')),
    ]

    const { subscribeToKit } = await import('./subscribe')
    for (const fetchMock of branches) {
      vi.stubGlobal('fetch', fetchMock)
      const res = await subscribeToKit('stas@example.com')
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.error).not.toContain('test-key')
    }

    const logged = spies.flatMap((spy) => spy.mock.calls.flat()).join(' ')
    expect(logged).not.toContain('test-key')
    // Молчаливые ветки - тоже гарантия: печатать сюда нечего, поэтому и ключу утечь неоткуда.
    expect(logged).toBe('')
    for (const spy of spies) spy.mockRestore()
  })
})
