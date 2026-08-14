import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * app/actions/profile: несколько фиксов ревью покрыты здесь.
 * 1) updateProfileAction больше не просит notify_email обратно в RETURNING (upsert().select()) -
 *    authenticated-грант select больше не открывает эту колонку никому (см. миграцию
 *    20260814100000), и Postgres требует SELECT-привилегию на колонку и для RETURNING.
 *    Значение notifyEmail в ответе действия берётся из input, а не из ответа базы.
 * 2) changePasswordAction требует текущий пароль и проверяет его через
 *    signInWithPassword до updateUser({password}) - без этого чужая открытая сессия
 *    на общем компьютере могла бы захватить аккаунт простой сменой пароля.
 * 3) hotfix account-save: тот же RETURNING/SELECT-грант рубит upsert и под cookie-сессией
 *    (authenticated не имеет table-level SELECT, а PostgREST-upsert с onConflict его требует)
 *    - updateProfileAction переведён на getSupabaseService() (service-role, мимо RLS и грантов).
 *    user_id для записи берётся только из getCurrentUser(), а не из input - строку чужого
 *    пользователя записать нельзя, даже имея прямой доступ к action.
 */

const getUser = vi.fn()
const upsertSelectSingle = vi.fn()
const upsertSelect = vi.fn()
const upsert = vi.fn()
const from = vi.fn()
const signInWithPassword = vi.fn()
const updateUser = vi.fn()

let serviceConfigured = true
const serviceFrom = vi.fn()

vi.mock('@/lib/supabase/config', () => ({ isSupabaseConfigured: () => true, SUPABASE_URL: 'https://abcdefgh.supabase.co' }))
vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({
    auth: { getUser, signInWithPassword, updateUser },
    from,
  }),
}))
vi.mock('@/lib/supabase/service', () => ({
  isSupabaseServiceConfigured: () => serviceConfigured,
  getSupabaseService: () => ({ from: serviceFrom }),
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
    serviceFrom.mockReset()
    signInWithPassword.mockReset()
    updateUser.mockReset()
    serviceConfigured = true

    upsertSelect.mockImplementation(() => ({ single: upsertSelectSingle }))
    upsert.mockImplementation(() => ({ select: upsertSelect }))
    serviceFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return { upsert }
      throw new Error(`unexpected table ${table}`)
    })
  })

  it('пишет через service-role (не через cookie-сессию), RETURNING не запрашивает notify_email', async () => {
    mockUser()
    upsertSelectSingle.mockResolvedValue({
      data: {
        user_id: 'user-1',
        display_name: 'Стас',
        bio: null,
        website: null,
        avatar_url: null,
        created_at: '2026-08-14T00:00:00.000Z',
      },
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
        avatarUrl: null,
        notifyEmail: false,
        createdAt: '2026-08-14T00:00:00.000Z',
      },
    })
    // Пишем service-ролью, а не под cookie-сессией: authenticated не имеет
    // table-level SELECT, которого требует RETURNING PostgREST-upsert'а.
    expect(serviceFrom).toHaveBeenCalledWith('profiles')
    expect(from).not.toHaveBeenCalledWith('profiles')
    // user_id в записи - строго из серверной сессии, не из input.
    const upsertArg = upsert.mock.calls[0]?.[0] as { user_id: string }
    expect(upsertArg.user_id).toBe('user-1')
    // RETURNING-список не содержит notify_email: колонка не в select-гранте authenticated,
    // а лишний select клиенту тут и не нужен.
    expect(upsertSelect).toHaveBeenCalledWith('user_id, display_name, bio, website, avatar_url, created_at')
  })

  it('чужой user_id подставить нельзя: запись всегда идёт в строку из сессии', async () => {
    mockUser({ id: 'user-1' })
    upsertSelectSingle.mockResolvedValue({
      data: { user_id: 'user-1', display_name: 'Стас', bio: null, website: null, created_at: '2026-08-14T00:00:00.000Z' },
      error: null,
    })
    const { updateProfileAction } = await import('./profile')

    // UpdateProfileInput вообще не принимает userId - это и есть защита: у типа
    // action нет способа передать чужой id, поэтому здесь просто проверяем,
    // что записанный user_id совпадает с id из сессии, а не с чем-то ещё.
    await updateProfileAction({ displayName: 'Стас', bio: '', website: '', notifyEmail: true })

    const upsertArg = upsert.mock.calls[0]?.[0] as { user_id: string }
    expect(upsertArg.user_id).toBe('user-1')
  })

  it('без service-role даёт unavailable и не пишет в базу', async () => {
    serviceConfigured = false
    mockUser()
    const { updateProfileAction } = await import('./profile')

    const res = await updateProfileAction({ displayName: 'Стас', bio: '', website: '', notifyEmail: true })

    expect(res).toEqual({ ok: false, error: 'unavailable' })
    expect(serviceFrom).not.toHaveBeenCalled()
  })

  it('неаутентифицированный запрос не трогает базу', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { updateProfileAction } = await import('./profile')

    const res = await updateProfileAction({ displayName: 'Стас', bio: '', website: '', notifyEmail: true })

    expect(res).toEqual({ ok: false, error: 'unauthenticated' })
    expect(from).not.toHaveBeenCalled()
    expect(serviceFrom).not.toHaveBeenCalled()
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

/**
 * updateAvatarAction: ссылка приходит от клиента (файл грузится в Storage прямо
 * из браузера), поэтому проверка «свой bucket, своя папка» - единственное, что
 * стоит между profiles.avatar_url и произвольным чужим адресом.
 */
describe('app/actions/profile updateAvatarAction', () => {
  const OWN = 'https://abcdefgh.supabase.co/storage/v1/object/public/avatars/user-1/avatar.png'
  const bareUpsert = vi.fn()

  beforeEach(() => {
    getUser.mockReset()
    from.mockReset()
    serviceFrom.mockReset()
    bareUpsert.mockReset()
    serviceConfigured = true
    bareUpsert.mockResolvedValue({ error: null })
    serviceFrom.mockImplementation((table: string) => {
      if (table === 'profiles') return { upsert: bareUpsert }
      throw new Error(`unexpected table ${table}`)
    })
  })

  it('своя ссылка сохраняется, пишется только колонка avatar_url', async () => {
    mockUser({ id: 'user-1' })
    const { updateAvatarAction } = await import('./profile')

    const res = await updateAvatarAction(`${OWN}?v=1700000000000`)

    expect(res).toEqual({ ok: true, data: `${OWN}?v=1700000000000` })
    expect(bareUpsert).toHaveBeenCalledWith(
      { user_id: 'user-1', avatar_url: `${OWN}?v=1700000000000` },
      { onConflict: 'user_id' },
    )
  })

  it('чужой путь того же bucket не проходит и в базу не уходит', async () => {
    mockUser({ id: 'user-1' })
    const { updateAvatarAction } = await import('./profile')

    const res = await updateAvatarAction('https://abcdefgh.supabase.co/storage/v1/object/public/avatars/user-2/avatar.png')

    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(bareUpsert).not.toHaveBeenCalled()
  })

  it('чужой хост и javascript: не проходят', async () => {
    mockUser({ id: 'user-1' })
    const { updateAvatarAction } = await import('./profile')

    const foreign = await updateAvatarAction('https://evil.example.com/storage/v1/object/public/avatars/user-1/avatar.png')
    const script = await updateAvatarAction('javascript:alert(1)')

    expect(foreign).toEqual({ ok: false, error: 'invalid' })
    expect(script).toEqual({ ok: false, error: 'invalid' })
    expect(bareUpsert).not.toHaveBeenCalled()
  })

  it('null снимает картинку и возвращает инициал', async () => {
    mockUser({ id: 'user-1' })
    const { updateAvatarAction } = await import('./profile')

    const res = await updateAvatarAction(null)

    expect(res).toEqual({ ok: true, data: null })
    expect(bareUpsert).toHaveBeenCalledWith({ user_id: 'user-1', avatar_url: null }, { onConflict: 'user_id' })
  })

  it('без сессии база не трогается', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { updateAvatarAction } = await import('./profile')

    const res = await updateAvatarAction(OWN)

    expect(res).toEqual({ ok: false, error: 'unauthenticated' })
    expect(serviceFrom).not.toHaveBeenCalled()
  })
})
