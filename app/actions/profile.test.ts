import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * app/actions/profile: два фикса ревью покрыты здесь.
 * 1) updateProfileAction больше не просит notify_email обратно в RETURNING (upsert().select()) -
 *    authenticated-грант select больше не открывает эту колонку никому (см. миграцию
 *    20260814100000), и Postgres требует SELECT-привилегию на колонку и для RETURNING.
 *    Значение notifyEmail в ответе действия берётся из input, а не из ответа базы.
 * 2) changePasswordAction требует текущий пароль и проверяет его через
 *    signInWithPassword до updateUser({password}) - без этого чужая открытая сессия
 *    на общем компьютере могла бы захватить аккаунт простой сменой пароля.
 */

const getUser = vi.fn()
const upsertSelectSingle = vi.fn()
const upsertSelect = vi.fn()
const upsert = vi.fn()
const from = vi.fn()
const signInWithPassword = vi.fn()
const updateUser = vi.fn()

vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => true }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({
    auth: { getUser, signInWithPassword, updateUser },
    from,
  }),
}))
vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => false,
  getSupabaseService: () => {
    throw new Error('getSupabaseService should not be called from this file')
  },
}))

function mockUser(overrides: Partial<{ id: string; email: string; identities: readonly { provider: string }[] }> = {}) {
  const user = {
    id: overrides.id ?? 'user-1',
    email: overrides.email ?? 'user@example.com',
    identities: overrides.identities ?? [{ provider: 'email' }],
  }
  getUser.mockResolvedValue({ data: { user } })
}

describe('app/actions/profile updateProfileAction', () => {
  beforeEach(() => {
    getUser.mockReset()
    upsertSelectSingle.mockReset()
    upsertSelect.mockReset()
    upsert.mockReset()
    from.mockReset()
    signInWithPassword.mockReset()
    updateUser.mockReset()

    upsertSelect.mockImplementation(() => ({ single: upsertSelectSingle }))
    upsert.mockImplementation(() => ({ select: upsertSelect }))
    from.mockImplementation((table: string) => {
      if (table === 'profiles') return { upsert }
      throw new Error(`unexpected table ${table}`)
    })
  })

  it('RETURNING не запрашивает notify_email, ответ берёт значение из input', async () => {
    mockUser()
    upsertSelectSingle.mockResolvedValue({
      data: { user_id: 'user-1', display_name: 'Стас', bio: null, website: null, created_at: '2026-08-14T00:00:00.000Z' },
      error: null,
    })
    const { updateProfileAction } = await import('./profile')

    const res = await updateProfileAction({ displayName: 'Стас', bio: '', website: '', notifyEmail: false })

    expect(res).toEqual({
      ok: true,
      data: {
        userId: 'user-1',
        displayName: 'Стас',
        bio: null,
        website: null,
        notifyEmail: false,
        createdAt: '2026-08-14T00:00:00.000Z',
      },
    })
    // RETURNING-список не содержит notify_email: колонка больше не в select-гранте authenticated.
    expect(upsertSelect).toHaveBeenCalledWith('user_id, display_name, bio, website, created_at')
  })

  it('неаутентифицированный запрос не трогает базу', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { updateProfileAction } = await import('./profile')

    const res = await updateProfileAction({ displayName: 'Стас', bio: '', website: '', notifyEmail: true })

    expect(res).toEqual({ ok: false, error: 'unauthenticated' })
    expect(from).not.toHaveBeenCalled()
  })
})

describe('app/actions/profile changePasswordAction', () => {
  beforeEach(() => {
    getUser.mockReset()
    signInWithPassword.mockReset()
    updateUser.mockReset()
    from.mockReset()
  })

  it('неверный текущий пароль даёт wrongPassword и не зовёт updateUser', async () => {
    mockUser()
    signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    const { changePasswordAction } = await import('./profile')

    const res = await changePasswordAction('неверный-старый', 'newpassword1')

    expect(res).toEqual({ ok: false, error: 'wrongPassword' })
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'user@example.com', password: 'неверный-старый' })
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('верный текущий пароль позволяет сменить пароль', async () => {
    mockUser()
    signInWithPassword.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    const { changePasswordAction } = await import('./profile')

    const res = await changePasswordAction('correct-old-pass', 'newpassword1')

    expect(res).toEqual({ ok: true, data: null })
    expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword1' })
  })

  it('google-only аккаунт (нет provider email) получает noPassword и не пробует signInWithPassword', async () => {
    mockUser({ identities: [{ provider: 'google' }] })
    const { changePasswordAction } = await import('./profile')

    const res = await changePasswordAction('irrelevant', 'newpassword1')

    expect(res).toEqual({ ok: false, error: 'noPassword' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })

  it('невалидный новый пароль отбивается до проверки текущего', async () => {
    mockUser()
    const { changePasswordAction } = await import('./profile')

    const res = await changePasswordAction('correct-old-pass', 'short')

    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(signInWithPassword).not.toHaveBeenCalled()
  })
})
