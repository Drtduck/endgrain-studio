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

/**
 * Потолки на документ доски (ревью 15.08.2026, п.4). renderMerchPrint
 * (lib/merch/print.ts) рендерит документ синхронно, до кассы и до любой
 * оплаты, в разрешении до MERCH_PRINT_MAX_PX = 4000 px. designSchema
 * (lib/persist/schema.ts) сам по себе количество панелей/рядов/элементов
 * не ограничивает - он общий и для сохранения проекта, где ничего в высоком
 * разрешении на сервере не рисуется. Без потолка здесь документ с тысячами
 * полос превращает бесплатный (до оплаты) запрос в DoS: минуты sharp на
 * 4000px канве за счёт одного вызова.
 *
 * Числа - с запасом x2 от практического максимума редактора:
 * - панели UI не даёт заводить руками (панели приходят из шаблонов
 *   lib/designs/grid.ts), на практике единицы. MAX_PANELS = 40.
 * - элементы одной панели (полосы/резы) ограничены шириной доски и
 *   минимальной шириной полосы: BOARD_MAX_MM=1200 / MIN_STRIP_WIDTH_MM=4
 *   = 300 (lib/engine/types.ts). MAX_ELEMENTS_PER_PANEL = 600.
 * - ряды - та же арифметика по длине доски. MAX_ROWS = 600.
 * - произведение «ряды x элементы в самой длинной панели» - грубая верхняя
 *   оценка числа реально рисуемых прямоугольников на печатном файле.
 *   MAX_RENDER_COMPLEXITY держит рендер в разумных секундах даже на потолке
 *   отдельных полей.
 */
const MAX_PANELS = 40
const MAX_ROWS = 600
const MAX_ELEMENTS_PER_PANEL = 600
const MAX_RENDER_COMPLEXITY = 40_000

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
  .refine((data) => data.design.panels.length <= MAX_PANELS, {
    message: `слишком много панелей в документе (потолок ${MAX_PANELS})`,
    path: ['design', 'panels'],
  })
  .refine((data) => data.design.rows.length <= MAX_ROWS, {
    message: `слишком много рядов в документе (потолок ${MAX_ROWS})`,
    path: ['design', 'rows'],
  })
  .refine((data) => data.design.panels.every((p) => p.elements.length <= MAX_ELEMENTS_PER_PANEL), {
    message: `слишком много элементов в панели (потолок ${MAX_ELEMENTS_PER_PANEL})`,
    path: ['design', 'panels'],
  })
  .refine(
    (data) => {
      const maxElements = data.design.panels.reduce((max, p) => Math.max(max, p.elements.length), 0)
      return data.design.rows.length * maxElements <= MAX_RENDER_COMPLEXITY
    },
    {
      message: `документ слишком сложный для печати (потолок ${MAX_RENDER_COMPLEXITY} рядов×элементов)`,
      path: ['design'],
    },
  )

export type MerchOrderRequest = z.infer<typeof merchOrderSchema>
