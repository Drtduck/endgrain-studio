import type { ImageTier } from '@/lib/ai/providers/types'

/**
 * Тир провайдера для одного кадра. Чистая функция без импортов Supabase/сети:
 * тестируется напрямую.
 *
 * До фикса (P0-блокер приёмки 15.08.2026) тир выбирался только по тому, чем
 * оплачена генерация (grant.tier === 'trial' ? 'cheap' : 'good'), и правка
 * кадра (source='edit') на пробном тире уходила в fal flux/schnell -
 * text-to-image модель, которая референс сознательно не принимает (см.
 * lib/ai/providers/fal.ts). Промт без картинки заставлял модель рисовать
 * произвольный товар вместо правки существующего кадра - деньги/пробная
 * попытка списывались за мусор.
 *
 * Правка кадра по смыслу невозможна без модели, умеющей референс, поэтому для
 * source='edit' тир всегда 'good' (fal nano-banana-2/edit или gemini,
 * оба принимают referencePngBase64) - независимо от того, чем оплачивается
 * генерация. Себестоимость good-тира для create и для edit одна и та же.
 */
export function resolveShotTier(
  // string, а не узкий union: series.source в БД читается как обычный string
  // (lib/promo/db.ts, SeriesRow.source) - только 'edit' здесь особый случай,
  // остальные значения (в том числе будущие) равнозначно попадают в else-ветку.
  source: string,
  grantTier: 'pro' | 'trial' | 'credits' | null,
): ImageTier {
  if (source === 'edit') return 'good'
  return grantTier === 'trial' ? 'cheap' : 'good'
}
