import { describe, expect, it, vi, beforeEach } from 'vitest'

const getCurrentUser = vi.fn()
vi.mock('@/lib/supabase/session', () => ({ getCurrentUser }))

let serviceConfigured = true
const rpc = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => serviceConfigured,
  getSupabaseService: () => ({ rpc }),
}))

let falConfigured = false
vi.mock('@/lib/video/fal', () => ({
  isFalConfigured: () => falConfigured,
  requestVideo: vi.fn(async () => ({ ok: false, error: 'notConfigured' })),
}))

const readWallet = vi.fn()
vi.mock('@/lib/wallet/server', () => ({ readWallet }))

const REF = '11111111-1111-4111-8111-111111111111'
const USER = { id: 'user-1', email: 'a@b.co' }

describe('app/actions/video generateVideoAction', () => {
  beforeEach(() => {
    serviceConfigured = true
    falConfigured = false
    getCurrentUser.mockReset()
    rpc.mockReset()
    readWallet.mockReset()
  })

  it('в демо-режиме (без FAL_KEY) не зовёт wallet_spend вовсе - мок бесплатен', async () => {
    getCurrentUser.mockResolvedValue(USER)
    readWallet.mockResolvedValue({ balanceCents: 500 })
    const { generateVideoAction } = await import('./video')

    const res = await generateVideoAction(5, 'data:image/png;base64,aaa', REF)

    expect(res).toEqual({ ok: true, mock: true, videoUrl: 'data:image/png;base64,aaa', posterUrl: 'data:image/png;base64,aaa', balanceCents: 500 })
    expect(rpc).not.toHaveBeenCalled()
    expect(readWallet).toHaveBeenCalledWith('user-1')
  })

  it('без ref (или не-uuid) даёт invalid и не трогает ни кошелёк, ни баланс', async () => {
    getCurrentUser.mockResolvedValue(USER)
    const { generateVideoAction } = await import('./video')

    const res = await generateVideoAction(5, 'data:image/png;base64,aaa', 'не uuid совсем')

    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(rpc).not.toHaveBeenCalled()
    expect(readWallet).not.toHaveBeenCalled()
  })

  it('без пользователя - unauthenticated, ни один поход в базу не случается', async () => {
    getCurrentUser.mockResolvedValue(null)
    const { generateVideoAction } = await import('./video')

    const res = await generateVideoAction(5, 'data:image/png;base64,aaa', REF)

    expect(res).toEqual({ ok: false, error: 'unauthenticated' })
    expect(rpc).not.toHaveBeenCalled()
    expect(readWallet).not.toHaveBeenCalled()
  })

  it('с FAL_KEY зовёт wallet_spend с ref, полученным от клиента, а не сгенерированным заново', async () => {
    falConfigured = true
    getCurrentUser.mockResolvedValue(USER)
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === 'wallet_spend') {
        expect(args['p_ref']).toBe(REF)
        return Promise.resolve({ data: 300, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    })
    const { generateVideoAction } = await import('./video')

    const res = await generateVideoAction(5, 'data:image/png;base64,aaa', REF)

    // requestVideo замокан на notConfigured, значит попытка проваливается и
    // должен произойти возврат тем же ref.
    expect(res).toEqual({ ok: false, error: 'failed' })
    expect(rpc).toHaveBeenCalledWith('wallet_spend', { p_user_id: 'user-1', p_amount: 200, p_ref: REF })
    expect(rpc).toHaveBeenCalledWith('wallet_refund', { p_user_id: 'user-1', p_amount: 200, p_ref: REF })
  })

  it('пустой returning из wallet_spend - insufficient, не сбой базы', async () => {
    falConfigured = true
    getCurrentUser.mockResolvedValue(USER)
    rpc.mockResolvedValue({ data: null, error: null })
    const { generateVideoAction } = await import('./video')

    const res = await generateVideoAction(5, 'data:image/png;base64,aaa', REF)

    expect(res).toEqual({ ok: false, error: 'insufficient' })
  })
})
