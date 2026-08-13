import { KIT_API_KEY, KIT_FORM_ID } from './config'

const KIT_API_BASE = 'https://api.kit.com'

export type KitSubscribeResult = { ok: true } | { ok: false; error: string }

/**
 * Подписка на Kit (бывший ConvertKit) через REST v4 напрямую, без SDK.
 * Два последовательных запроса, как требует API:
 * 1) upsert подписчика по email (создаёт или обновляет карточку контакта);
 * 2) добавление уже существующего подписчика в форму (форма с double opt-in
 *    сама шлёт письмо подтверждения на стороне Kit).
 * Второй запрос зовём только если первый прошёл: без подписчика добавлять в форму нечего.
 */
export async function subscribeToKit(email: string, referrer?: string): Promise<KitSubscribeResult> {
  try {
    const createRes = await fetch(`${KIT_API_BASE}/v4/subscribers`, {
      method: 'POST',
      headers: {
        'X-Kit-Api-Key': KIT_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_address: email }),
      // Ответ Kit кэшировать нечего и опасно.
      cache: 'no-store',
    })
    if (!createRes.ok) {
      // Тело ошибки может содержать диагностику Kit, но не ключ: его в теле нет.
      return { ok: false, error: `kit subscribers ${createRes.status}` }
    }

    const formRes = await fetch(`${KIT_API_BASE}/v4/forms/${KIT_FORM_ID}/subscribers`, {
      method: 'POST',
      headers: {
        'X-Kit-Api-Key': KIT_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_address: email, ...(referrer ? { referrer } : {}) }),
      cache: 'no-store',
    })
    if (!formRes.ok) {
      return { ok: false, error: `kit forms ${formRes.status}` }
    }

    return { ok: true }
  } catch {
    // Сеть упала или Kit недоступен: пользователю честная ошибка, а не белый экран.
    return { ok: false, error: 'network error' }
  }
}
