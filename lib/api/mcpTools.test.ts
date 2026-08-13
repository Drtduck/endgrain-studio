import { describe, expect, it, vi, beforeEach } from 'vitest'

const authorizeAndConsume = vi.fn()
vi.mock('./auth', () => ({ authorizeAndConsume }))

const listProjects = vi.fn()
const getProject = vi.fn()
const createProject = vi.fn()
const updateProject = vi.fn()
const computeCutlist = vi.fn()
const shareLink = vi.fn()
vi.mock('./service', () => ({ listProjects, getProject, createProject, updateProject, computeCutlist, shareLink }))

interface RegisteredTool {
  readonly name: string
  readonly config: { readonly inputSchema?: Record<string, unknown> }
  readonly cb: (args: Record<string, unknown>, ctx: { authInfo?: unknown }) => Promise<unknown>
}

function makeFakeServer() {
  const tools: RegisteredTool[] = []
  return {
    tools,
    registerTool: (name: string, config: Record<string, unknown>, cb: RegisteredTool['cb']) => {
      tools.push({ name, config, cb })
    },
  }
}

const AUTHED_CALLER = { keyId: 'key-1', userId: 'user-1', scopes: ['projects:read', 'projects:write', 'cutlist:read'], tier: 'free', usage: { used: 1, limit: 50 } }
const CTX = { authInfo: { clientId: 'key-1', extra: { userId: 'user-1', tier: 'free', scopes: ['projects:read', 'projects:write', 'cutlist:read'] } } }

describe('lib/api/mcpTools', () => {
  beforeEach(() => {
    authorizeAndConsume.mockReset()
    listProjects.mockReset()
    getProject.mockReset()
    createProject.mockReset()
    updateProject.mockReset()
    computeCutlist.mockReset()
    shareLink.mockReset()
  })

  it('регистрирует ровно пять инструментов с ожидаемыми именами и схемами', async () => {
    const { registerEndgrainTools } = await import('./mcpTools')
    const server = makeFakeServer()
    registerEndgrainTools(server as never)

    const names = server.tools.map((t) => t.name)
    expect(names).toEqual(['list_projects', 'get_project', 'create_project', 'update_project', 'compute_cutlist'])

    const byName = new Map(server.tools.map((t) => [t.name, t]))
    expect(Object.keys(byName.get('list_projects')?.config.inputSchema ?? {}).sort()).toEqual(['cursor', 'limit'])
    expect(Object.keys(byName.get('get_project')?.config.inputSchema ?? {}).sort()).toEqual(['id'])
    expect(Object.keys(byName.get('create_project')?.config.inputSchema ?? {}).sort()).toEqual(['design', 'name'])
    expect(Object.keys(byName.get('update_project')?.config.inputSchema ?? {}).sort()).toEqual(['design', 'id', 'name'])
    expect(Object.keys(byName.get('compute_cutlist')?.config.inputSchema ?? {}).sort()).toEqual(['design', 'locale', 'projectId'])
  })

  it('delete_project отсутствует среди инструментов', async () => {
    const { registerEndgrainTools } = await import('./mcpTools')
    const server = makeFakeServer()
    registerEndgrainTools(server as never)
    expect(server.tools.some((t) => t.name === 'delete_project')).toBe(false)
  })

  it('без authInfo инструмент возвращает ошибку unauthorized, а не бросает и не зовёт сервис', async () => {
    const { registerEndgrainTools } = await import('./mcpTools')
    const server = makeFakeServer()
    registerEndgrainTools(server as never)

    const tool = server.tools.find((t) => t.name === 'list_projects')
    const result = (await tool?.cb({}, {})) as { isError?: boolean; structuredContent: { error: { code: string } } }
    expect(result.isError).toBe(true)
    expect(result.structuredContent.error.code).toBe('unauthorized')
    expect(listProjects).not.toHaveBeenCalled()
  })

  it('ошибка сервиса превращается в MCP-ошибку с тем же кодом, а не в успешный ответ с текстом ошибки внутри', async () => {
    authorizeAndConsume.mockResolvedValue({ ok: true, caller: AUTHED_CALLER })
    getProject.mockResolvedValue({ ok: false, error: 'notFound' })

    const { registerEndgrainTools } = await import('./mcpTools')
    const server = makeFakeServer()
    registerEndgrainTools(server as never)

    const tool = server.tools.find((t) => t.name === 'get_project')
    const result = (await tool?.cb({ id: '11111111-1111-4111-8111-111111111111' }, CTX)) as {
      isError?: boolean
      structuredContent: { error: { code: string } }
    }
    expect(result.isError).toBe(true)
    expect(result.structuredContent.error.code).toBe('notFound')
  })

  it('нехватка скоупа даёт forbidden и не зовёт сервис', async () => {
    authorizeAndConsume.mockResolvedValue({ ok: false, error: 'forbidden' })

    const { registerEndgrainTools } = await import('./mcpTools')
    const server = makeFakeServer()
    registerEndgrainTools(server as never)

    const tool = server.tools.find((t) => t.name === 'create_project')
    const result = (await tool?.cb({ name: 'доска', design: {} }, CTX)) as {
      isError?: boolean
      structuredContent: { error: { code: string } }
    }
    expect(result.isError).toBe(true)
    expect(result.structuredContent.error.code).toBe('forbidden')
    expect(createProject).not.toHaveBeenCalled()
  })

  it('успешный list_projects возвращает structuredContent из сервиса', async () => {
    authorizeAndConsume.mockResolvedValue({ ok: true, caller: AUTHED_CALLER })
    listProjects.mockResolvedValue({ ok: true, data: { items: [{ id: 'p1', name: 'доска', updatedAt: '2026-01-01' }], nextCursor: null } })

    const { registerEndgrainTools } = await import('./mcpTools')
    const server = makeFakeServer()
    registerEndgrainTools(server as never)

    const tool = server.tools.find((t) => t.name === 'list_projects')
    const result = (await tool?.cb({}, CTX)) as { structuredContent: { items: unknown[] } }
    expect(result.structuredContent.items).toHaveLength(1)
    expect(listProjects).toHaveBeenCalledWith('user-1', {})
  })
})
