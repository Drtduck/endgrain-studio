/**
 * Гвард ровно по образцу lib/supabase/config.ts: без ключей приложение работает,
 * форма рендерится, а отправка честно отвечает «почта пока не подключена».
 * В CI секретов нет, и это штатное состояние, а не поломка.
 * Обе переменные серверные: ключ Resend в клиентский бандл попасть не должен,
 * поэтому никакого NEXT_PUBLIC_ у них нет и быть не может.
 */
export const RESEND_API_KEY: string = process.env['RESEND_API_KEY'] ?? ''
export const RESEND_AUDIENCE_ID: string = process.env['RESEND_AUDIENCE_ID'] ?? ''

export function isResendConfigured(): boolean {
  return RESEND_API_KEY.length > 0 && RESEND_AUDIENCE_ID.length > 0
}
