import 'server-only'
import { zipSync, type Zippable } from 'fflate'
import { z } from 'zod'
import { downloadPromoAsset } from '@/lib/promo/assets'
import { cropForMarketplace } from '@/lib/promo/crop'
import { MARKETPLACE_IDS, marketplaceById, type MarketplaceId } from '@/lib/promo/marketplaces'
import { PER_IP_PER_HOUR, clientIp, promoLimiter } from '@/lib/promo/rateLimit'
import { idSchema } from '@/lib/promo/schema'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/supabase/session'

/**
 * Отдаёт zip с отобранными кадрами, перекропленными под площадку (спека,
 * раздел 7.4). Route handler, а не server action: тот возвращает сериализуемое
 * значение, не поток байтов.
 *
 * GET, а не POST, сознательно: браузер должен уметь скачать это обычной
 * ссылкой (<a href download>), без fetch + Blob + createObjectURL. Скачивание
 * через JS ломается в трети мобильных браузеров и не показывает прогресс.
 *
 * Никакой платы: кроп - операция над уже оплаченными кадрами. Скачивать один
 * и тот же пак под шесть площадок можно бесплатно и сколько угодно раз.
 */
export const maxDuration = 60
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_SHOTS_IN_QUERY = 30
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024

const packQuerySchema = z.object({
  market: z.enum(MARKETPLACE_IDS),
  shots: z
    .string()
    .min(1)
    .transform((raw) => raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0))
    .pipe(z.array(idSchema).min(1).max(MAX_SHOTS_IN_QUERY)),
  format: z.enum(['jpeg', 'png']).optional(),
})

interface PackShotRow {
  readonly id: string
  readonly project_id: string
  readonly kind_slug: string
  readonly variant_no: number
  readonly storage_path: string | null
  readonly status: string
}

function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'shot'
}

/** RFC 5987: имя проекта бывает русским, filename= без кодирования даст мусор. */
function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7E]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

function fail(status: number, error: string): Response {
  return Response.json({ error }, { status })
}

export async function GET(
  req: Request,
  ctx: { readonly params: Promise<{ readonly seriesId: string }> },
): Promise<Response> {
  if (!isSupabaseServiceConfigured()) return fail(503, 'unavailable')

  const user = await getCurrentUser()
  if (!user) return fail(401, 'unauthenticated')

  // Кадры уже оплачены, деньги провайдера тут не тратятся, но до 30 кадров
  // через sharp на КАЖДЫЙ запрос - бесплатная кувалда по CPU для вошедшего
  // пользователя (P0-мелочь ревью 14.08.2026). Тот же счётчик по адресу, что
  // закрывает платные действия промо-студии.
  const rateLimitVerdict = promoLimiter.take(
    clientIp(req.headers.get('x-forwarded-for'), req.headers.get('x-real-ip')),
    PER_IP_PER_HOUR,
    Date.now(),
  )
  if (rateLimitVerdict !== 'ok') return fail(429, 'rateLimited')

  const { seriesId } = await ctx.params
  if (!idSchema.safeParse(seriesId).success) return fail(400, 'invalid')

  const url = new URL(req.url)
  const parsedQuery = packQuerySchema.safeParse({
    market: url.searchParams.get('market') ?? undefined,
    shots: url.searchParams.get('shots') ?? undefined,
    format: url.searchParams.get('format') ?? undefined,
  })
  if (!parsedQuery.success) return fail(400, 'invalid')

  const spec = marketplaceById(parsedQuery.data.market as MarketplaceId)
  const requestedIds = [...new Set(parsedQuery.data.shots)]
  const truncated = requestedIds.length > spec.image.maxImages
  const usedIds = requestedIds.slice(0, spec.image.maxImages)

  const sb = getSupabaseService()
  const { data: shotRows, error } = await sb
    .from('promo_shots')
    .select('id, project_id, kind_slug, variant_no, storage_path, status')
    .in('id', usedIds)
    .eq('user_id', user.id)
    .eq('status', 'done')
  if (error) return fail(500, 'failed')

  const rows = (shotRows ?? []) as readonly PackShotRow[]
  if (rows.length === 0) return fail(404, 'notFound')

  // Порядок вывода = порядок id в query, не порядок ответа БД: тот же порядок,
  // в котором человек видел кадры выбранными в галерее.
  const byId = new Map(rows.map((r) => [r.id, r]))
  const ordered = usedIds.flatMap((id) => {
    const row = byId.get(id)
    return row !== undefined ? [row] : []
  })
  if (ordered.length === 0) return fail(404, 'notFound')

  const { data: projectRow } = await sb.from('projects').select('name').eq('id', ordered[0]!.project_id).maybeSingle()
  const projectName = (projectRow as { readonly name?: string } | null)?.name?.trim() || 'board'

  const format = parsedQuery.data.format ?? spec.image.format
  const cropSpec = { ...spec.image, format }

  async function buildArchive(quality: typeof cropSpec): Promise<{ readonly bytes: Uint8Array; readonly count: number }> {
    const files: Zippable = {}
    const readme: string[] = [
      `Endgrain Studio - ${projectName}`,
      `Marketplace: ${spec.id}`,
      `Date: ${new Date().toISOString().slice(0, 10)}`,
      '',
      'Files:',
    ]
    let count = 0
    for (const row of ordered) {
      if (row.storage_path === null) continue
      const original = await downloadPromoAsset(row.storage_path)
      if (original === null) continue
      const cropped = await cropForMarketplace(original, quality)
      count += 1
      const ord = String(count).padStart(2, '0')
      const variantSuffix = row.variant_no > 1 ? `-v${row.variant_no}` : ''
      const ext = format === 'png' ? 'png' : 'jpg'
      const name = `${ord}-${slugify(row.kind_slug)}${variantSuffix}-${cropped.width}x${cropped.height}.${ext}`
      files[name] = new Uint8Array(cropped.buffer)
      readme.push(`  ${name}`)
    }
    if (count === 0) return { bytes: new Uint8Array(0), count: 0 }

    if (truncated) {
      readme.push('', `Note: only the first ${spec.image.maxImages} of ${requestedIds.length} shots were included (marketplace limit).`)
    }
    if (!spec.confirmed) {
      readme.push(
        '',
        'Marketplace image requirements were collected from public sources, not read directly from the seller documentation.',
        'Please verify against your seller account before publishing.',
        `Source: ${spec.sourceUrl}`,
      )
    }
    files['README.txt'] = new TextEncoder().encode(readme.join('\n'))
    // JPEG уже сжат: уровень 0 (store), deflate поверх него - трата процессора без выигрыша.
    return { bytes: zipSync(files, { level: 0 }), count }
  }

  let archive = await buildArchive(cropSpec)
  if (archive.count === 0) return fail(404, 'notFound')

  if (archive.bytes.byteLength > MAX_ARCHIVE_BYTES) {
    // Пересобираем один раз с более жёстким лимитом байт на кадр (спека 7.5):
    // fitUnderBytes внутри cropForMarketplace сама понижает quality шагами.
    archive = await buildArchive({ ...cropSpec, maxBytes: Math.floor(cropSpec.maxBytes / 2) })
  }

  const fileName = `endgrain-${slugify(projectName)}-${spec.id}.zip`
  return new Response(archive.bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': contentDisposition(fileName),
      'Content-Length': String(archive.bytes.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}
