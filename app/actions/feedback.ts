'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { FEEDBACK_MAX_LENGTH } from '@/lib/feedback'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'

export type FeedbackResult = { ok: true } | { ok: false; error: 'empty' | 'tooLong' | 'disabled' | 'failed' }

const schema = z.object({
  body: z.string().trim().min(1).max(FEEDBACK_MAX_LENGTH),
  route: z.string().max(512).optional(),
  locale: z.enum(['ru', 'en']).optional(),
})

/**
 * Точки расширения на будущее, сознательно не сделанные в фазе 7:
 * скриншот страницы (нужен html2canvas, +200 КБ в бандл), вложение файла
 * (нужен приватный bucket и signed URL), дубль обращения в GitHub issue
 * (Octokit + GITHUB_REPORT_TOKEN) и уведомление в Telegram (Bot API).
 * Все они цепляются здесь же, после успешного insert, и ни один из них не
 * должен ронять ответ пользователю: обращение уже сохранено.
 */
export async function submitFeedbackAction(input: unknown): Promise<FeedbackResult> {
  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    const raw = typeof input === 'object' && input !== null ? (input as { body?: unknown }).body : ''
    const length = typeof raw === 'string' ? raw.trim().length : 0
    return { ok: false, error: length > FEEDBACK_MAX_LENGTH ? 'tooLong' : 'empty' }
  }

  if (!isSupabaseConfigured()) return { ok: false, error: 'disabled' }

  // userAgent берём из заголовков запроса, а не из присланного клиентом поля:
  // клиенту тут верить не за чем, а заголовок всё равно уже есть.
  const headerList = await headers()
  const userAgent = (headerList.get('user-agent') ?? '').slice(0, 512)

  const sb = await getSupabaseServer()
  const { data } = await sb.auth.getUser()

  const { error } = await sb.from('feedback').insert({
    user_id: data.user?.id ?? null,
    body: parsed.data.body,
    route: parsed.data.route ?? null,
    user_agent: userAgent.length > 0 ? userAgent : null,
    locale: parsed.data.locale ?? null,
  })
  if (error) return { ok: false, error: 'failed' }
  return { ok: true }
}
