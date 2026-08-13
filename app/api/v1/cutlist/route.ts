import { fail, ok, readJsonBody, toApiErrorCode, withApiAuth } from '@/lib/api/http'
import { cutlistRequestSchema } from '@/lib/api/schemas'
import { computeCutlist, getProject } from '@/lib/api/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Посчитать распил по присланному design либо по projectId своего проекта. */
export const POST = withApiAuth('cutlist:read', async (req, caller) => {
  let body: unknown
  try {
    body = await readJsonBody(req)
  } catch {
    return fail('invalid', caller)
  }
  const parsed = cutlistRequestSchema.safeParse(body)
  if (!parsed.success) return fail('invalid', caller)

  const locale = parsed.data.locale ?? 'en'

  let design: unknown = parsed.data.design
  if (design === undefined && parsed.data.projectId !== undefined) {
    const project = await getProject(caller.userId, parsed.data.projectId)
    if (!project.ok) return fail(toApiErrorCode(project.error), caller)
    design = project.data.design
  }

  const csvOpts = parsed.data.csv === undefined ? {} : { csv: parsed.data.csv }
  const result = await computeCutlist(design, locale, csvOpts)
  if (!result.ok) return fail(toApiErrorCode(result.error), caller)
  return ok(result.data, caller)
})
