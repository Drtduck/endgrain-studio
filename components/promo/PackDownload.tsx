'use client'

import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { t, type Locale } from '@/lib/i18n'
import { marketplaceById, marketplacesFor, type MarketplaceId } from '@/lib/promo/marketplaces'
import { isDownloadable, usePromoStore } from '@/lib/store/promo'
import { PROMO_SHOT_META, type PromoShotKind, type PromoShotView } from '@/lib/promo/types'

const SHOT_TITLE_BY_KIND = new Map(PROMO_SHOT_META.map((meta) => [meta.kind, meta.titleKey]))

/**
 * Название кадра в списке пака. Варианты правки несут kindSlug='edit' (не
 * пресетный - см. lib/promo/useSeriesRunner.ts, комментарий у edit()), поэтому
 * заголовок берётся у КОРНЯ группы через parentShotId, а не у самого варианта.
 */
function shotLabel(locale: Locale, shot: PromoShotView, shotsById: Readonly<Record<string, PromoShotView>>): string {
  const root = shot.parentShotId !== null ? (shotsById[shot.parentShotId] ?? shot) : shot
  const titleKey = SHOT_TITLE_BY_KIND.get(root.kindSlug as PromoShotKind)
  const base = titleKey !== undefined ? t(locale, titleKey) : root.kindSlug
  return shot.variantNo > 1 ? `${base} - ${t(locale, 'promo.variant', { n: shot.variantNo })}` : base
}

/**
 * Скачивание пака под площадку (спека, раздел 7.6). Площадка и отбор кадров
 * живут в общем сторе (lib/store/promo.ts): тот же набор потом попадает в
 * ListingEditor как selectedShotIds (спека 8.2).
 *
 * Ссылка - обычный <a href download>, не onClick + fetch: скачивание через JS
 * ломается в трети мобильных браузеров и не показывает честный прогресс.
 * seriesId в пути берётся с любого выбранного кадра (маршрут всё равно не
 * фильтрует по нему кадры чужой серии - см. app/api/promo/pack/[seriesId]/route.ts,
 * он там только для валидации формы пути и человекочитаемости URL).
 */
export function PackDownload({ locale }: { readonly locale: Locale }) {
  const marketplace = usePromoStore((s) => s.marketplace)
  const setMarketplace = usePromoStore((s) => s.setMarketplace)
  const shotsById = usePromoStore((s) => s.shotsById)
  const selected = usePromoStore((s) => s.selectedShotIds)
  const toggleShot = usePromoStore((s) => s.toggleShot)
  const selectAll = usePromoStore((s) => s.selectAll)
  const deselectAll = usePromoStore((s) => s.deselectAll)

  const options = marketplacesFor(locale)
  const spec = marketplaceById(marketplace)

  const doneShots: readonly PromoShotView[] = Object.values(shotsById)
    .filter(isDownloadable)
    .sort((a, b) => a.ordinal - b.ordinal || a.variantNo - b.variantNo)
  const selectedDone = doneShots.filter((shot) => selected.has(shot.id))
  const allSelected = doneShots.length > 0 && selectedDone.length === doneShots.length

  const seriesId = selectedDone[0]?.seriesId ?? null
  const href =
    seriesId !== null && selectedDone.length > 0
      ? `/api/promo/pack/${seriesId}?market=${marketplace}&shots=${selectedDone.map((s) => s.id).join(',')}`
      : null

  const maxMb = Math.round(spec.image.maxBytes / (1024 * 1024))

  return (
    <section
      data-testid="promo-pack"
      aria-label={t(locale, 'promo.pack.title')}
      className="flex flex-col gap-3 rounded-lg border border-line-subtle bg-surface p-4"
    >
      <h2 className="font-display text-[17px] font-semibold">{t(locale, 'promo.pack.title')}</h2>
      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'promo.pack.subtitle')}</p>

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="font-semibold">{t(locale, 'promo.pack.marketplace')}</span>
        <select
          data-testid="promo-marketplace-select"
          value={marketplace}
          onChange={(e) => { setMarketplace(e.target.value as MarketplaceId) }}
          className="h-9 w-fit rounded-md border border-line bg-surface px-2 text-sm"
        >
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {t(locale, m.labelKey)}
            </option>
          ))}
        </select>
      </label>

      <p data-testid="promo-pack-sizes" className="text-[13px] text-ink-secondary">
        {t(locale, 'promo.pack.sizes', {
          width: spec.image.target.width,
          height: spec.image.target.height,
          aspectW: spec.image.aspect[0],
          aspectH: spec.image.aspect[1],
          format: spec.image.format.toUpperCase(),
          maxMb,
          maxImages: spec.image.maxImages,
        })}
      </p>

      {!spec.confirmed ? (
        <p data-testid="promo-pack-unconfirmed" className="text-[13px] text-ink-secondary">
          {t(locale, 'promo.pack.unconfirmed')}{' '}
          <a href={spec.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent underline-offset-4 hover:underline">
            {spec.sourceUrl}
          </a>
        </p>
      ) : null}

      {doneShots.length === 0 ? (
        <p data-testid="promo-pack-empty" className="text-[13px] text-ink-secondary">
          {t(locale, 'promo.pack.empty')}
        </p>
      ) : (
        <>
          <ul data-testid="promo-pack-list" className="flex flex-col gap-1">
            {doneShots.map((shot) => (
              <li key={shot.id}>
                <label className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    data-testid={`promo-pack-shot-${shot.id}`}
                    checked={selected.has(shot.id)}
                    onChange={() => { toggleShot(shot.id) }}
                  />
                  <span>{shotLabel(locale, shot, shotsById)}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="promo-select-all"
            onClick={() => { if (allSelected) deselectAll(); else selectAll() }}
          >
            {allSelected ? t(locale, 'promo.pack.deselectAll') : t(locale, 'promo.pack.selectAll')}
          </Button>
        </>
      )}

      <p data-testid="promo-pack-count" className="text-[13px] font-semibold">
        {t(locale, 'promo.pack.count', { selected: selectedDone.length, total: doneShots.length })}
      </p>

      <a
        data-testid="promo-pack-download"
        href={href ?? undefined}
        aria-disabled={href === null}
        download={href !== null}
        tabIndex={href === null ? -1 : undefined}
        className={
          href === null
            ? 'pointer-events-none inline-flex w-fit items-center gap-1.5 rounded-md border border-line-subtle bg-surface-raised px-4 py-2 text-sm font-semibold text-ink-muted opacity-50'
            : 'inline-flex w-fit items-center gap-1.5 rounded-md border border-transparent bg-accent px-4 py-2 text-sm font-semibold text-accent-fg shadow-sm hover:bg-accent-hover'
        }
      >
        <Download aria-hidden className="size-4" />
        {t(locale, 'promo.pack.download')}
      </a>
    </section>
  )
}
