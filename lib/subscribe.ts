// Вынесено из app/actions/subscribe.ts: файл с директивой 'use server' может
// экспортировать только асинхронные функции, ни константу, ни тип оттуда Next не соберёт.
import { z } from 'zod'

export const EMAIL_MAX_LENGTH = 254

export const subscribeSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(EMAIL_MAX_LENGTH).email(),
  locale: z.enum(['ru', 'en']).optional(),
  // Ловушка для ботов: настоящий человек это поле не видит и не заполняет.
  company: z.string().max(0).optional(),
})

export type SubscribeError = 'invalid' | 'disabled' | 'failed' | 'bot'
export type SubscribeResult = { ok: true; already: boolean } | { ok: false; error: SubscribeError }
