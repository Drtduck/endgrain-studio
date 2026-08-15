/**
 * Пакеты покупных кадров AI. Чистый файл: ни одного импорта, читается и
 * клиентом (карточки покупки), и сервером (создание Checkout Session,
 * начисление в вебхуке) без риска затянуть секреты в браузерный бандл.
 */

export type AiPackId = 'frames10' | 'frames30' | 'frames100'

export interface AiPack {
  readonly id: AiPackId
  readonly frames: number
  readonly priceCents: number
}

/** Наценка x2.5 к себестоимости 8 центов за кадр, с оптовой скидкой на больших пакетах. */
export const AI_PACKS: readonly AiPack[] = [
  { id: 'frames10', frames: 10, priceCents: 200 }, // 20 центов за кадр
  { id: 'frames30', frames: 30, priceCents: 500 }, // 16.67 центов за кадр
  { id: 'frames100', frames: 100, priceCents: 1500 }, // 15 центов за кадр
]

const PACK_IDS: readonly string[] = AI_PACKS.map((p) => p.id)

export function isAiPackId(value: unknown): value is AiPackId {
  return typeof value === 'string' && PACK_IDS.includes(value)
}

export function aiPack(id: AiPackId): AiPack {
  const pack = AI_PACKS.find((p) => p.id === id)
  if (pack === undefined) throw new Error(`unknown ai pack id: ${id}`)
  return pack
}

/** Только для отображения: цена кадра в центах с двумя знаками. */
export function perFrameCents(pack: AiPack): number {
  return Math.round((pack.priceCents / pack.frames) * 100) / 100
}
