// Вынесено из app/actions/feedback.ts: файл с директивой 'use server' может
// экспортировать только асинхронные функции, константу оттуда Next не соберёт.
export const FEEDBACK_MAX_LENGTH = 2000

// Репозиторий, куда primary-канал отправляет issue при заданном GITHUB_REPORT_TOKEN.
export const GITHUB_FEEDBACK_REPO = 'Drtduck/endgrain-studio'

/** Приватный bucket Supabase Storage под вложения и автоскриншоты. */
export const FEEDBACK_ATTACHMENTS_BUCKET = 'feedback-attachments'

/** Время жизни signed URL на вложение: 30 дней, как в доноре. */
export const FEEDBACK_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 30

/** Файл больше 2 МБ не берём: вместе со скриншотом payload должен влезть в bodySizeLimit. */
export const FEEDBACK_ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024

// Лимиты на base64-строки в payload server action. base64 раздувает бинарь
// примерно в 1.37 раза, поэтому 2 МБ файла это ~2.8M символов. Скриншоту
// достаётся столько же по бинарю, сколько разрешает file_size_limit bucket:
// больше 2 МБ Storage всё равно не примет, и кадр потерялся бы молча. Сумма
// двух лимитов (~4.8 МБ) обязана влезать в serverActions.bodySizeLimit 5mb.
export const FEEDBACK_ATTACHMENT_B64_MAX = 2_800_000
export const FEEDBACK_SCREENSHOT_B64_MAX = 2_000_000

/**
 * Белый список типов вложения. Тип приходит из браузера, верить ему нельзя:
 * с ним объект ляжет в Storage и по signed URL отдастся с этим же
 * Content-Type. Отсюда нет image/svg+xml - SVG выполняет скрипты при открытии
 * по прямой ссылке, а ссылка живёт 30 дней.
 */
export const FEEDBACK_ALLOWED_MIME: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'application/pdf',
  'text/plain',
]

/** Атрибут accept для input[type=file], синхронный с белым списком. */
export const FEEDBACK_ACCEPT_ATTR = FEEDBACK_ALLOWED_MIME.join(',')

/** Незнакомый тип превращаем в бинарь: браузер такой файл не выполнит, а скачает. */
export function normalizeFeedbackMime(type: string): string {
  const clean = type.split(';')[0]?.trim().toLowerCase() ?? ''
  return FEEDBACK_ALLOWED_MIME.includes(clean) ? clean : 'application/octet-stream'
}

/** Сколько последних действий пользователя уходит вместе с фидбеком. */
export const FEEDBACK_MAX_ACTIONS = 25

/** Максимальная длина метки одного действия в логе. */
export const FEEDBACK_ACTION_LABEL_MAX = 80

const ISSUE_TITLE_BODY_MAX = 60

/**
 * Имя файла для пути в Storage: латиница, цифры, точка, дефис и подчёркивание.
 * Всё остальное (кириллица, пробелы, слеши) схлопывается в подчёркивание, иначе
 * S3-совместимый ключ объекта может уехать в чужую «папку».
 */
export function safeFeedbackFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '_').slice(0, 100)
  return cleaned.length > 0 ? cleaned : 'file'
}

export type FeedbackActionKind = 'click' | 'route' | 'submit'

export interface FeedbackAction {
  /** ISO-время действия */
  t: string
  kind: FeedbackActionKind
  /** Человекочитаемая метка: текст кнопки, путь роута, имя формы */
  label: string
}

/** Заголовок issue: первые ~60 символов текста фидбека плюс маршрут в скобках. */
export function buildFeedbackIssueTitle(body: string, route: string | undefined): string {
  const trimmed = body.trim()
  const short = trimmed.slice(0, ISSUE_TITLE_BODY_MAX)
  const ellipsis = trimmed.length > ISSUE_TITLE_BODY_MAX ? '...' : ''
  const routePart = route ? ` (${route})` : ''
  return `${short}${ellipsis}${routePart}`
}

/**
 * Тело issue: текст фидбека плюс контекст (маршрут, locale, email, User-Agent, время).
 * Инвариант: email юзера в теле issue допустим, только пока репозиторий
 * Drtduck/endgrain-studio приватный. При открытии репо email отсюда убрать.
 */
export interface FeedbackIssueBodyParams {
  body: string
  route: string | undefined
  locale: string | undefined
  userAgent: string
  email: string | undefined
  occurredAt: string
  /** Полный адрес страницы (location.href), если клиент его прислал */
  url?: string | undefined
  /** Размер окна вида `1512x824` */
  viewport?: string | undefined
  /** Signed URL на файл пользователя в приватном bucket */
  attachmentUrl?: string | undefined
  attachmentName?: string | undefined
  /** Signed URL на автоскриншот экрана */
  screenshotUrl?: string | undefined
  /** Вложение пришло, но сохранить его не удалось - помечаем это явно */
  attachmentFailed?: boolean | undefined
  /** То же самое про автоскриншот */
  screenshotFailed?: boolean | undefined
  /** Последние действия пользователя, старые -> новые */
  actions?: readonly FeedbackAction[] | undefined
}

const ACTION_KIND_LABEL: Readonly<Record<FeedbackActionKind, string>> = {
  click: 'клик',
  route: 'переход',
  submit: 'сабмит',
}

export function buildFeedbackIssueBody(params: FeedbackIssueBodyParams): string {
  const meta = [
    params.route ? `Route: ${params.route}` : null,
    params.url ? `URL: ${params.url}` : null,
    params.locale ? `Locale: ${params.locale}` : null,
    params.email ? `Email: ${params.email}` : null,
    `User-Agent: ${params.userAgent.length > 0 ? params.userAgent : '-'}`,
    params.viewport ? `Viewport: ${params.viewport}` : null,
    `Time: ${params.occurredAt}`,
  ].filter((line): line is string => line !== null)

  const sections = [`${params.body}\n\n---\n${meta.join('\n')}`]

  const attachments: string[] = []
  if (params.screenshotUrl) {
    attachments.push(`- Скриншот экрана (signed URL, 30 дней): ${params.screenshotUrl}`)
  }
  if (params.attachmentUrl) {
    const name = params.attachmentName ? ` \`${safeFeedbackFileName(params.attachmentName)}\`` : ''
    attachments.push(`- Файл пользователя${name} (signed URL, 30 дней): ${params.attachmentUrl}`)
  }
  if (params.attachmentFailed) {
    attachments.push('- Вложение пришло, но сохранить его в Storage не удалось')
  }
  if (params.screenshotFailed) {
    attachments.push('- Скриншот снялся, но сохранить его в Storage не удалось')
  }
  if (attachments.length > 0) {
    sections.push(`### Вложения\n${attachments.join('\n')}`)
  }

  if (params.actions && params.actions.length > 0) {
    const lines = params.actions.map(
      (a) => `- \`${a.t}\` ${ACTION_KIND_LABEL[a.kind]}: ${a.label}`,
    )
    sections.push(`### Последние действия\n${lines.join('\n')}`)
  }

  return sections.join('\n\n')
}
