'use client'

import { ListingEditor } from '@/components/promo/ListingEditor'
import { PackDownload } from '@/components/promo/PackDownload'
import { PhotoSeries } from '@/components/promo/PhotoSeries'
import { ReferenceShots } from '@/components/promo/ReferenceShots'
import { VideoPanel } from '@/components/promo/VideoPanel'
import { t } from '@/lib/i18n'
import { useStudio } from '@/lib/store/studio'

/**
 * Вкладка «Промо»: всё, что делают с уже собранной доской после проектирования.
 * Сначала серия фото по готовым пресетам, следом съёмка по своему референсу,
 * ниже пак под площадку и SEO-карточка (общий выбор кадров и площадки, см.
 * lib/store/promo.ts), затем мерч с тем же узором. Все панели рабочие без
 * ключей: они показывают компоновку, а не пустое место с обещанием.
 */
export function PromoPanel() {
  const locale = useStudio((s) => s.locale)
  return (
    <div data-testid="promo-panel" aria-label={t(locale, 'aria.promoPanel')} className="flex flex-col gap-6">
      <PhotoSeries />
      <ReferenceShots />
      <PackDownload locale={locale} />
      <ListingEditor locale={locale} />
      {/* Мерч спрятан до готовности флоу покупки (спека merch-orders.md, PR #47):
          старая кнопка вела в чужой кабинет Printful, новая касса ещё не смержена. */}
      <VideoPanel />
    </div>
  )
}
