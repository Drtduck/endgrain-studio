import { Badge } from '@/components/ui/badge'
import { formatPrice } from '@/lib/gallery/price'
import { t, type Locale } from '@/lib/i18n'

export function PriceBadge({ locale, priceCents }: { readonly locale: Locale; readonly priceCents: number }) {
  return (
    <Badge data-testid="gallery-price" variant={priceCents === 0 ? 'secondary' : 'outline'}>
      {priceCents === 0 ? t(locale, 'gallery.free') : formatPrice(priceCents, locale)}
    </Badge>
  )
}
