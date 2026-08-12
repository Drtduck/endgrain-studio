import type { HostRole } from '@/lib/routing/host'

/**
 * Решение «пускать или гнать на логин» вынесено сюда чистой функцией: proxy.ts
 * умеет только собрать вход из NextRequest и превратить ответ в NextResponse.
 * Так правило доступа тестируется без моков NextRequest и Supabase.
 */

/** Куда уводим анонима. Ровно один адрес, чтобы не разъезжался по коду. */
export const LOGIN_PATH = '/login'

/**
 * Открытые адреса студии. Всё, что не в этом списке, требует аккаунта.
 * Префикс закрывает и вложенные пути (/auth/callback, /api/stripe/webhook).
 */
const PUBLIC_PREFIXES: readonly string[] = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/auth',
  '/pricing',
  '/landing',
  '/api',
  '/_next',
  '/brand',
]

/** Файлы-метаданные в корне: их отдаёт Next, логин к ним неприменим. */
const PUBLIC_FILES: readonly string[] = [
  '/robots.txt',
  '/sitemap.xml',
  '/favicon.ico',
  '/icon.svg',
  '/apple-icon.png',
  '/manifest.webmanifest',
]

/** Имена метаданных-картинок, которые Next раздаёт как маршруты без расширения. */
const PUBLIC_SEGMENTS: readonly string[] = ['icon', 'apple-icon', 'opengraph-image', 'twitter-image']

/** Путь ведёт к чему-то, что обязано открываться без аккаунта. */
export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_FILES.includes(pathname)) return true
  // Картинки соцсетей и иконки Next кладёт хвостом любого сегмента.
  const last = pathname.split('/').pop() ?? ''
  if (PUBLIC_SEGMENTS.some((name) => last === name || last.startsWith(`${name}-`))) return true
  // Статика с расширением (шрифты, картинки из public) логина не требует.
  if (/\.[a-z0-9]+$/i.test(last)) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * Санитайзер параметра next. Пропускаем только собственный относительный путь:
 * «//evil.com» браузер читает как протокол-относительный абсолютный адрес,
 * «/\evil.com» так же трактуют некоторые парсеры URL, а «https://evil.com»
 * абсолютен буквально. Всё это открытый редирект, поэтому валим в fallback.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string = '/'): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback
  if (!raw.startsWith('/')) return fallback
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  // Управляющие символы и перевод строки в Location это инъекция заголовка.
  if (/[\u0000-\u001f\u007f]/.test(raw)) return fallback
  return raw
}

/** Собирает адрес логина с сохранением того, куда человек шёл. */
export function loginRedirectPath(pathname: string, search: string): string {
  const target = `${pathname}${search}`
  const next = safeNextPath(target)
  if (next === '/') return LOGIN_PATH
  return `${LOGIN_PATH}?next=${encodeURIComponent(next)}`
}

export interface AccessInput {
  /** Роль хоста: лендинг, студия или неизвестный (localhost, превью). */
  readonly role: HostRole
  readonly pathname: string
  /** request.nextUrl.search, вместе с ведущим «?» или пустая строка. */
  readonly search: string
  /** Результат supabase.auth.getUser(): есть ли живая сессия. */
  readonly authenticated: boolean
  /** Аварийный флаг PUBLIC_STUDIO=1: студия временно открыта всем. */
  readonly publicStudio: boolean
  /** Без ключей Supabase логин физически невозможен, гейт бессмыслен. */
  readonly supabaseConfigured: boolean
}

export type AccessDecision = { readonly kind: 'allow' } | { readonly kind: 'redirect'; readonly to: string }

const ALLOW: AccessDecision = { kind: 'allow' }

/**
 * Единственное правило доступа в студию. Лендинг (role === 'site') сюда не
 * доходит: его proxy разводит раньше и он публичен целиком.
 */
export function decideAccess(input: AccessInput): AccessDecision {
  if (input.role === 'site') return ALLOW
  if (input.publicStudio) return ALLOW
  if (!input.supabaseConfigured) return ALLOW
  if (input.authenticated) return ALLOW
  if (isPublicPath(input.pathname)) return ALLOW
  return { kind: 'redirect', to: loginRedirectPath(input.pathname, input.search) }
}
