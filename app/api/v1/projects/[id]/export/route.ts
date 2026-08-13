import { fail, ok, toApiErrorCode, withApiAuth } from '@/lib/api/http'
import { localeSchema } from '@/lib/api/schemas'
import { computeCutlist, getProject, shareLink } from '@/lib/api/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  readonly params: Promise<{ readonly id: string }>
}

/**
 * Сервер не рисует PDF (раздел 6.4 дизайн-документа): headless-браузер в
 * serverless ради одного эндпоинта не окупается. Вместо этого - честный CSV,
 * посчитанный на сервере, и ссылка на студию с зашитым в hash документом:
 * PDF там скачивается одним нажатием Export -> PDF.
 */
export const GET = withApiAuth<RouteParams>('cutlist:read', async (req, caller, ctx) => {
  const { id } = await ctx.params
  const project = await getProject(caller.userId, id)
  if (!project.ok) return fail(toApiErrorCode(project.error), caller)

  const url = new URL(req.url)
  const parsedLocale = localeSchema.safeParse(url.searchParams.get('locale') ?? 'en')
  const locale = parsedLocale.success ? parsedLocale.data : 'en'

  const cutlist = await computeCutlist(project.data.design, locale, { csv: true })
  if (!cutlist.ok) return fail(toApiErrorCode(cutlist.error), caller)

  const link = shareLink(project.data.design)
  if (!link.ok) return fail(toApiErrorCode(link.error), caller)

  return ok(
    {
      csv: cutlist.data.csv ?? '',
      pdfUrl: link.data.url,
      pdfNote: 'Open the link and use Export -> PDF. Server-side PDF rendering is not available yet.',
    },
    caller,
  )
})
