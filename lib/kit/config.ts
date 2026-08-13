/**
 * Гвард ровно по образцу lib/resend/config.ts и lib/stripe/config.ts: без ключей
 * приложение работает, форма подписки рендерится, а отправка честно отвечает
 * «почта пока не подключена». В CI секретов нет, это штатное состояние.
 * Все переменные серверные: ключ Kit в клиентский бандл попасть не должен,
 * поэтому никакого NEXT_PUBLIC_ у них нет и быть не может.
 */
export const KIT_API_KEY: string = process.env['KIT_API_KEY'] ?? ''
export const KIT_FORM_ID: string = process.env['KIT_FORM_ID'] ?? ''
/** Адрес отправителя broadcast-рассылок. Необязателен: Kit подставит дефолтный из аккаунта. */
export const KIT_FROM_EMAIL: string = process.env['KIT_FROM_EMAIL'] ?? ''

export function isKitConfigured(): boolean {
  return KIT_API_KEY.length > 0 && KIT_FORM_ID.length > 0
}
