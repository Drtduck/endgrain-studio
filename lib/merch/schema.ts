import { z } from 'zod'
import { designSchema } from '@/lib/persist'
import { MERCH_SIZES_BY_PRODUCT, type MerchSize } from './catalog'

/**
 * Схема входа createMerchCheckoutAction (§4.1 спеки merch-orders.md). Свой домен,
 * не lib/promo/schema.ts: мерч-заказ не имеет отношения к серии фото и мокапам.
 *
 * Дизайн приходит документом, а не PNG (в отличие от merchSchema из промо):
 * print-файл рисуется сервером в высоком разрешении, а гнать 4000-пиксельный
 * PNG из браузера в server action невозможно (лимит тела, MAX_PNG_CHARS).
 */
const merchProductSchema = z.enum(['tshirt', 'mug', 'poster', 'apron'])
const merchSizeSchema = z.enum(['s', 'm', 'l', 'xl', 'one'])

export const merchOrderSchema = z
  .object({
    product: merchProductSchema,
    size: merchSizeSchema,
    projectId: z.uuid().nullable(),
    design: designSchema,
  })
  .refine((data) => (MERCH_SIZES_BY_PRODUCT[data.product] as readonly MerchSize[]).includes(data.size), {
    // Неверная пара товар+размер - это invalid, а не молчаливая подмена (§4.1).
    message: 'недопустимая пара товар+размер',
    path: ['size'],
  })

export type MerchOrderRequest = z.infer<typeof merchOrderSchema>
