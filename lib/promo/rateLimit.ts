/**
 * Счётчик обращений к платной генерации. Действие публичное и без авторизации,
 * поэтому без потолка один скрипт способен сжечь чужой бюджет Gemini за вечер.
 *
 * Сознательно in-memory: на Vercel у каждого инстанса своя память, и при нескольких
 * инстансах общий дневной потолок размазывается по ним. Это принято как компромисс:
 * порядок величины он держит, а точный распределённый лимит требует Redis и отдельного
 * решения владельца. Ключи чистятся лениво, при обращении, чтобы карта не росла вечно.
 */
export const HOUR_MS = 3_600_000
export const DAY_MS = 86_400_000

/** Сколько серий в час отдаём одному адресу. Серия это четыре платных кадра. */
export const PER_IP_PER_HOUR = 5
/** Тот же адрес, но аккаунты в проекте есть, а человек не вошёл: доверия меньше. */
export const PER_IP_PER_HOUR_ANON = 2
/** Общий потолок на инстанс в сутки: страховка от распределённого перебора адресов. */
export const GLOBAL_PER_DAY = 200

/** ok - можно; ip - упёрлись в личный лимит; daily - выбран общий дневной потолок. */
export type RateLimitVerdict = 'ok' | 'ip' | 'daily'

export interface RateLimiter {
  /** Списывает одну попытку. Личный лимит проверяется первым и не тратит общий счёт. */
  take(key: string, limit: number, now: number): RateLimitVerdict
}

interface Bucket {
  count: number
  resetAt: number
}

function hit(bucket: Bucket | undefined, limit: number, now: number, windowMs: number): Bucket | null {
  if (bucket === undefined || now >= bucket.resetAt) return { count: 1, resetAt: now + windowMs }
  if (bucket.count >= limit) return null
  return { count: bucket.count + 1, resetAt: bucket.resetAt }
}

export function createRateLimiter(globalPerDay: number = GLOBAL_PER_DAY): RateLimiter {
  const byKey = new Map<string, Bucket>()
  let global: Bucket | undefined

  return {
    take(key, limit, now) {
      // Протухшие ключи выметаем на входе: карта живёт ровно столько, сколько активные адреса.
      for (const [k, bucket] of byKey) if (now >= bucket.resetAt) byKey.delete(k)

      const next = hit(byKey.get(key), limit, now, HOUR_MS)
      if (next === null) return 'ip'

      const nextGlobal = hit(global, globalPerDay, now, DAY_MS)
      if (nextGlobal === null) return 'daily'

      byKey.set(key, next)
      global = nextGlobal
      return 'ok'
    },
  }
}

/**
 * Адрес клиента из заголовков прокси. За Vercel в x-forwarded-for лежит цепочка,
 * первый элемент это исходный клиент. Заголовки подделываются, поэтому лимит по ним
 * это защита от случайного перебора и кривого скрипта, а не от целенаправленной атаки.
 */
export function clientIp(forwardedFor: string | null, realIp: string | null): string {
  const first = (forwardedFor ?? '').split(',')[0]?.trim() ?? ''
  if (first.length > 0) return first
  const real = (realIp ?? '').trim()
  return real.length > 0 ? real : 'unknown'
}

/** Единственный экземпляр на процесс: счётчик обязан переживать вызовы действия. */
export const promoLimiter: RateLimiter = createRateLimiter()
