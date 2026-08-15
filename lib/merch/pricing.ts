import 'server-only'
import type { MerchProductId } from '../promo/types'
import { MERCH_VARIANTS, type MerchVariant } from './catalog'

/**
 * Множитель наценки на печать. Env, а не константа: маржу можно поправить без
 * деплоя кода. Разбор защищённый (§10 спеки): опечатка в переменной окружения
 * не должна привести к продаже футболки за доллар, поэтому мусор и значения
 * вне разумного диапазона тихо заменяются дефолтом с записью в лог.
 */
const MERCH_MARGIN_DEFAULT = 1.8
const MERCH_MARGIN_MIN = 1.0
const MERCH_MARGIN_MAX = 5.0

function parseMargin(raw: string | undefined): number {
  if (raw === undefined || raw === '') return MERCH_MARGIN_DEFAULT
  const value = Number.parseFloat(raw)
  if (!Number.isFinite(value) || value < MERCH_MARGIN_MIN || value > MERCH_MARGIN_MAX) {
    console.error(`MERCH_MARGIN: некорректное значение "${raw}", беру дефолт ${MERCH_MARGIN_DEFAULT}`)
    return MERCH_MARGIN_DEFAULT
  }
  return value
}

export const MERCH_MARGIN: number = parseMargin(process.env['MERCH_MARGIN'])

/**
 * Округление вверх до ближайшей цены вида X.99. 2431 -> 2499, 2499 -> 2499, 2500 -> 2599.
 * Центы целые на входе и на выходе: копеечных долей в кассе нет.
 */
export function round99(cents: number): number {
  return Math.ceil((cents - 99) / 100) * 100 + 99
}

/**
 * retail = round99(cost_variant * margin + cost_shipping) (§2.1 спеки).
 * Наценка применяется только к печати: доставка добавляется по себестоимости
 * уже после умножения, иначе на дорогой доставке (постер) наценка на неё саму
 * превысила бы наценку на товар.
 */
export function retailCents(variant: Pick<MerchVariant, 'costCents' | 'shipCents'>, margin: number = MERCH_MARGIN): number {
  return round99(Math.round(variant.costCents * margin) + variant.shipCents)
}

/**
 * Одна цена на товар для карточки (§2.3, §9.2 спеки): у футболки S-XL стоят
 * одинаково, поэтому берём первый попавшийся вариант каждого товара - для
 * mug/poster/apron он и так единственный. Считается на сервере (§9.2: клиент
 * получает уже посчитанные цены пропсом, MERCH_MARGIN серверная переменная)
 * и уезжает в ProProvider через app/layout.tsx.
 */
export function merchRetailPrices(margin: number = MERCH_MARGIN): Readonly<Record<MerchProductId, number>> {
  const result = {} as Record<MerchProductId, number>
  for (const variant of MERCH_VARIANTS) {
    if (result[variant.productId] === undefined) result[variant.productId] = retailCents(variant, margin)
  }
  return result
}
