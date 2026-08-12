'use server'

import { RESEND_API_KEY, RESEND_AUDIENCE_ID, isResendConfigured } from '@/lib/resend/config'
import { subscribeSchema, type SubscribeResult } from '@/lib/subscribe'

/**
 * Resend REST напрямую, без SDK: один POST не стоит 300 КБ зависимости.
 * Аудитория бесплатного тарифа держит 1000 контактов, этого хватит надолго.
 * Дубль адреса Resend возвращает как 200 с уже существующим контактом, поэтому
 * повторная подписка для пользователя выглядит успехом, а не ошибкой.
 */
export async function subscribeAction(input: unknown): Promise<SubscribeResult> {
  const parsed = subscribeSchema.safeParse(input)
  if (!parsed.success) {
    const company = typeof input === 'object' && input !== null ? (input as { company?: unknown }).company : ''
    if (typeof company === 'string' && company.length > 0) return { ok: false, error: 'bot' }
    return { ok: false, error: 'invalid' }
  }

  if (!isResendConfigured()) return { ok: false, error: 'disabled' }

  try {
    const res = await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: parsed.data.email, unsubscribed: false }),
      // Ответ Resend кэшировать нечего и опасно.
      cache: 'no-store',
    })
    if (!res.ok) return { ok: false, error: 'failed' }
    const body = (await res.json()) as { id?: string }
    return { ok: true, already: typeof body.id !== 'string' }
  } catch {
    // Сеть упала или Resend недоступен: пользователю честная ошибка, а не белый экран.
    return { ok: false, error: 'failed' }
  }
}
