import { createProjectSchema, listQuerySchema } from '@/lib/api/schemas'
import { fail, ok, readJsonBody, toApiErrorCode, withApiAuth } from '@/lib/api/http'
import { createProject, listProjects } from '@/lib/api/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = withApiAuth(
  'projects:read',
  async (req, caller) => {
    const url = new URL(req.url)
    const parsedQuery = listQuerySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      cursor: url.searchParams.get('cursor') ?? undefined,
    })
    if (!parsedQuery.success) return fail('invalid', caller)

    const opts: { limit?: number; cursor?: string } = {}
    if (parsedQuery.data.limit !== undefined) opts.limit = parsedQuery.data.limit
    if (parsedQuery.data.cursor !== undefined) opts.cursor = parsedQuery.data.cursor

    const result = await listProjects(caller.userId, opts)
    if (!result.ok) return fail(toApiErrorCode(result.error), caller)
    return ok(result.data, caller)
  },
)

export const POST = withApiAuth(
  'projects:write',
  async (req, caller) => {
    let body: unknown
    try {
      body = await readJsonBody(req)
    } catch {
      return fail('invalid', caller)
    }
    const parsed = createProjectSchema.safeParse(body)
    if (!parsed.success) return fail('invalid', caller)

    const result = await createProject(caller.userId, parsed.data.name, parsed.data.design)
    if (!result.ok) return fail(toApiErrorCode(result.error), caller)
    return ok(result.data, caller, { status: 201 })
  },
)
