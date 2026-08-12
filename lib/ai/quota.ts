/**
 * Чистая арифметика квоты AI: ни одного импорта, ни одного похода в сеть.
 * Отдельный файл от entitlements.ts сознательно: типы отсюда читают клиентские
 * компоненты (ProProvider, вкладка «Промо»), а entitlements тянет service-ключ
 * Supabase, и графа импортов из клиента до модуля с секретами быть не должно.
 */

/** Сколько AI-генераций в календарный месяц получает Pro-аккаунт. */
export const AI_MONTHLY_LIMIT = 30

/**
 * Что именно просят. Мокапы мерча рисует Printful, а не языковая модель:
 * генерация там бесплатная, поэтому квоту они не тратят, но Pro всё равно нужен.
 */
export type AiFeature = 'promoShots' | 'merchMockups' | 'referenceAnalysis' | 'referenceShots'

/**
 * Цена ОДНОЙ единицы обращения в квоте. Ноль значит «Pro нужен, а счётчик не трогаем».
 *
 * Кадр по референсу дороже обычного вдвое сознательно: за ним стоит не только
 * рисование картинки, но и vision-разбор чужого фото, а сама фича заметно
 * привлекательнее, и без разницы в цене серия из четырёх кадров по референсу
 * съедала бы месячную квоту так же дёшево, как четыре пресета.
 */
export const AI_FEATURE_COST: Record<AiFeature, number> = {
  promoShots: 1,
  merchMockups: 0,
  referenceAnalysis: 1,
  referenceShots: 2,
}

/**
 * Сколько списать за обращение из units единиц (кадров). Отдельная чистая
 * функция, потому что цифру показывает интерфейс до нажатия кнопки, а считать
 * её в двух местах по-разному значит однажды соврать про цену.
 */
export function aiCost(feature: AiFeature, units = 1): number {
  return AI_FEATURE_COST[feature] * Math.max(0, Math.trunc(units))
}

/**
 * Почему отказали. anonymous - не вошёл, notPro - вошёл без подписки,
 * quota - месячный лимит выбран, unavailable - гейт не построить
 * (не настроен Supabase или service-ключ), и тогда пускать нельзя тем более.
 */
export type AiDenyReason = 'anonymous' | 'notPro' | 'quota' | 'unavailable'

/**
 * Состояние доступа для интерфейса. mock значит, что ключа Gemini нет вовсе:
 * вкладка рисует собственные заглушки, наружу никто не ходит, платить не за что,
 * поэтому на этом состоянии гейта нет.
 */
export type AiAccessState = 'mock' | 'unavailable' | 'anonymous' | 'free' | 'pro'

export interface AiAccess {
  readonly state: AiAccessState
  readonly limit: number
  readonly used: number
  readonly remaining: number
}

/**
 * Ключ периода: календарный месяц в UTC, формат YYYY-MM. Именно UTC, а не
 * локальная зона сервера: на Vercel зона инстанса не гарантирована, и один и тот
 * же пользователь не должен на границе месяца видеть то старый счёт, то новый.
 */
export function aiPeriod(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 7)
}

/** Остаток никогда не отрицательный: испорченная строка в базе не должна рисовать «-3». */
export function aiRemaining(used: number, limit: number = AI_MONTHLY_LIMIT): number {
  return Math.max(0, limit - Math.max(0, used))
}

export function aiAccess(state: AiAccessState, used = 0, limit: number = AI_MONTHLY_LIMIT): AiAccess {
  return { state, limit, used: Math.max(0, used), remaining: aiRemaining(used, limit) }
}
