// Вынесено из app/actions/promo.ts: файл с директивой 'use server' может
// экспортировать только асинхронные функции, ни схему, ни константу оттуда Next не соберёт.
import { z } from 'zod'

/** Рендер доски приходит с клиента готовым PNG: серверу нечем растеризовать SVG. */
export const PNG_DATA_URL_RE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/

/** 6 МБ base64 это примерно 4.5 МБ картинки: больше в запрос к Gemini класть незачем. */
export const MAX_PNG_CHARS = 6_000_000

export const promoShotsSchema = z.object({
  boardPng: z.string().max(MAX_PNG_CHARS).regex(PNG_DATA_URL_RE),
  description: z.string().trim().min(1).max(2000),
})

export const merchSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  /**
   * Публичный https-адрес картинки узора. Printful тянет файл сам со своей стороны,
   * поэтому data:URI ему отдать нельзя: пока адреса нет, показываем локальные мокапы.
   */
  patternUrl: z.string().url().startsWith('https://').max(2000).optional(),
})

export type PromoShotsInput = z.infer<typeof promoShotsSchema>
export type MerchInput = z.infer<typeof merchSchema>
