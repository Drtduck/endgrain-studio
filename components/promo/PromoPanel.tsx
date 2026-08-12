'use client'

import { MerchMockups } from '@/components/promo/MerchMockups'
import { PhotoSeries } from '@/components/promo/PhotoSeries'
import { ReferenceShots } from '@/components/promo/ReferenceShots'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Вкладка «Промо»: всё, что делают с уже собранной доской после проектирования.
 * Сначала серия фото по готовым пресетам, следом съёмка по своему референсу,
 * ниже мерч с тем же узором. Все три панели рабочие без ключей: они показывают
 * компоновку, а не пустое место с обещанием.
 */
export function PromoPanel() {
  const locale = useStudio((s) => s.locale)
  return (
    <div data-testid="promo-panel" aria-label={t(locale, 'aria.promoPanel')} className="flex flex-col gap-6">
      <PhotoSeries />
      <ReferenceShots />
      <MerchMockups />
    </div>
  )
}
