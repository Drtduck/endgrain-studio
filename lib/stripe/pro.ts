import { cache } from 'react'
import { flags } from '@/lib/flags'
import { isSupabaseConfigured } from '@/lib/supabase/config'
import { getSupabaseServer } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/supabase/session'
import { isAllowlistedEmail, isProUnlockedForAll } from './allowlist'
import type { PlanId, Product } from './plans'

/**
 * flag - поднят аварийный рубильник, allowlist - адрес в конкурсном списке,
 * subscription - живая подписка Stripe, free - всё остальное.
 * Причины 'no-stripe' больше нет: раньше ненастроенная касса выдавала Pro всем,
 * то есть один незаведённый ключ на проде открывал платные AI-фичи анонимам.
 * Отсутствие кассы теперь значит ровно одно: витрину цен не показываем
 * (за это отвечает отдельный флаг billingEnabled), а прав это никому не даёт.
 * 'pass' - разовый Пропуск (mode=payment, $19, все возможности Pro на 90 дней):
 * снят с продажи 08.2026, но у купивших действует до конца оплаченного срока,
 * только пока нет живой подписки (см. resolveProStatus).
 */
export type ProReason = 'flag' | 'allowlist' | 'subscription' | 'pass' | 'free'

export interface ProStatus {
  readonly pro: boolean
  readonly reason: ProReason
  readonly plan: PlanId | null
  /** ISO-строка конца оплаченного периода или null. */
  readonly currentPeriodEnd: string | null
  readonly cancelAtPeriodEnd: boolean
}

export interface SubscriptionRecord {
  readonly status: string
  readonly plan: string
  readonly currentPeriodEnd: string | null
  readonly cancelAtPeriodEnd: boolean
}

/** Три дня после конца периода Pro ещё работает: неудачный платёж не должен мгновенно рубить доступ. */
export const GRACE_MS = 3 * 24 * 60 * 60 * 1000

/** Статусы, при которых доступ считается оплаченным. */
const LIVE_STATUSES: readonly string[] = ['active', 'trialing', 'past_due']

const FREE: ProStatus = { pro: false, reason: 'free', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }
const UNLOCKED: ProStatus = { pro: true, reason: 'flag', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }
const ALLOWLISTED: ProStatus = {
  pro: true,
  reason: 'allowlist',
  plan: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
}

function planOf(value: string): PlanId | null {
  return value === 'monthly' || value === 'yearly' ? value : null
}

/**
 * Чистое ядро: никаких походов в сеть, поэтому покрыто unit-тестом без единого мока.
 * past_due считается Pro сознательно: карта не прошла, Stripe будет пробовать ещё
 * несколько дней, и отобрать доступ именно в этот момент значит поругаться с платящим.
 *
 * pass - живой ли разовый Пропуск (см. таблицу pro_passes). Подписка всегда
 * старше пропуска: если у человека есть и то и другое (купил пропуск, потом
 * оформил подписку), причина - 'subscription'. Пропуск смотрят, только когда
 * подписки нет или она не живая.
 */
export function resolveProStatus(
  row: SubscriptionRecord | null,
  nowMs: number,
  pass: { readonly expiresAt: string } | null = null,
): ProStatus {
  if (row !== null) {
    const plan = planOf(row.plan)
    const alive =
      LIVE_STATUSES.includes(row.status) &&
      (row.currentPeriodEnd === null || Date.parse(row.currentPeriodEnd) + GRACE_MS > nowMs)

    if (alive) {
      return {
        pro: true,
        reason: 'subscription',
        plan,
        currentPeriodEnd: row.currentPeriodEnd,
        cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      }
    }

    if (pass !== null && Date.parse(pass.expiresAt) > nowMs) return passStatus(pass)

    return {
      pro: false,
      reason: 'free',
      // План и дату сохраняем и для истёкшей подписки: страница тарифов
      // покажет «оплачено до такого-то числа», а не пустоту.
      plan,
      currentPeriodEnd: row.currentPeriodEnd,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    }
  }

  if (pass !== null && Date.parse(pass.expiresAt) > nowMs) return passStatus(pass)

  return FREE
}

function passStatus(pass: { readonly expiresAt: string }): ProStatus {
  return {
    pro: true,
    reason: 'pass',
    plan: null,
    currentPeriodEnd: pass.expiresAt,
    // Пропуск не продлевается сам: карта не запоминается, автопродления нет.
    cancelAtPeriodEnd: true,
  }
}

/**
 * Читает строку подписки текущего пользователя по продукту, минуя и аварийный
 * флаг, и гвард кассы. Нужна createCheckoutAction, где вопрос стоит не «открыт
 * ли Pro», а «есть ли уже живая подписка данного продукта в Stripe». С флагом
 * NEXT_PUBLIC_PRO_UNLOCK=1 getProStatus() отдаёт reason 'flag', и подписчик
 * увидел бы кнопки покупки, а Stripe завёл бы вторую подписку и списал дважды.
 * Пропуск считается только для product='pro': он не даёт доступа к API.
 */
export const getSubscriptionStatus: (product?: Product) => Promise<ProStatus> = cache(
  async (product: Product = 'pro'): Promise<ProStatus> => {
    if (!isSupabaseConfigured()) return FREE
    try {
      const user = await getCurrentUser()
      if (!user) return FREE
      const row = await readSubscriptionRow(user.id, product)
      const pass = product === 'pro' ? await readPassRow(user.id) : null
      return resolveProStatus(row, Date.now(), pass)
    } catch (err) {
      console.error('getSubscriptionStatus failed', err)
      return FREE
    }
  },
)

async function readSubscriptionRow(userId: string, product: Product): Promise<SubscriptionRecord | null> {
  const sb = await getSupabaseServer()
  const { data, error } = await sb
    .from('subscriptions')
    .select('status, plan, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .eq('product', product)
    .maybeSingle()
  if (error || !data) return null
  return {
    status: String(data.status),
    plan: String(data.plan),
    currentPeriodEnd: data.current_period_end === null ? null : String(data.current_period_end),
    cancelAtPeriodEnd: data.cancel_at_period_end === true,
  }
}

/** Живой ли разовый Пропуск пользователя. Таблица pro_passes, миграция 20260814XXXXXX_pro_passes.sql. */
async function readPassRow(userId: string): Promise<{ readonly expiresAt: string } | null> {
  const sb = await getSupabaseServer()
  const { data, error } = await sb
    .from('pro_passes')
    .select('expires_at')
    .eq('user_id', userId)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return { expiresAt: String(data.expires_at) }
}

/**
 * Вариант getProStatus от userId, а не от cookie-сессии: нужен сервисному
 * слою API (lib/api/service.ts), где пользователь известен из проверенного
 * ключа, а не из браузерной сессии. Без memoизации: React cache() дедуплицирует
 * в рамках одного рендера/запроса, а этот путь дёргается из route handler'ов
 * и MCP-инструментов, где такого контекста может не быть. Allowlist по email
 * сюда сознательно не перенесён - у сервисного слоя email вызывающего нет,
 * а конкурсный обход это ручной адрес жюри в браузере, не агентский доступ.
 */
export async function proStatusForUser(userId: string): Promise<ProStatus> {
  if (flags.pro || isProUnlockedForAll()) return UNLOCKED
  if (!isSupabaseConfigured()) return FREE
  try {
    const [row, pass] = await Promise.all([readSubscriptionRow(userId, 'pro'), readPassRow(userId)])
    return resolveProStatus(row, Date.now(), pass)
  } catch (err) {
    console.error('proStatusForUser failed', err)
    return FREE
  }
}

/** Мемоизация на один серверный рендер, как getCurrentUser в lib/supabase/session.ts. */
export const getProStatus: () => Promise<ProStatus> = cache(async (): Promise<ProStatus> => {
  // Аварийный рубильник выигрывает у всего, в том числе у настроенного Stripe:
  // ключи заведены, а вебхук не доехал во время демонстрации это реальный сценарий.
  // NEXT_PUBLIC_PRO_UNLOCK инлайнится и в клиентский бандл, PRO_UNLOCK_ALL живёт
  // только на сервере: для серверного гейта опираться надо на второй.
  if (flags.pro || isProUnlockedForAll()) return UNLOCKED
  if (!isSupabaseConfigured()) return FREE

  try {
    const user = await getCurrentUser()
    if (!user) return FREE
    // Конкурсный обход: жюри и автор получают Pro без карты, но по адресу из
    // серверного списка, а не по факту незаведённых ключей Stripe.
    if (isAllowlistedEmail(user.email)) return ALLOWLISTED
    return proStatusForUser(user.id)
  } catch (err) {
    // Лежащая база не должна ронять рендер студии, ровно как в getCurrentUser.
    console.error('getProStatus failed', err)
    return FREE
  }
})
