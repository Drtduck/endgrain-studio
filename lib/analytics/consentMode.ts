import { OPT_IN_COUNTRIES } from '@/lib/consent/regions'

/**
 * Payload-ы для gtag('consent', ...). Чистые сборщики без DOM: компонент Analytics.tsx
 * их только сериализует через JSON.stringify в инлайновый скрипт, вся логика тестируется
 * юнитами.
 * Рекламные три параметра остаются denied всегда и везде: рекламы у продукта нет.
 */
export interface ConsentPayload {
  readonly ad_storage: 'granted' | 'denied'
  readonly analytics_storage: 'granted' | 'denied'
  readonly ad_user_data: 'granted' | 'denied'
  readonly ad_personalization: 'granted' | 'denied'
  readonly region?: readonly string[]
  readonly wait_for_update?: number
}

/**
 * Два вызова default, а не один. Региональный - с region: OPT_IN_COUNTRIES и всеми
 * четырьмя denied. Глобальный fallback - analytics_storage granted, рекламные denied.
 * Google применяет более специфичное правило, поэтому европеец и россиянин получают
 * denied независимо от того, доехал ли до нас x-egs-country: два независимых
 * механизма страхуют друг друга.
 */
export function defaultPayloads(): readonly [regional: ConsentPayload, global: ConsentPayload] {
  const regional: ConsentPayload = {
    ad_storage: 'denied',
    analytics_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    region: OPT_IN_COUNTRIES,
  }
  const global: ConsentPayload = {
    ad_storage: 'denied',
    analytics_storage: 'granted',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  }
  return [regional, global]
}

/** update-payload по выбору человека. Рекламные параметры не трогает никогда. */
export function updatePayload(analytics: boolean): ConsentPayload {
  return {
    ad_storage: 'denied',
    analytics_storage: analytics ? 'granted' : 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  }
}
