import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeCheckerboard } from '@/lib/designs/samples'

const getUser = vi.fn()
const from = vi.fn()
let configured = true

vi.mock('@/lib/supabase/config', () => ({
  isSupabaseConfigured: () => configured,
}))

vi.mock('@/lib/supabase/server', () => ({
  getSupabaseServer: async () => ({
    auth: { getUser },
    from,
  }),
}))

describe('app/actions/projects', () => {
  beforeEach(() => {
    configured = true
    getUser.mockReset()
    from.mockReset()
  })

  it('без пользователя каждая функция даёт unauthenticated и не зовёт from()', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    const { listProjectsAction, saveProjectAction, loadProjectAction, deleteProjectAction } = await import('./projects')

    const design = makeCheckerboard({ cols: 2, rows: 2 })
    const results = await Promise.all([
      listProjectsAction(),
      saveProjectAction('доска', design),
      loadProjectAction('11111111-1111-1111-1111-111111111111'),
      deleteProjectAction('11111111-1111-1111-1111-111111111111'),
    ])

    for (const res of results) {
      expect(res).toEqual({ ok: false, error: 'unauthenticated' })
    }
    expect(from).not.toHaveBeenCalled()
  })

  it('saveProjectAction с пустым именем даёт invalid без сетевого вызова', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { saveProjectAction } = await import('./projects')
    const design = makeCheckerboard({ cols: 2, rows: 2 })

    const res = await saveProjectAction('', design)
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(from).not.toHaveBeenCalled()
  })

  it('saveProjectAction с невалидным документом даёт invalid', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { saveProjectAction } = await import('./projects')

    const res = await saveProjectAction('доска', { мусор: true })
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(from).not.toHaveBeenCalled()
  })

  it('успешный saveProjectAction кладёт в insert user_id из сессии, а не из аргументов', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const insert = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({
      data: { id: 'proj-1', name: 'доска', updated_at: '2026-01-01T00:00:00.000Z' },
      error: null,
    })
    from.mockReturnValue({ insert, select, single })

    const { saveProjectAction } = await import('./projects')
    const design = makeCheckerboard({ cols: 2, rows: 2 })
    const res = await saveProjectAction('доска', design)

    expect(res.ok).toBe(true)
    expect(insert).toHaveBeenCalledTimes(1)
    const insertArg = insert.mock.calls[0]?.[0] as { user_id: string; name: string }
    expect(insertArg.user_id).toBe('user-1')
    expect(insertArg.name).toBe('доска')
  })

  it('loadProjectAction с не-uuid даёт invalid', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const { loadProjectAction } = await import('./projects')
    const res = await loadProjectAction('не-uuid')
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(from).not.toHaveBeenCalled()
  })

  it('loadProjectAction при data === null даёт notFound', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    const eq = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnThis()
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    from.mockReturnValue({ select, eq, maybeSingle })

    const { loadProjectAction } = await import('./projects')
    const res = await loadProjectAction('11111111-1111-4111-8111-111111111111')
    expect(res).toEqual({ ok: false, error: 'notFound' })
  })
})
