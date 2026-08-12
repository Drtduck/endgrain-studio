// Вынесено из app/actions/feedback.ts: файл с директивой 'use server' может
// экспортировать только асинхронные функции, константу оттуда Next не соберёт.
export const FEEDBACK_MAX_LENGTH = 2000

// Репозиторий, куда primary-канал отправляет issue при заданном GITHUB_REPORT_TOKEN.
export const GITHUB_FEEDBACK_REPO = 'Drtduck/endgrain-studio'

const ISSUE_TITLE_BODY_MAX = 60

/** Заголовок issue: первые ~60 символов текста фидбека плюс маршрут в скобках. */
export function buildFeedbackIssueTitle(body: string, route: string | undefined): string {
  const trimmed = body.trim()
  const short = trimmed.slice(0, ISSUE_TITLE_BODY_MAX)
  const ellipsis = trimmed.length > ISSUE_TITLE_BODY_MAX ? '...' : ''
  const routePart = route ? ` (${route})` : ''
  return `${short}${ellipsis}${routePart}`
}

/** Тело issue: текст фидбека плюс контекст (маршрут, locale, email, User-Agent, время). */
export function buildFeedbackIssueBody(params: {
  body: string
  route: string | undefined
  locale: string | undefined
  userAgent: string
  email: string | undefined
  occurredAt: string
}): string {
  const meta = [
    params.route ? `Route: ${params.route}` : null,
    params.locale ? `Locale: ${params.locale}` : null,
    params.email ? `Email: ${params.email}` : null,
    `User-Agent: ${params.userAgent.length > 0 ? params.userAgent : '-'}`,
    `Time: ${params.occurredAt}`,
  ].filter((line): line is string => line !== null)

  return `${params.body}\n\n---\n${meta.join('\n')}`
}
