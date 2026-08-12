// Лёгкий клиентский трекер последних действий пользователя для кнопки
// «Предложить доработку». Кольцевой буфер живёт в sessionStorage: переживает
// перезагрузку страницы внутри вкладки, но не утекает между вкладками и
// сессиями. Ввод с клавиатуры не пишем принципиально (только клики, переходы и
// сабмиты), чтобы вместе с фидбеком не уехал текст, который автор не выбирал.

import { FEEDBACK_ACTION_LABEL_MAX, FEEDBACK_MAX_ACTIONS, type FeedbackAction, type FeedbackActionKind } from '@/lib/feedback'

const STORAGE_KEY = 'eg-feedback-actions-v1'

/** Обрезает метку действия до max символов, схлопывая пробелы. */
export function truncateActionLabel(raw: string, max: number = FEEDBACK_ACTION_LABEL_MAX): string {
  const clean = raw.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, Math.max(0, max - 3)) + '...'
}

/**
 * Чистая операция кольцевого буфера: добавляет действие в конец и отбрасывает
 * самые старые сверх max. Подряд идущие одинаковые переходы схлопываются:
 * эффект роутера умеет срабатывать повторно на том же пути.
 */
export function pushAction(
  buffer: readonly FeedbackAction[],
  action: FeedbackAction,
  max: number = FEEDBACK_MAX_ACTIONS,
): FeedbackAction[] {
  const last = buffer[buffer.length - 1]
  if (last && last.kind === 'route' && action.kind === 'route' && last.label === action.label) {
    return [...buffer]
  }
  const next = [...buffer, action]
  return next.length > max ? next.slice(next.length - max) : next
}

function isAction(value: unknown): value is FeedbackAction {
  if (typeof value !== 'object' || value === null) return false
  const a = value as Record<string, unknown>
  return typeof a['t'] === 'string' && typeof a['kind'] === 'string' && typeof a['label'] === 'string'
}

function loadBuffer(): FeedbackAction[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isAction)
  } catch {
    return []
  }
}

function saveBuffer(buffer: readonly FeedbackAction[]): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(buffer))
  } catch {
    // sessionStorage переполнен или запрещён политикой браузера. Трекер
    // best-effort: молча теряем запись, фидбек это не ломает.
  }
}

/** Записать действие пользователя. */
export function recordAction(kind: FeedbackActionKind, label: string): void {
  saveBuffer(
    pushAction(loadBuffer(), {
      t: new Date().toISOString(),
      kind,
      label: truncateActionLabel(label),
    }),
  )
}

/** Последние действия (старые -> новые), максимум limit. */
export function getRecentActions(limit: number = FEEDBACK_MAX_ACTIONS): FeedbackAction[] {
  const buffer = loadBuffer()
  return buffer.length > limit ? buffer.slice(buffer.length - limit) : buffer
}

/** Забыть накопленный лог (после успешной отправки фидбека). */
export function clearActions(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // см. saveBuffer
  }
}

/**
 * Метка для кликнутого элемента или null, если кликнули мимо интерактива.
 * Клики по самому окну фидбека не пишем: иначе последними действиями в каждой
 * заявке будет «открыл фидбек».
 */
export function describeClickable(el: Element): string | null {
  const target = el.closest('button, a, [role="button"], [role="menuitem"], [role="tab"], summary')
  if (target === null) return null
  if (target.closest('[data-feedback-ui]') !== null) return null
  const aria = target.getAttribute('aria-label')
  const text = (aria ?? target.textContent ?? '').trim()
  const tag = target.tagName.toLowerCase()
  const href = tag === 'a' ? target.getAttribute('href') : null
  if (text.length > 0) return href !== null ? `${text} (${href})` : text
  if (href !== null) return `ссылка ${href}`
  return `${tag} без текста`
}

/** Метка для отправленной формы. */
export function describeForm(form: HTMLFormElement): string {
  const name = form.getAttribute('aria-label') ?? form.getAttribute('name') ?? form.id
  return name.length > 0 ? `форма «${name}»` : 'форма без имени'
}
