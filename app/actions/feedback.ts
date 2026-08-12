'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import {
  FEEDBACK_MAX_LENGTH,
  GITHUB_FEEDBACK_REPO,
  buildFeedbackIssueBody,
  buildFeedbackIssueTitle,
} from '@/lib/feedback'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export type FeedbackResult =
  | { ok: true; issueUrl?: string }
  | { ok: false; error: 'empty' | 'tooLong' | 'disabled' | 'failed' }

const schema = z.object({
  body: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
  route: z.string().max(512).optional(),
  locale: z.enum(['ru', 'en']).optional(),
})

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
}): Promise<string | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_FEEDBACK_REPO}/issues`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${params.token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'x-github-api-version': '2022-11-28',
      },
      body: JSON.stringify({
        title: buildFeedbackIssueTitle(params.body, params.route),
        body: buildFeedbackIssueBody({
          body: params.body,
          route: params.route,
          locale: params.locale,
          userAgent: params.userAgent,
          email: params.email,
          occurredAt: new Date().toISOString(),
        }),
        labels: ['feedback'],
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { html_url?: unknown }
    return typeof data.html_url === 'string' ? data.html_url : null
  } catch {
    return null
  }
}

/**
 * Точки расширения на будущее, сознательно не сделанные в фазе 7:
 * скриншот страницы (нужен html2canvas, +200 КБ в бандл), вложение файла
 * (нужен приватный bucket и signed URL) и уведомление в Telegram (Bot API).
 * Primary-канал - GitHub issue (GITHUB_REPORT_TOKEN); insert в таблицу feedback
 * остаётся fallback-путём, если токена нет или GitHub API не ответил.
 */
export async function submitFeedbackAction(input: unknown): Promise<FeedbackResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const raw = typeof input === 'object' && input !== null ? (input as { body?: unknown }).body : ''
    const length = typeof raw === 'string' ? raw.trim().length : 0
    return { ok: false, error: length > FEEDBACK_MAX_LENGTH ? 'tooLong' : 'empty' }
  }

  // userAgent берём из заголовков запроса, а не из присланного клиентом поля:
  // клиенту тут верить не за чем, а заголовок всё равно уже есть.
  const headerList = await headers()
  const userAgent = (headerList.get('user-agent') ?? '').slice(0, 512)

  const supabaseReady = isSupabaseConfigured()
  const sb = supabaseReady ? await getSupabaseServer() : null
  const user = sb ? (await sb.auth.getUser()).data.user : null

  const token = process.env.GITHUB_REPORT_TOKEN
  if (token) {
    const issueUrl = await createGithubIssue({
      token,
      body: parsed.data.body,
      route: parsed.data.route,
      locale: parsed.data.locale,
      userAgent,
      email: user?.email ?? undefined,
    })
    if (issueUrl) return { ok: true, issueUrl }
    // GitHub недоступен или вернул ошибку - падаем в Supabase, чтобы фидбек не потерялся.
  }

  if (!sb) return { ok: false, error: 'disabled' }

  const { error } = await sb.from('feedback').insert({
    user_id: user?.id ?? null,
    body: parsed.data.body,
    route: parsed.data.route ?? null,
    user_agent: userAgent.length > 0 ? userAgent : null,
    locale: parsed.data.locale ?? null,
  })
  if (error) return { ok: false, error: 'failed' }
  return { ok: true }
}
