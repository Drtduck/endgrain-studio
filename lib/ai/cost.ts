import 'server-only'

/**
 * Себестоимость одного кадра у провайдера в центах. Число живёт в env, чтобы
 * смена модели или тарифа fal не требовала деплоя. Дефолт 8 центов - текущая
 * цена, от которой посчитаны пакеты (наценка x2.5).
 *
 * Не NEXT_PUBLIC_: себестоимость не показывается покупателю никогда.
 */
export const AI_FRAME_COST_CENTS: number = Number(process.env['AI_FRAME_COST_CENTS'] ?? 8)

/** Себестоимость обращения: цена кадра умножить на списанные единицы квоты. */
export function providerCostCents(units: number): number {
  return Math.max(0, Math.round(units * AI_FRAME_COST_CENTS))
}
