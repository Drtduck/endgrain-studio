/**
 * Чистая арифметика квоты AI: ни одного импорта, ни одного похода в сеть.
 * Отдельный файл от entitlements.ts сознательно: типы отсюда читают клиентские
 * компоненты (ProProvider, вкладка «Промо»), а entitlements тянет service-ключ
 * Supabase, и графа импортов из клиента до модуля с секретами быть не должно.
 */

/** Сколько AI-генераций в календарный месяц получает Pro-аккаунт. */
export const AI_MONTHLY_LIMIT = 30

/** Сколько пробных генераций даём одному субъекту (аккаунту или гостю). Живёт вечно, не сбрасывается. */
export const FREE_TRIAL_LIMIT = 3
/** Лимит по адресу втрое выше персонального: за одним NAT сидит целый офис. */
export const FREE_TRIAL_IP_LIMIT = 10
/** Сколько кадров можно взять за одно нажатие в пробном тире: серия по умолчанию режется до одного. */
export const FREE_TRIAL_MAX_UNITS = 1

/**
 * Что именно просят. Мокапы мерча рисует Printful, а не языковая модель:
 * генерация там бесплатная, поэтому квоту они не тратят, но Pro всё равно нужен.
 */
export type AiFeature = 'promoShots' | 'merchMockups' | 'referenceAnalysis' | 'referenceShots' | 'saleListing'

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
  // Карточка Amazon/Etsy это одно текстовое обращение к vision-модели без картинок на входе.
  saleListing: 1,
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
 * Фичи, доступные в пробном тире без подписки. Разбор референса и мокапы
 * мерча остаются Pro-фичами: у vision-разбора подменять нечем, а kontext-модели
 * с картинкой на входе стоят на порядок дороже flux/schnell.
 */
export const AI_TRIAL_FEATURES: readonly AiFeature[] = ['promoShots', 'referenceShots', 'saleListing']

/**
 * Что можно купить кадрами без подписки. Совпадает с пробным тиром сознательно:
 * разбор референса и мокапы мерча остаются Pro-фичами.
 */
export const AI_CREDIT_FEATURES: readonly AiFeature[] = ['promoShots', 'referenceShots', 'saleListing']

/**
 * Почему отказали. anonymous - не вошёл (и гостевой тир недоступен), notPro -
 * вошёл без подписки и без пробных фич, quota - месячный лимит Pro выбран,
 * trialSpent - пробные генерации исчерпаны хотя бы по одному субъекту,
 * unavailable - гейт не построить (не настроен Supabase, service-ключ или RPC упал).
 */
export type AiDenyReason = 'anonymous' | 'notPro' | 'quota' | 'trialSpent' | 'unavailable' | 'noCredits'

/**
 * Состояние доступа для интерфейса. mock значит, что нет ни одного провайдера
 * (ни Gemini, ни fal): вкладка рисует собственные заглушки, наружу никто не
 * ходит, платить не за что, поэтому на этом состоянии гейта нет. trial и
 * trialSpent появляются только когда настроен бесплатный тир. credits значит:
 * не Pro, пробное кончилось, но на балансе есть купленные кадры - генерация
 * не заперта.
 */
export type AiAccessState = 'mock' | 'unavailable' | 'anonymous' | 'free' | 'trial' | 'trialSpent' | 'pro' | 'credits'

export interface AiAccess {
  readonly state: AiAccessState
  /** Месячный лимит (30 для Pro, 3 для trial). */
  readonly limit: number
  readonly used: number
  /** Остаток бесплатной квоты периода. */
  readonly freeRemaining: number
  /** Купленные кадры на балансе. */
  readonly credits: number
  /** Единый счётчик для интерфейса: freeRemaining + credits. */
  readonly remaining: number
  /** Какой моделью будет нарисован следующий кадр: null пока это не определено (mock/unavailable/anonymous/free). */
  readonly tier: 'pro' | 'trial' | 'credits' | null
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

function tierOf(state: AiAccessState): 'pro' | 'trial' | 'credits' | null {
  if (state === 'pro') return 'pro'
  if (state === 'trial' || state === 'trialSpent') return 'trial'
  if (state === 'credits') return 'credits'
  return null
}

/**
 * credits - купленные кадры на балансе, независимо от тира. Единый счётчик
 * remaining = freeRemaining + credits: components/promo/AiGate.tsx уже принимает
 * решение по remaining <= 0, и это продолжает работать без правок в ветвлении там.
 */
export function aiAccess(state: AiAccessState, used = 0, limit: number = AI_MONTHLY_LIMIT, credits = 0): AiAccess {
  const freeRemaining = aiRemaining(used, limit)
  const safeCredits = Math.max(0, credits)
  return {
    state,
    limit,
    used: Math.max(0, used),
    freeRemaining,
    credits: safeCredits,
    remaining: freeRemaining + safeCredits,
    tier: tierOf(state),
  }
}
