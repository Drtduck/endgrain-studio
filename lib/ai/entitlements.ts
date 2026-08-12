// Импорт роняет сборку, если модуль случайно затянут в клиентский бандл:
// отсюда видно и service-ключ Supabase, и ключ Gemini.
import 'server-only'
import { isGeminiConfigured } from '@/lib/promo/config'
import { getProStatus } from '@/lib/stripe/pro'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseService, isSupabaseServiceConfigured } from '@/lib/supabase/service'
import { getCurrentUser } from '@/lib/supabase/session'
import {
  AI_MONTHLY_LIMIT,
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
 * Проверить остаток, сходить в Gemini и списать после успеха было бы честнее по
 * букве «не списывать за упавший запрос», но открывало бы окно в десятки секунд,
 * за которое десяток параллельных запросов увидели бы один и тот же остаток.
 * Поэтому: сначала резерв (гонки нет), потом вызов, и если наружу не вышло ни
 * одного кадра, резерв возвращается через releaseAiQuota. Человек платит только
 * за то, что получил, а обойти лимит параллелью нельзя.
 */

export interface AiGrant {
  readonly ok: true
  readonly userId: string
  readonly period: string
  /** Сколько списано. Ноль значит, что фича бесплатная, а Pro всё равно нужен. */
  readonly cost: number
  readonly used: number
  readonly remaining: number
}

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
 * Демо-режим: ключа Gemini нет вовсе. Вкладка «Промо» тогда целиком работает на
 * локальных заглушках, ни один запрос наружу не уходит и платить не за что,
 * поэтому гейт на этом состоянии выключен и у мокапов мерча тоже: закрывать
 * замком демонстрацию, которая никому ничего не стоит, смысла нет.
 */
export function isAiDemoMode(): boolean {
  return !isGeminiConfigured()
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

/**
 * Проверка прав и резерв квоты одним вызовом. Возвращает структуру, а не бросает:
 * серверное действие обязано отдать клиенту код причины, а не пятисотку.
 *
 * units это сколько единиц фичи просят за раз: серия из восьми кадров резервирует
 * восемь, а не одну. Резерв целиком, а не по кадру, сознательно: половина
 * оплаченной серии при выбранной квоте хуже честного отказа до начала работы.
 */
export async function assertAiAllowed(feature: AiFeature, units = 1): Promise<AiVerdict> {
  // Без аккаунтов гейт не построить вовсе, а пускать всех подряд в платную
  // модель нельзя: это ровно тот дефект, из-за которого правка и затевалась.
  if (!isSupabaseConfigured()) return deny('unavailable')

  const user = await getCurrentUser()
  if (!user) return deny('anonymous')

  const { pro } = await getProStatus()
  if (!pro) return deny('notPro')

  const period = aiPeriod(Date.now())
  // units это число кадров в серии: платит человек за каждый, а не за нажатие кнопки.
  const cost = aiCost(feature, units)

  // Бесплатная фича: Pro нужен, счётчик не трогаем и в базу за ним не идём.
  if (cost === 0) return { ok: true, userId: user.id, period, cost: 0, used: 0, remaining: AI_MONTHLY_LIMIT }

  // Считать квоту нечем: без service-ключа функция списания недоступна, а
  // пускать без счётчика значит остаться без потолка расходов.
  if (!isSupabaseServiceConfigured()) return deny('unavailable')

  const used = await consume(user.id, period, cost)
  if (used === 'exceeded') return deny('quota')
  if (used === 'error') return deny('unavailable')

  return { ok: true, userId: user.id, period, cost, used, remaining: aiRemaining(used) }
}

/** Возврат резерва: зовётся, только когда наружу не вышло ничего полезного. */
export async function releaseAiQuota(grant: AiGrant): Promise<void> {
  if (grant.cost <= 0) return
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
}

/**
 * Состояние доступа для интерфейса: считается в серверном layout и уезжает
 * пропсом, как статус Pro. Ничего не резервирует и ничего не пишет.
 */
export async function getAiAccess(): Promise<AiAccess> {
  if (isAiDemoMode()) return aiAccess('mock')
  if (!isSupabaseConfigured() || !isSupabaseServiceConfigured()) return aiAccess('unavailable')

  try {
    const user = await getCurrentUser()
    if (!user) return aiAccess('anonymous')
    const { pro } = await getProStatus()
    if (!pro) return aiAccess('free')
    return aiAccess('pro', await readUsed(user.id, aiPeriod(Date.now())))
  } catch (err) {
    // Лежащая база не должна ронять рендер студии, ровно как в getProStatus.
    console.error('getAiAccess failed', err)
    return aiAccess('unavailable')
  }
}
