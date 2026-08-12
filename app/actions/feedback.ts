'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import {
  FEEDBACK_ATTACHMENTS_BUCKET,
  FEEDBACK_ATTACHMENT_B64_MAX,
  FEEDBACK_ACTION_LABEL_MAX,
  FEEDBACK_MAX_ACTIONS,
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_SCREENSHOT_B64_MAX,
  FEEDBACK_SIGNED_URL_TTL_SEC,
  GITHUB_FEEDBACK_REPO,
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
  normalizeFeedbackMime,
  safeFeedbackFileName,
  type FeedbackAction,
} from '@/lib/feedback'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'

export type FeedbackResult =
  | { ok: true; issueUrl?: string }
  | { ok: false; error: 'empty' | 'tooLong' | 'disabled' | 'failed' | 'attachmentTooBig' }

const actionSchema = z.object({
  t: z.string().max(40),
  kind: z.enum(['click', 'route', 'submit']),
  label: z.string().max(FEEDBACK_ACTION_LABEL_MAX),
})

const schema = z.object({
  body: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
  // route и url приходят из window.location и длину не гарантируют: битая
  // share-ссылка легко даёт километровый адрес. Отбивать из-за этого весь
  // фидбек нельзя - схема их не ограничивает, а обрезает уже код ниже.
  route: z.string().optional(),
  locale: z.enum(['ru', 'en']).optional(),
  url: z.string().optional(),
  viewport: z.string().max(50).optional(),
  actions: z.array(actionSchema).max(FEEDBACK_MAX_ACTIONS).optional(),
  attachment: z
    .object({
      name: z.string().max(200),
      type: z.string().max(100),
      dataBase64: z.string().max(FEEDBACK_ATTACHMENT_B64_MAX),
    })
    .optional(),
  screenshot: z
    .object({
      dataBase64: z.string().max(FEEDBACK_SCREENSHOT_B64_MAX),
    })
    .optional(),
})

interface UploadedFile {
  url: string | null
}

/**
 * Отличает «payload не прошёл схему из-за размера вложения» от пустого или
 * слишком длинного текста: пользователю про эти случаи надо сказать разное.
 */
function isAttachmentTooBig(raw: Record<string, unknown>): boolean {
  const att = raw['attachment']
  if (typeof att === 'object' && att !== null) {
    const data = (att as Record<string, unknown>)['dataBase64']
    if (typeof data === 'string' && data.length > FEEDBACK_ATTACHMENT_B64_MAX) return true
  }
  const shot = raw['screenshot']
  if (typeof shot === 'object' && shot !== null) {
    const data = (shot as Record<string, unknown>)['dataBase64']
    if (typeof data === 'string' && data.length > FEEDBACK_SCREENSHOT_B64_MAX) return true
  }
  return false
}

/**
 * Схлопывает переносы строк в пробел. Любая строка из клиента, которая идёт
 * отдельной строкой в теле issue, обязана пройти через это: иначе в разметку
 * можно дописать чужие поля.
 */
function sanitizeLine(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const clean = value.replace(/[\r\n]+/g, ' ').trim()
  return clean.length > 0 ? clean : undefined
}

/**
 * Кладёт бинарь в приватный bucket feedback-attachments и возвращает signed URL
 * на 30 дней. Best-effort: при любой ошибке null, фидбек всё равно уходит.
 * Требует service-ключ, потому что bucket приватный и на чтение политик нет:
 * подписать ссылку анонимной сессией нельзя, и это сознательно.
 */
async function uploadFeedbackFile(
  path: string,
  dataBase64: string,
  contentType: string,
): Promise<UploadedFile> {
  if (!isSupabaseServiceConfigured()) return { url: null }
  try {
    const svc = getSupabaseService()
    const bytes = Buffer.from(dataBase64, 'base64')
    const storage = svc.storage.from(FEEDBACK_ATTACHMENTS_BUCKET)
    const { error: uploadError } = await storage.upload(path, bytes, { contentType, upsert: false })
    if (uploadError) {
      console.error('[feedback] storage upload failed', uploadError.message)
      return { url: null }
    }
    const { data, error: signError } = await storage.createSignedUrl(path, FEEDBACK_SIGNED_URL_TTL_SEC)
    if (signError || !data) return { url: null }
    return { url: data.signedUrl }
  } catch (e) {
    console.error('[feedback] attachment upload error', e)
    return { url: null }
  }
}

/**
 * Primary-канал обратной связи: issue в GitHub-репозитории проекта через
 * обычный fetch (без @octokit/rest - экономим бандл). Возвращает html_url
 * при успехе и null при любой ошибке сети или ответа GitHub, чтобы вызывающий
 * код мог упасть в fallback на Supabase и не потерять фидбек.
 */
async function createGithubIssue(params: {
  token: string
  body: string
  route: string | undefined
  locale: string | undefined
  userAgent: string
  email: string | undefined
  url: string | undefined
  viewport: string | undefined
  attachmentUrl: string | undefined
  attachmentName: string | undefined
  screenshotUrl: string | undefined
  attachmentFailed: boolean
  screenshotFailed: boolean
  actions: readonly FeedbackAction[] | undefined
}): Promise<string | null> {
  // route приходит из клиентского window.location - чистим переносы строк,
  // чтобы им нельзя было сломать title/body issue (инъекция лишних строк).
  const route = params.route?.replace(/[\r\n]+/g, ' ')
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_FEEDBACK_REPO}/issues`, {
      method: 'POST',
      // Лимит 5 сек: без него при зависшем GitHub action висит до таймаута
      // Vercel и fallback в Supabase не успевает сработать.
      signal: AbortSignal.timeout(5000),
      headers: {
        authorization: `Bearer ${params.token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        title: buildFeedbackIssueTitle(params.body, route),
        body: buildFeedbackIssueBody({
          body: params.body,
          route,
          locale: params.locale,
          userAgent: params.userAgent,
          email: params.email,
          occurredAt: new Date().toISOString(),
          url: sanitizeLine(params.url),
          viewport: sanitizeLine(params.viewport),
          attachmentUrl: params.attachmentUrl,
          attachmentName: params.attachmentName,
          screenshotUrl: params.screenshotUrl,
          attachmentFailed: params.attachmentFailed,
          screenshotFailed: params.screenshotFailed,
          actions: params.actions,
        }),
        labels: ['feedback'],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { html_url?: unknown }
    return typeof data.html_url === 'string' ? data.html_url : null
  } catch {
    // Сюда же падает AbortError от таймаута - трактуем как обычную сетевую
    // ошибку и уходим в fallback на Supabase.
    return null
  }
}

/**
 * Primary-канал - GitHub issue (GITHUB_REPORT_TOKEN); insert в таблицу feedback
 * остаётся fallback-путём, если токена нет или GitHub API не ответил. Вложение
 * пользователя и автоскриншот экрана уезжают в приватный bucket Storage, а в
 * issue и в запись БД идут signed URL на 30 дней. Storage best-effort: если
 * bucket недоступен или service-ключа нет, текст фидбека всё равно уходит.
 */
export async function submitFeedbackAction(input: unknown): Promise<FeedbackResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const raw = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
    const text = typeof raw['body'] === 'string' ? raw['body'].trim() : ''
    if (isAttachmentTooBig(raw)) return { ok: false, error: 'attachmentTooBig' }
    return { ok: false, error: text.length > FEEDBACK_MAX_LENGTH ? 'tooLong' : 'empty' }
  }

  // userAgent берём из заголовков запроса, а не из присланного клиентом поля:
  // клиенту тут верить не за чем, а заголовок всё равно уже есть.
  const headerList = await headers()
  const userAgent = (headerList.get('user-agent') ?? '').slice(0, 512)

  const supabaseReady = isSupabaseConfigured()
  const sb = supabaseReady ? await getSupabaseServer() : null
  const user = sb ? (await sb.auth.getUser()).data.user : null

  const { attachment, screenshot } = parsed.data
  // Длину режем, а не отбиваем: адрес страницы приходит из браузера и по битой
  // share-ссылке бывает любым. Пределы совпадают с check-констрейнтами таблицы.
  const route = parsed.data.route?.slice(0, 512)
  const url = parsed.data.url?.slice(0, 2000)
  const owner = user?.id ?? 'anon'
  // Не Date.now(): у анонимов общая «папка», и два одновременных фидбека с
  // одинаковым именем файла упёрлись бы в upsert: false. UUID это исключает.
  const key = crypto.randomUUID()

  let attachmentUrl: string | undefined
  let screenshotUrl: string | undefined
  if (attachment) {
    const name = safeFeedbackFileName(attachment.name)
    const uploaded = await uploadFeedbackFile(
      `${owner}/${key}-attachment-${name}`,
      attachment.dataBase64,
      normalizeFeedbackMime(attachment.type),
    )
    attachmentUrl = uploaded.url ?? undefined
  }
  if (screenshot) {
    const uploaded = await uploadFeedbackFile(
      `${owner}/${key}-screenshot.jpg`,
      screenshot.dataBase64,
      'image/jpeg',
    )
    screenshotUrl = uploaded.url ?? undefined
  }
  const attachmentFailed = attachment !== undefined && attachmentUrl === undefined
  const screenshotFailed = screenshot !== undefined && screenshotUrl === undefined

  // Метки и время действий тоже пришли из браузера: чистим переносы, чтобы
  // список действий не смог дорисовать себе секций в теле issue.
  const actions: FeedbackAction[] | undefined = parsed.data.actions?.map((a) => ({
    t: sanitizeLine(a.t) ?? '-',
    kind: a.kind,
    label: sanitizeLine(a.label) ?? '-',
  }))

  const token = process.env.GITHUB_REPORT_TOKEN
  if (token) {
    const issueUrl = await createGithubIssue({
      token,
      body: parsed.data.body,
      route,
      locale: parsed.data.locale,
      userAgent,
      email: user?.email ?? undefined,
      url,
      viewport: parsed.data.viewport,
      attachmentUrl,
      attachmentName: attachment?.name,
      screenshotUrl,
      attachmentFailed,
      screenshotFailed,
      actions,
    })
    if (issueUrl) return { ok: true, issueUrl }
    // GitHub недоступен или вернул ошибку - падаем в Supabase, чтобы фидбек не потерялся.
  }

  if (!sb) return { ok: false, error: 'disabled' }

  const base = {
    user_id: user?.id ?? null,
    body: parsed.data.body,
    route: route ?? null,
    user_agent: userAgent.length > 0 ? userAgent : null,
    locale: parsed.data.locale ?? null,
  }
  const { error } = await sb.from('feedback').insert({
    ...base,
    attachment_url: attachmentUrl ?? null,
    attachment_name: attachment ? safeFeedbackFileName(attachment.name) : null,
    screenshot_url: screenshotUrl ?? null,
  })
  if (!error) return { ok: true }

  // 42703 (undefined_column) значит, что миграция с колонками под вложения к
  // этой базе ещё не применена. Деплой кода не обязан ждать миграцию: повторяем
  // insert по старой форме, чтобы текст фидбека не потерялся. Ссылки на файлы в
  // этом прогоне пропадут, но они и так уже лежат в теле issue.
  if (error.code !== '42703') return { ok: false, error: 'failed' }
  console.warn('[feedback] колонки вложений отсутствуют, повтор insert без них')
  const retry = await sb.from('feedback').insert(base)
  if (retry.error) return { ok: false, error: 'failed' }
  return { ok: true }
}
