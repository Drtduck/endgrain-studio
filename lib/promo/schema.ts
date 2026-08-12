// Вынесено из app/actions/promo.ts: файл с директивой 'use server' может
// экспортировать только асинхронные функции, ни схему, ни константу оттуда Next не соберёт.
import { z } from 'zod'

/**
 * Рендер доски приходит с клиента готовым PNG: серверу нечем растеризовать SVG.
 * Проверяем не только префикс data-url, но и магию файла: base64 настоящего PNG
 * всегда начинается с iVBORw0KGgo (сигнатура 89 50 4E 47 0D 0A 1A 0A).
 */
export const PNG_DATA_URL_RE = /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/=]*$/

/**
 * Потолок тела серверного действия в Next по умолчанию 1 МБ и поднят до 5 МБ в next.config.
 * 3.5 млн символов base64 это около 2.6 МБ картинки: с запасом влезает вместе с промптом,
 * а рендер доски в 1024 px столько никогда и не весит.
 */
export const MAX_PNG_CHARS = 3_500_000

export const promoShotsSchema = z.object({
  boardPng: z.string().max(MAX_PNG_CHARS).regex(PNG_DATA_URL_RE),
  description: z.string().trim().min(1).max(2000),
})

export type PromoShotsInput = z.infer<typeof promoShotsSchema>
