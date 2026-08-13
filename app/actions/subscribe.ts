'use server'

import { isKitConfigured } from '@/lib/kit/config'
import { subscribeToKit } from '@/lib/kit/subscribe'
import { subscribeSchema, type SubscribeResult } from '@/lib/subscribe'

/**
 * Kit (бывший ConvertKit) вместо Resend для сбора подписчиков лендинга.
 * Resend остаётся для системных писем приложения и сюда не относится.
 * Контракт SubscribeResult не меняется, поэтому SubscribeForm и его тесты правки не требуют.
 */
export async function subscribeAction(input: unknown): Promise<SubscribeResult> {
  const parsed = subscribeSchema.safeParse(input)
  if (!parsed.success) {
    const company = typeof input === 'object' && input !== null ? (input as { company?: unknown }).company : ''
    if (typeof company === 'string' && company.length > 0) return { ok: false, error: 'bot' }
    return { ok: false, error: 'invalid' }
  }

  if (!isKitConfigured()) return { ok: false, error: 'disabled' }

  const res = await subscribeToKit(parsed.data.email)
  if (!res.ok) return { ok: false, error: 'failed' }
  // Kit v4 не возвращает признак «подписчик уже был», в отличие от Resend:
  // любой успешный ответ трактуем как обычный успех подписки.
  return { ok: true }
}
