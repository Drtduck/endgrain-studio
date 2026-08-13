import { fail, ok, readJsonBody, toApiErrorCode, withApiAuth } from '@/lib/api/http'
import { updateProjectSchema } from '@/lib/api/schemas'
import { deleteProject, getProject, updateProject } from '@/lib/api/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  readonly params: Promise<{ readonly id: string }>
}

export const GET = withApiAuth<RouteParams>('projects:read', async (_req, caller, ctx) => {
  const { id } = await ctx.params
  const result = await getProject(caller.userId, id)
  if (!result.ok) return fail(toApiErrorCode(result.error), caller)
  return ok({ id: result.data.summary.id, name: result.data.summary.name, updatedAt: result.data.summary.updatedAt, design: result.data.design }, caller)
})

export const PATCH = withApiAuth<RouteParams>('projects:write', async (req, caller, ctx) => {
  const { id } = await ctx.params
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return fail('invalid', caller)
  }
  const parsed = updateProjectSchema.safeParse(body)
  if (!parsed.success) return fail('invalid', caller)

  const patch: { name?: string; design?: unknown } = {}
  if (parsed.data.name !== undefined) patch.name = parsed.data.name
  if (parsed.data.design !== undefined) patch.design = parsed.data.design

  const result = await updateProject(caller.userId, id, patch)
  if (!result.ok) return fail(toApiErrorCode(result.error), caller)
  return ok(result.data, caller)
})

export const DELETE = withApiAuth<RouteParams>('projects:write', async (_req, caller, ctx) => {
  const { id } = await ctx.params
  const result = await deleteProject(caller.userId, id)
  if (!result.ok) return fail(toApiErrorCode(result.error), caller)
  return ok({ deleted: true }, caller)
})
