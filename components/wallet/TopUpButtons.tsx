'use client'

import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'
import { WALLET_PRESETS, formatCents, type WalletPreset } from '@/lib/wallet/format'

export function TopUpButtons({
  locale,
  busy,
  onPick,
}: {
  readonly locale: Locale
  readonly busy: WalletPreset | null
  readonly onPick: (preset: WalletPreset) => void
}) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="wallet-topup-buttons">
      {WALLET_PRESETS.map((preset) => (
        <Button
          key={preset}
          size="sm"
          variant="outline"
          data-testid={`wallet-topup-${preset}`}
          disabled={busy !== null}
          onClick={() => onPick(preset)}
        >
          {busy === preset ? t(locale, 'wallet.busy') : formatCents(preset, locale)}
        </Button>
      ))}
    </div>
  )
}
