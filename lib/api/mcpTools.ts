import 'server-only'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/server'
import { authorizeAndConsume, type ApiCaller, type ApiScope } from './auth'
import { computeCutlist, createProject, getProject, listProjects, shareLink, updateProject } from './service'
import { toApiErrorCode, type ApiErrorCode } from './http'

/**
 * Инструменты MCP объявлены отдельно от транспорта (app/api/mcp/route.ts),
 * поэтому их можно прогнать в vitest без единого HTTP-запроса. Каждый - один
 * вызов сервисной функции (lib/api/service.ts), ровно как REST. Схемы
 * аргументов и описания - на английском: их читает модель, не человек
 * (та же причина, что у английских тел ошибок REST, раздел 6.2/7 спеки).
 *
 * Результаты не типизируются собственным именованным интерфейсом: SDK ждёт
 * структурную форму CallToolResult, и любая обёртка ломает вывод типов
 * registerTool. Возвращаем литералы ровно той же формы, что и рабочий tool
 * из первого коммита (app/api/mcp/route.ts:ping) - content с 'text' as const
 * плюс structuredContent.
 */

/** Форма AuthInfo.extra, которую кладёт verifyMcpToken (lib/api/auth.ts). */
interface McpAuthExtra {
  readonly userId: string
  readonly tier: 'free' | 'developer'
  readonly scopes: readonly ApiScope[]
}

interface McpAuthInfo {
  readonly clientId: string
  readonly extra?: McpAuthExtra
}

/** Достаточно широкий тип контекста инструмента: нужен только authInfo. */
export interface ToolCtx {
  readonly authInfo?: McpAuthInfo
}

function errorResult(code: ApiErrorCode, message: string) {
  return {
    content: [{ type: 'text' as const, text: `Error (${code}): ${message}` }],
    structuredContent: { error: { code, message } } as Record<string, unknown>,
    isError: true,
  }
}

type ErrorResult = ReturnType<typeof errorResult>

const ERROR_MESSAGES: Readonly<Record<ApiErrorCode, string>> = {
  unauthorized: 'Invalid or missing API key',
  forbidden: 'API key lacks the required scope',
  invalid: 'Invalid arguments',
  notFound: 'Not found',
  limit: 'Free plan project limit reached',
  rateLimited: 'Daily request limit reached',
  unavailable: 'API is not configured',
  failed: 'Internal error',
}

function errorFor(code: ApiErrorCode): ErrorResult {
  return errorResult(code, ERROR_MESSAGES[code])
}

/** Достаёт проверенного вызывающего из ctx.authInfo и прогоняет его через скоуп и квоту. */
async function requireCaller(ctx: ToolCtx, scope: ApiScope): Promise<{ ok: true; caller: ApiCaller } | { ok: false; result: ErrorResult }> {
  const info = ctx.authInfo
  if (!info?.extra) return { ok: false, result: errorFor('unauthorized') }

  const row = { id: info.clientId, userId: info.extra.userId, scopes: info.extra.scopes, tier: info.extra.tier }
  const auth = await authorizeAndConsume(row, scope)
  if (!auth.ok) return { ok: false, result: errorFor(auth.error) }
  return { ok: true, caller: auth.caller }
}

const localeArg = z.union([z.literal('ru'), z.literal('en')]).optional()

export function registerEndgrainTools(server: McpServer): void {
  server.registerTool(
    'list_projects',
    {
      title: 'List projects',
      description: 'List the caller\'s saved board projects, newest first.',
      inputSchema: { limit: z.number().int().positive().max(100).optional(), cursor: z.string().min(1).optional() },
    },
    async (args, ctx) => {
      const auth = await requireCaller(ctx as ToolCtx, 'projects:read')
      if (!auth.ok) return auth.result

      const opts: { limit?: number; cursor?: string } = {}
      if (args.limit !== undefined) opts.limit = args.limit
      if (args.cursor !== undefined) opts.cursor = args.cursor

      const result = await listProjects(auth.caller.userId, opts)
      if (!result.ok) return errorFor(toApiErrorCode(result.error))
      return {
        content: [{ type: 'text' as const, text: `${result.data.items.length} project(s).` }],
        structuredContent: result.data as unknown as Record<string, unknown>,
      }
    },
  )

  server.registerTool(
    'get_project',
    {
      title: 'Get project',
      description: 'Fetch one project by id: metadata plus its full board design document.',
      inputSchema: { id: z.uuid() },
    },
    async (args, ctx) => {
      const auth = await requireCaller(ctx as ToolCtx, 'projects:read')
      if (!auth.ok) return auth.result

      const result = await getProject(auth.caller.userId, args.id)
      if (!result.ok) return errorFor(toApiErrorCode(result.error))
      return {
        content: [{ type: 'text' as const, text: `Project "${result.data.summary.name}".` }],
        structuredContent: { summary: result.data.summary, design: result.data.design } as Record<string, unknown>,
      }
    },
  )

  server.registerTool(
    'create_project',
    {
      title: 'Create project',
      description: 'Save a new board project under the caller\'s account.',
      inputSchema: { name: z.string().trim().min(1).max(120), design: z.unknown() },
    },
    async (args, ctx) => {
      const auth = await requireCaller(ctx as ToolCtx, 'projects:write')
      if (!auth.ok) return auth.result

      const result = await createProject(auth.caller.userId, args.name, args.design)
      if (!result.ok) return errorFor(toApiErrorCode(result.error))
      return {
        content: [{ type: 'text' as const, text: `Created project "${result.data.name}" (${result.data.id}).` }],
        structuredContent: result.data as unknown as Record<string, unknown>,
      }
    },
  )

  server.registerTool(
    'update_project',
    {
      title: 'Update project',
      description: 'Rename a project and/or replace its design document ("save over" instead of a new copy).',
      inputSchema: { id: z.uuid(), name: z.string().trim().min(1).max(120).optional(), design: z.unknown().optional() },
    },
    async (args, ctx) => {
      const auth = await requireCaller(ctx as ToolCtx, 'projects:write')
      if (!auth.ok) return auth.result

      const patch: { name?: string; design?: unknown } = {}
      if (args.name !== undefined) patch.name = args.name
      if (args.design !== undefined) patch.design = args.design

      const result = await updateProject(auth.caller.userId, args.id, patch)
      if (!result.ok) return errorFor(toApiErrorCode(result.error))
      return {
        content: [{ type: 'text' as const, text: `Updated project "${result.data.name}".` }],
        structuredContent: result.data as unknown as Record<string, unknown>,
      }
    },
  )

  server.registerTool(
    'compute_cutlist',
    {
      title: 'Compute cutlist',
      description:
        'Compute the cut plan, glue-up steps and material cost for a design (given inline, or by projectId of a saved project). ' +
        'Returns a shareable studio link where a human can open the project and export a PDF.',
      inputSchema: { projectId: z.uuid().optional(), design: z.unknown().optional(), locale: localeArg },
    },
    async (args, ctx) => {
      const auth = await requireCaller(ctx as ToolCtx, 'cutlist:read')
      if (!auth.ok) return auth.result

      let design: unknown = args.design
      if (design === undefined && args.projectId !== undefined) {
        const project = await getProject(auth.caller.userId, args.projectId)
        if (!project.ok) return errorFor(toApiErrorCode(project.error))
        design = project.data.design
      }
      if (design === undefined) return errorResult('invalid', 'Provide either design or projectId')

      const locale = args.locale ?? 'en'
      const result = await computeCutlist(design, locale)
      if (!result.ok) return errorFor(toApiErrorCode(result.error))

      const link = shareLink(design)
      const shareUrl = link.ok ? link.data.url : null

      return {
        content: [
          {
            type: 'text' as const,
            text: `Cut plan: ${result.data.plan.panels.length} panel(s), ${result.data.plan.crosscutCount} crosscut(s), ~$${result.data.calc.totalCostUsd.toFixed(2)} lumber.`,
          },
        ],
        structuredContent: { ...result.data, shareUrl } as unknown as Record<string, unknown>,
      }
    },
  )
}
