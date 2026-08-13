import { describe, expect, it, vi, beforeEach } from 'vitest'
import { baseDesign } from '@/lib/engine'
import { buildCutPlan } from '@/lib/export'

interface RecordedCall {
  readonly method: string
  readonly args: readonly unknown[]
}

/**
 * Мок построителя запросов Supabase: каждый вызов метода цепочки записывается
 * в calls и возвращает тот же объект (чейнинг), а сам объект thenable -
 * `await query` резолвится в заранее заданный result. Этого достаточно для
 * всех форм использования в lib/api/service.ts: и await всей цепочки, и
 * .maybeSingle()/.single() в её хвосте.
 */
function makeBuilder(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const calls: RecordedCall[] = []
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit', 'lt', 'maybeSingle', 'single'] as const
  const builder: Record<string, unknown> & { calls: RecordedCall[]; then: (resolve: (v: unknown) => void) => void } = {
    calls,
    then: (resolve) => resolve(result),
  }
  for (const method of methods) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  return builder
}

let currentBuilder: ReturnType<typeof makeBuilder>
const from = vi.fn(() => currentBuilder)

vi.mock('@/lib/supabase/service', () => ({
  getSupabaseService: () => ({ from }),
  isSupabaseServiceConfigured: () => true,
}))

let pro = true
vi.mock('@/lib/stripe/pro', () => ({
  proStatusForUser: async () => ({ pro, reason: pro ? 'subscription' : 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }),
}))

const USER_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'

describe('lib/api/service', () => {
  beforeEach(() => {
    pro = true
    from.mockClear()
  })

  it('каждая функция сервиса фильтрует свои запросы к projects по user_id', async () => {
    const svc = await import('./service')

    const cases: Array<{ readonly name: string; readonly run: () => Promise<unknown> }> = [
      {
        name: 'listProjects',
        run: () => {
          currentBuilder = makeBuilder({ data: [], error: null })
          return svc.listProjects(USER_ID)
        },
      },
      {
        name: 'createProject',
        run: () => {
          currentBuilder = makeBuilder({ data: { id: PROJECT_ID, name: 'доска', updated_at: '2026-01-01T00:00:00.000Z' }, error: null, count: 0 })
          return svc.createProject(USER_ID, 'доска', baseDesign())
        },
      },
      {
        name: 'getProject',
        run: () => {
          currentBuilder = makeBuilder({ data: { id: PROJECT_ID, name: 'доска', design: baseDesign(), updated_at: '2026-01-01T00:00:00.000Z' }, error: null })
          return svc.getProject(USER_ID, PROJECT_ID)
        },
      },
      {
        name: 'updateProject',
        run: () => {
          currentBuilder = makeBuilder({ data: { id: PROJECT_ID, name: 'новое имя', updated_at: '2026-01-01T00:00:00.000Z' }, error: null })
          return svc.updateProject(USER_ID, PROJECT_ID, { name: 'новое имя' })
        },
      },
      {
        name: 'deleteProject',
        run: () => {
          currentBuilder = makeBuilder({ error: null, count: 1 })
          return svc.deleteProject(USER_ID, PROJECT_ID)
        },
      },
    ]

    for (const { name, run } of cases) {
      const result = await run()
      expect((result as { ok: boolean }).ok, `${name} должна пройти успешно на валидном моке`).toBe(true)

      if (name === 'createProject') {
        // insert - это запись новой строки, а не выборка чужой: у неё нет .eq('user_id'),
        // но payload обязан нести user_id из аргумента, а не довериться клиенту.
        const insertCall = currentBuilder.calls.find((c) => c.method === 'insert')
        const payload = insertCall?.args[0] as { user_id?: string } | undefined
        expect(payload?.user_id, 'createProject обязана класть user_id в insert').toBe(USER_ID)
        continue
      }

      const eqCalls = currentBuilder.calls.filter((c) => c.method === 'eq')
      const hasUserFilter = eqCalls.some((c) => c.args[0] === 'user_id' && c.args[1] === USER_ID)
      expect(hasUserFilter, `${name} обязана фильтровать запрос по .eq('user_id', ...)`).toBe(true)
    }
  })

  it('createProject при исчерпанном лимите и pro: false даёт limit, а при pro: true проходит', async () => {
    const svc = await import('./service')

    pro = false
    currentBuilder = makeBuilder({ count: 3, error: null })
    const limited = await svc.createProject(USER_ID, 'доска', baseDesign())
    expect(limited).toEqual({ ok: false, error: 'limit' })
    expect(currentBuilder.calls.some((c) => c.method === 'insert')).toBe(false)

    pro = true
    currentBuilder = makeBuilder({ data: { id: PROJECT_ID, name: 'доска', updated_at: '2026-01-01T00:00:00.000Z' }, error: null })
    const passed = await svc.createProject(USER_ID, 'доска', baseDesign())
    expect(passed.ok).toBe(true)
  })

  it('getProject чужого id даёт notFound, а не чужой документ', async () => {
    const svc = await import('./service')
    currentBuilder = makeBuilder({ data: null, error: null })
    const res = await svc.getProject(USER_ID, PROJECT_ID)
    expect(res).toEqual({ ok: false, error: 'notFound' })
  })

  it('computeCutlist на baseDesign даёт непустой план и совпадает с прямым buildCutPlan', async () => {
    const svc = await import('./service')
    const res = await svc.computeCutlist(baseDesign(), 'ru')
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.plan.panels.length).toBeGreaterThan(0)
    expect(res.data.plan).toEqual(buildCutPlan(baseDesign(), 'ru'))
  })

  it('updateProject с пустым патчем даёт invalid', async () => {
    const svc = await import('./service')
    const res = await svc.updateProject(USER_ID, PROJECT_ID, {})
    expect(res).toEqual({ ok: false, error: 'invalid' })
    expect(from).not.toHaveBeenCalled()
  })

  it('курсор пагинации кодируется и декодируется в себя, битый курсор даёт invalid', async () => {
    const svc = await import('./service')

    currentBuilder = makeBuilder({
      data: Array.from({ length: 51 }, (_, i) => ({
        id: `p${i}`,
        name: `доска ${i}`,
        updated_at: new Date(2026, 0, 1, 0, 0, i).toISOString(),
      })),
      error: null,
    })
    const page = await svc.listProjects(USER_ID)
    expect(page.ok).toBe(true)
    if (!page.ok) return
    expect(page.data.items).toHaveLength(50)
    expect(page.data.nextCursor).not.toBeNull()

    currentBuilder = makeBuilder({ data: [], error: null })
    const secondPage = await svc.listProjects(USER_ID, page.data.nextCursor === null ? {} : { cursor: page.data.nextCursor })
    expect(secondPage.ok).toBe(true)

    const bad = await svc.listProjects(USER_ID, { cursor: 'не курсор совсем' })
    expect(bad).toEqual({ ok: false, error: 'invalid' })
  })
})
