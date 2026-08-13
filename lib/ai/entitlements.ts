// Импорт роняет сборку, если модуль случайно затянут в клиентский бандл:
// отсюда видно и service-ключ Supabase, и ключи Gemini/fal.
import 'server-only'
import { cookies, headers } from 'next/headers'
import { FREE_TRIAL_SECRET, isFalConfigured, isFreeTrialConfigured, isGeminiConfigured } from '@/lib/promo/config'
import { clientIp } from '@/lib/promo/rateLimit'
import { isSecureCookieHost } from '@/lib/routing/cookieDomain'
import { getProStatus } from '@/lib/stripe/pro'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/supabase/session'
import {
  FREE_TRIAL_COOKIE_MAX_AGE_SEC,
  FREE_TRIAL_COOKIE_NAME,
  createGuestId,
  freeSubjects,
  signGuestCookie,
  verifyGuestCookie,
  type FreeSubject,
} from './freeSubjects'
import {
  AI_MONTHLY_LIMIT,
  AI_TRIAL_FEATURES,
  FREE_TRIAL_LIMIT,
  FREE_TRIAL_MAX_UNITS,
  aiAccess,
  aiCost,
  aiPeriod,
  aiRemaining,
  type AiAccess,
  type AiDenyReason,
  type AiFeature,
} from './quota'

/**
 * Единственная точка входа для платных AI-фич. Всё, что ходит в модель, обязано
 * пройти здесь, и никакой другой проверки Pro в действиях быть не должно.
 *
 * Порядок операций сознательно такой: квота резервируется ДО обращения к модели,
 * атомарным insert ... on conflict в Postgres, а не читается и потом пишется.
 * Проверить остаток, сходить в провайдера и списать после успеха было бы честнее по
 * букве «не списывать за упавший запрос», но открывало бы окно в десятки секунд,
 * за которое десяток параллельных запросов увидели бы один и тот же остаток.
 * Поэтому: сначала резерв (гонки нет), потом вызов, и если наружу не вышло ни
 * одного кадра, резерв возвращается через releaseAiQuota. Человек платит только
 * за то, что получил, а обойти лимит параллелью нельзя.
 *
 * AiGrant разветвлён по тиру: Pro списывает месячную квоту в ai_usage под своим
 * userId, пробный тир списывает во все субъекты сразу в ai_free_trials.
 * Возвращать userId для гостя было бы нечестно, поэтому это разные ветки, а не
 * общий тип с необязательными полями.
 */
export type AiGrant =
  | { readonly ok: true; readonly tier: 'pro'; readonly userId: string; readonly period: string; readonly cost: number; readonly used: number; readonly remaining: number }
  | { readonly ok: true; readonly tier: 'trial'; readonly subjects: readonly FreeSubject[]; readonly cost: number; readonly remaining: number }

export interface AiDenial {
  readonly ok: false
  readonly reason: AiDenyReason
  readonly remaining: number
}

export type AiVerdict = AiGrant | AiDenial

function deny(reason: AiDenyReason, remaining = 0): AiDenial {
  return { ok: false, reason, remaining }
}

/**
 * Демо-режим: нет ни одного провайдера, который умеет рисовать (ни Gemini, ни
 * fal). Вкладка «Промо» тогда целиком работает на локальных заглушках, ни один
 * запрос наружу не уходит и платить не за что, поэтому гейт на этом состоянии
 * выключен и у мокапов мерча тоже: закрывать замком демонстрацию, которая
 * никому ничего не стоит, смысла нет.
 */
export function isAiDemoMode(): boolean {
  return !isGeminiConfigured() && !isFalConfigured()
}

/** Сколько уже списано в этом месяце. Читается service-ключом, RLS тут ни при чём. */
async function readUsed(userId: string, period: string): Promise<number> {
  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('ai_usage')
    .select('used')
    .eq('user_id', userId)
    .eq('period', period)
    .maybeSingle()
  if (error || !data) return 0
  return Number(data.used ?? 0)
}

/** Сколько уже списано по одному субъекту пробного тира. Отсутствие строки значит ноль. */
async function readTrialUsed(subject: FreeSubject): Promise<number> {
  const sb = getSupabaseService()
  const { data, error } = await sb
    .from('ai_free_trials')
    .select('used')
    .eq('subject_kind', subject.kind)
    .eq('subject', subject.id)
    .maybeSingle()
  if (error || !data) return 0
  return Number(data.used ?? 0)
}

/**
 * Атомарное списание в базе. Логику потолка держит SQL-функция, а не JS: два
 * параллельных запроса обязаны разойтись на блокировке строки.
 *
 * Выбранная квота и упавшая база это разные ответы: сказать человеку «лимит
 * исчерпан», когда на самом деле не ответил Postgres, значит соврать.
 */
async function consume(userId: string, period: string, cost: number): Promise<number | 'exceeded' | 'error'> {
  try {
    const sb = getSupabaseService()
    const { data, error } = await sb.rpc('consume_ai_quota', {
      p_user_id: userId,
      p_period: period,
      p_limit: AI_MONTHLY_LIMIT,
      p_cost: cost,
    })
    if (error) {
      console.error('consume_ai_quota failed', error.message)
      return 'error'
    }
    // null из функции значит, что do update отсеян условием потолка.
    return data === null || data === undefined ? 'exceeded' : Number(data)
  } catch (err) {
    console.error('consume_ai_quota failed', err)
    return 'error'
  }
}

type TrialConsumeOutcome = { readonly ok: true; readonly remaining: number } | { readonly ok: false } | 'error'

/** То же самое, но по нескольким субъектам сразу: всё-или-ничего, логика в consume_free_trial. */
async function consumeTrial(subjects: readonly FreeSubject[], cost: number): Promise<TrialConsumeOutcome> {
  try {
    const sb = getSupabaseService()
    const { data, error } = await sb.rpc('consume_free_trial', {
      p_subjects: subjects.map((s) => ({ kind: s.kind, id: s.id, limit: s.limit })),
      p_cost: cost,
    })
    if (error) {
      console.error('consume_free_trial failed', error.message)
      return 'error'
    }
    const body = data as { ok?: boolean; remaining?: unknown } | null
    if (body === null || typeof body.ok !== 'boolean') return 'error'
    return body.ok ? { ok: true, remaining: Number(body.remaining ?? 0) } : { ok: false }
  } catch (err) {
    console.error('consume_free_trial failed', err)
    return 'error'
  }
}

/** Адрес клиента из заголовков запроса: тот же приём, что в app/actions/promo.ts. */
async function requestIp(): Promise<string> {
  const head = await headers()
  return clientIp(head.get('x-forwarded-for'), head.get('x-real-ip'))
}

/**
 * uuid гостя из подписанной cookie egs_ft, только для анонимного посетителя.
 * Проверенным считается лишь значение с верной HMAC-подписью: голую cookie
 * подделывают новым uuid на каждый запрос, и субъект guest перестаёт
 * что-либо значить.
 */
async function verifiedGuestIdFromCookie(): Promise<string | null> {
  const jar = await cookies()
  return verifyGuestCookie(FREE_TRIAL_SECRET, jar.get(FREE_TRIAL_COOKIE_NAME)?.value ?? null)
}

/**
 * Ставит cookie гостя, если её ещё не было. Вызывается только из server
 * action (assertAiAllowed), где запись cookie разрешена в отличие от layout.
 */
async function ensureGuestCookie(guestId: string): Promise<void> {
  const jar = await cookies()
  const head = await headers()
  const host = head.get('host')
  jar.set(FREE_TRIAL_COOKIE_NAME, signGuestCookie(FREE_TRIAL_SECRET, guestId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: host ? isSecureCookieHost(host) : false,
    path: '/',
    maxAge: FREE_TRIAL_COOKIE_MAX_AGE_SEC,
  })
}

/**
 * Проверка прав и резерв квоты одним вызовом. Возвращает структуру, а не бросает:
 * серверное действие обязано отдать клиенту код причины, а не пятисотку.
 *
 * units это сколько единиц фичи просят за раз: серия из восьми кадров резервирует
 * восемь, а не одну. Резерв целиком, а не по кадру, сознательно: половина
 * оплаченной серии при выбранной квоте хуже честного отказа до начала работы.
 *
 * Порядок веток: Pro всегда идёт своим путём в ai_usage и в таблицу пробных
 * не заглядывает никогда. Всё остальное (аноним и вошедший без подписки)
 * пробует пробный тир, если он настроен и фича в него входит.
 */
export async function assertAiAllowed(feature: AiFeature, units = 1): Promise<AiVerdict> {
  // Без аккаунтов гейт не построить вовсе, а пускать всех подряд в платную
  // модель нельзя: это ровно тот дефект, из-за которого правка и затевалась.
  if (!isSupabaseConfigured()) return deny('unavailable')

  const user = await getCurrentUser()

  if (user !== null) {
    const { pro } = await getProStatus()
    if (pro) {
      const period = aiPeriod(Date.now())
      // units это число кадров в серии: платит человек за каждый, а не за нажатие кнопки.
      const cost = aiCost(feature, units)

      // Бесплатная фича: Pro нужен, счётчик не трогаем и в базу за ним не идём.
      if (cost === 0) return { ok: true, tier: 'pro', userId: user.id, period, cost: 0, used: 0, remaining: AI_MONTHLY_LIMIT }

      // Считать квоту нечем: без service-ключа функция списания недоступна, а
      // пускать без счётчика значит остаться без потолка расходов.
      if (!isSupabaseServiceConfigured()) return deny('unavailable')

      const used = await consume(user.id, period, cost)
      if (used === 'exceeded') return deny('quota')
      if (used === 'error') return deny('unavailable')

      return { ok: true, tier: 'pro', userId: user.id, period, cost, used, remaining: aiRemaining(used) }
    }
  }

  // Не Pro (или аноним). Пробный тир не настроен или фича в него не входит:
  // сегодняшнее поведение, замок с причиной.
  if (!isFreeTrialConfigured() || !AI_TRIAL_FEATURES.includes(feature)) {
    return deny(user === null ? 'anonymous' : 'notPro')
  }

  // Клиент такого не пришлёт, но сервер обязан не верить клиенту: во free-тире
  // серия режется до одного кадра ещё в действии, здесь вторая, серверная граница.
  if (units > FREE_TRIAL_MAX_UNITS) return deny('trialSpent')

  if (!isSupabaseServiceConfigured()) return deny('unavailable')

  const ip = await requestIp()
  const existingGuestId = user === null ? await verifiedGuestIdFromCookie() : null
  const guestId = user === null ? (existingGuestId ?? createGuestId()) : null
  const subjects = freeSubjects({ secret: FREE_TRIAL_SECRET, userId: user?.id ?? null, guestId, ip })

  const cost = Math.max(0, Math.trunc(units))
  const outcome = await consumeTrial(subjects, cost)
  if (outcome === 'error') return deny('unavailable')
  if (!outcome.ok) return deny('trialSpent')

  // Cookie ставится лениво, ровно тут: посетителю лендинга она не нужна, а
  // после первого успешного списания субъект guest обязан быть постоянным.
  if (user === null && guestId !== null && existingGuestId === null) await ensureGuestCookie(guestId)

  return { ok: true, tier: 'trial', subjects, cost, remaining: outcome.remaining }
}

/** Возврат резерва: зовётся, только когда наружу не вышло ничего полезного. */
export async function releaseAiQuota(grant: AiGrant): Promise<void> {
  if (grant.cost <= 0) return
  if (grant.tier === 'pro') {
    try {
      const sb = getSupabaseService()
      const { error } = await sb.rpc('release_ai_quota', {
        p_user_id: grant.userId,
        p_period: grant.period,
        p_cost: grant.cost,
      })
      if (error) console.error('release_ai_quota failed', error.message)
    } catch (err) {
      // Невозвращённый резерв это одна лишняя единица из тридцати, а не сбой ответа.
      console.error('release_ai_quota failed', err)
    }
    return
  }

  try {
    const sb = getSupabaseService()
    const { error } = await sb.rpc('release_free_trial', {
      p_subjects: grant.subjects.map((s) => ({ kind: s.kind, id: s.id, limit: s.limit })),
      p_cost: grant.cost,
    })
    if (error) console.error('release_free_trial failed', error.message)
  } catch (err) {
    console.error('release_free_trial failed', err)
  }
}

/**
 * Остаток пробного тира без списания: минимум по всем субъектам, кроме
 * гостя без cookie. У гостя без cookie субъекта guest ещё нет, а показывать
 * остаток по одному только IP было бы враньём про чужой NAT, поэтому в этом
 * случае честно показываем полный остаток - расхождение возможно ровно один
 * раз и только в большую сторону, для человека, который ещё ничего не потратил.
 */
async function trialAccess(userId: string | null): Promise<AiAccess> {
  if (userId === null) {
    const guestId = await verifiedGuestIdFromCookie()
    if (guestId === null) return aiAccess('trial', 0, FREE_TRIAL_LIMIT)
    const used = await readTrialUsed({ kind: 'guest', id: guestId, limit: FREE_TRIAL_LIMIT })
    return aiAccess(used >= FREE_TRIAL_LIMIT ? 'trialSpent' : 'trial', used, FREE_TRIAL_LIMIT)
  }
  const used = await readTrialUsed({ kind: 'user', id: userId, limit: FREE_TRIAL_LIMIT })
  return aiAccess(used >= FREE_TRIAL_LIMIT ? 'trialSpent' : 'trial', used, FREE_TRIAL_LIMIT)
}

/**
 * Состояние доступа для интерфейса: считается в серверном layout и уезжает
 * пропсом, как статус Pro. Ничего не резервирует и ничего не пишет: cookie
 * гостя из этой функции не ставится, layout не имеет права писать cookie.
 */
export async function getAiAccess(): Promise<AiAccess> {
  if (isAiDemoMode()) return aiAccess('mock')
  if (!isSupabaseConfigured() || !isSupabaseServiceConfigured()) return aiAccess('unavailable')

  try {
    const user = await getCurrentUser()
    if (user !== null) {
      const { pro } = await getProStatus()
      if (pro) return aiAccess('pro', await readUsed(user.id, aiPeriod(Date.now())))
    }

    if (!isFreeTrialConfigured()) return aiAccess(user === null ? 'anonymous' : 'free')

    return await trialAccess(user?.id ?? null)
  } catch (err) {
    // Лежащая база не должна ронять рендер студии, ровно как в getProStatus.
    console.error('getAiAccess failed', err)
    return aiAccess('unavailable')
  }
}
