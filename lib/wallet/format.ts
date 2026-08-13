/**
 * Чистая арифметика кошелька: ни одного импорта, ни одного похода в сеть.
 * Отдельный файл от app/actions/wallet.ts, потому что типы отсюда читают клиентские
 * компоненты (WalletPanel, TopUpButtons), а server.ts тянет service-ключ Supabase.
 */

export type WalletPreset = 500 | 1000 | 2500

/** Пополнение только пресетами: произвольная сумма означала бы приём числа с клиента. */
export const WALLET_PRESETS: readonly WalletPreset[] = [500, 1000, 2500]

export function isWalletPreset(value: unknown): value is WalletPreset {
  return typeof value === 'number' && (WALLET_PRESETS as readonly number[]).includes(value)
}

/** Центы в денежную строку локали. cents всегда целое: делит на 100 без остатка в отображении. */
export function formatCents(cents: number, locale: 'ru' | 'en'): string {
  const formatter = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return formatter.format(cents / 100)
}
