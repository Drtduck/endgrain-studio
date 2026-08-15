'use client'

import { useEffect, useState } from 'react'
import { Copy, Plus, Sparkles, Trash2 } from 'lucide-react'
import { generateListingAction, readListingAction, saveListingAction, type ListingError } from '@/app/actions/listing'
import { AiGateNote, useAiGate } from '@/components/promo/AiGate'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { t, type Locale, type MessageKey } from '@/lib/i18n'
import { marketplaceById, marketplacesFor, type MarketplaceId } from '@/lib/promo/marketplaces'
import type { PromoListingDraft } from '@/lib/promo/marketplaceListing'
import { isDownloadable, usePromoStore } from '@/lib/store/promo'
import { selectDesign, useStudio } from '@/lib/store/studio'

const ERROR_KEYS: Readonly<Record<ListingError, MessageKey>> = {
  anonymous: 'ai.gate.anonymous',
  notPro: 'ai.gate.free',
  trialSpent: 'ai.gate.trialSpent',
  quota: 'ai.gate.quota',
  unavailable: 'ai.gate.unavailable',
  noCredits: 'ai.gate.noCredits',
  invalid: 'salePrep.error',
  failed: 'salePrep.error',
  notFound: 'promo.err.notFound',
  rateLimited: 'promo.err.rateLimited',
}

function emptyDraft(): PromoListingDraft {
  return { title: '', description: '', bullets: [], tags: [] }
}

function demoStorageKey(marketplace: MarketplaceId): string {
  return `promo-listing-demo:${marketplace}`
}

/**
 * SEO-описание карточки под площадку (спека, раздел 8). Заменяет ListingPanel.tsx:
 * та же идея (карточка товара из готового узора), но текст и лимиты теперь
 * зависят от выбранной площадки, а не жёстко зашиты под Amazon+Etsy.
 *
 * Площадка и отобранные кадры - общий стор с PackDownload (lib/store/promo.ts):
 * один выбор, два потребителя (спека 8.2).
 *
 * Демо-режим (нет Supabase - CI, дев без ключей) хранит карточку в
 * localStorage, а не в promo_listings: это тот же принцип, на котором
 * держится вся студия без аккаунта (lib/store/persist.ts), и единственный
 * способ честно пройти "SEO-текст сохраняется и переживает перезагрузку" без
 * живой базы.
 */
export function ListingEditor({ locale }: { readonly locale: Locale }) {
  const design = useStudio(selectDesign)
  const currentProjectId = useStudio((s) => s.currentProjectId)
  const marketplace = usePromoStore((s) => s.marketplace)
  const setMarketplace = usePromoStore((s) => s.setMarketplace)
  const shotsById = usePromoStore((s) => s.shotsById)
  const selected = usePromoStore((s) => s.selectedShotIds)

  const gate = useAiGate(null, 'saleListing')

  const options = marketplacesFor(locale)
  const spec = marketplaceById(marketplace)
  const rules = spec.listing

  const [draft, setDraft] = useState<PromoListingDraft>(emptyDraft())
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [mockNote, setMockNote] = useState(false)
  const [error, setError] = useState<ListingError | null>(null)

  /** Локальная заготовка, если облако недоступно или отказало (нет аккаунта/ключей). */
  function loadLocal(): PromoListingDraft {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(demoStorageKey(marketplace))
    if (raw === null) return emptyDraft()
    try {
      return JSON.parse(raw) as PromoListingDraft
    } catch {
      return emptyDraft()
    }
  }

  // Читаем сохранённую карточку при открытии и при смене площадки. Пробуем
  // облако, если оно вообще может ответить (спрятано за Supabase+аккаунтом);
  // отказ 'anonymous'/'unavailable' - тихий откат на localStorage, тот же
  // принцип, на котором держится вся студия без входа (lib/store/persist.ts).
  useEffect(() => {
    let cancelled = false
    // setState откладываем микротаском: react-hooks/set-state-in-effect не
    // разрешает звать его синхронно из тела эффекта (тот же приём, что в
    // components/wallet/WalletPanel.tsx и components/credits/CreditsPanel.tsx).
    void Promise.resolve().then(async () => {
      if (cancelled) return
      setError(null)
      setMockNote(false)
      if (currentProjectId === null) {
        setDraft(loadLocal())
        return
      }
      const res = await readListingAction({ projectId: currentProjectId, marketplace })
      if (cancelled) return
      if (res.ok) {
        setDraft({ title: res.data.title, description: res.data.description, bullets: res.data.bullets, tags: res.data.tags })
      } else {
        setDraft(loadLocal())
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketplace, currentProjectId])

  const selectedShotIds = [...selected].filter((id) => {
    const shot = shotsById[id]
    return shot !== undefined && isDownloadable(shot)
  })

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      const res = await generateListingAction({
        projectId: currentProjectId ?? '00000000-0000-4000-8000-000000000000',
        marketplace,
        shotIds: selectedShotIds,
        walletRef: crypto.randomUUID(),
        design,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setDraft(res.listing)
      setMockNote(res.mock)
    } finally {
      setBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    setSaving(true)
    try {
      const markSaved = (): void => {
        setSaved(true)
        setTimeout(() => { setSaved(false) }, 2000)
      }

      if (currentProjectId === null) {
        window.localStorage.setItem(demoStorageKey(marketplace), JSON.stringify(draft))
        markSaved()
        return
      }
      const res = await saveListingAction({
        projectId: currentProjectId,
        marketplace,
        title: draft.title,
        description: draft.description,
        bullets: draft.bullets,
        tags: draft.tags,
        selectedShotIds,
      })
      if (res.ok) {
        markSaved()
        return
      }
      if (res.error === 'anonymous' || res.error === 'unavailable') {
        // Облако отказало не по вине человека - правки не теряем, кладём рядом.
        window.localStorage.setItem(demoStorageKey(marketplace), JSON.stringify(draft))
        markSaved()
        return
      }
      setError(res.error)
    } finally {
      setSaving(false)
    }
  }

  const copyAll = (): void => {
    const text = [
      draft.title,
      '',
      draft.description,
      draft.bullets.length > 0 ? `\n${draft.bullets.map((b) => `- ${b}`).join('\n')}` : '',
      draft.tags.length > 0 ? `\nTags: ${draft.tags.join(', ')}` : '',
    ].join('\n')
    navigator.clipboard?.writeText(text).catch(() => {})
  }

  const setBullet = (index: number, value: string): void => {
    setDraft((prev) => ({ ...prev, bullets: prev.bullets.map((b, i) => (i === index ? value : b)) }))
  }
  const addBullet = (): void => { setDraft((prev) => ({ ...prev, bullets: [...prev.bullets, ''] })) }
  const removeBullet = (index: number): void => { setDraft((prev) => ({ ...prev, bullets: prev.bullets.filter((_, i) => i !== index) })) }

  const counter = (len: number, max: number): string => `${len} / ${max}`
  const overLimit = (len: number, max: number): boolean => len > max

  return (
    <section
      data-testid="promo-listing"
      aria-label={t(locale, 'salePrep.title')}
      className="flex flex-col gap-4 rounded-lg border border-line-subtle bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold">{t(locale, 'salePrep.title')}</h2>
        <div className="flex-1" />
        <label className="flex items-center gap-2 text-[13px]">
          <span className="font-semibold">{t(locale, 'promo.pack.marketplace')}</span>
          <select
            data-testid="listing-marketplace"
            value={marketplace}
            onChange={(e) => { setMarketplace(e.target.value as MarketplaceId) }}
            className="h-9 rounded-md border border-line bg-surface px-2 text-sm"
          >
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {t(locale, m.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="max-w-[68ch] text-[13px] text-ink-secondary">{t(locale, 'salePrep.subtitle')}</p>

      {gate.locked ? <AiGateNote gate={gate} locale={locale} testId="listing-gate" /> : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" data-testid="listing-generate" disabled={busy || gate.locked} onClick={() => { void generate() }}>
          <Sparkles data-icon="inline-start" />
          {busy ? t(locale, 'salePrep.busy') : t(locale, 'salePrep.generate')}
        </Button>
        <Button size="sm" variant="outline" data-testid="listing-save" disabled={saving} onClick={() => { void save() }}>
          {saved ? t(locale, 'listing.saved') : t(locale, 'listing.save')}
        </Button>
        <Button size="sm" variant="ghost" data-testid="listing-copy-all" onClick={copyAll}>
          <Copy data-icon="inline-start" />
          {t(locale, 'salePrep.copy')}
        </Button>
      </div>

      {error !== null ? (
        <p role="alert" data-testid="listing-error" className="rounded-md border border-error-border bg-error-soft px-3 py-[11px] text-[13px] font-semibold text-error-text">
          {t(locale, ERROR_KEYS[error])}
        </p>
      ) : null}

      {mockNote ? (
        <p data-testid="listing-mock-note" className="text-[13px] text-ink-secondary">
          {t(locale, 'salePrep.mockNote')}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="flex items-center justify-between font-semibold">
          {t(locale, 'salePrep.field.title')}
          <span className={overLimit(draft.title.length, rules.titleMax) ? 'font-normal text-error-text' : 'font-normal text-ink-muted'}>
            {counter(draft.title.length, rules.titleMax)}
          </span>
        </span>
        <input
          data-testid="listing-title"
          value={draft.title}
          onChange={(e) => { setDraft((prev) => ({ ...prev, title: e.target.value })) }}
          className="h-9 rounded-md border border-line bg-surface px-2 text-sm"
        />
      </label>

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="flex items-center justify-between font-semibold">
          {t(locale, 'salePrep.field.description')}
          <span className={overLimit(draft.description.length, rules.descriptionMax) ? 'font-normal text-error-text' : 'font-normal text-ink-muted'}>
            {counter(draft.description.length, rules.descriptionMax)}
          </span>
        </span>
        <Textarea
          rows={6}
          data-testid="listing-description"
          value={draft.description}
          onChange={(e) => { setDraft((prev) => ({ ...prev, description: e.target.value })) }}
        />
      </label>

      {rules.bulletCount > 0 || draft.bullets.length > 0 ? (
        <div data-testid="listing-bullets" className="flex flex-col gap-1.5 text-[13px]">
          <span className="flex items-center justify-between font-semibold">
            {t(locale, 'listing.bullets')}
            <span className={overLimit(draft.bullets.length, rules.bulletCount) ? 'font-normal text-error-text' : 'font-normal text-ink-muted'}>
              {counter(draft.bullets.length, rules.bulletCount)}
            </span>
          </span>
          {draft.bullets.map((bullet, index) => (
            <div key={index} className="flex items-center gap-1.5">
              <input
                value={bullet}
                onChange={(e) => { setBullet(index, e.target.value) }}
                className="h-9 flex-1 rounded-md border border-line bg-surface px-2 text-sm"
              />
              <Button size="icon-sm" variant="ghost" type="button" onClick={() => { removeBullet(index) }} aria-label={t(locale, 'listing.removeBullet')}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" type="button" onClick={addBullet} className="w-fit">
            <Plus data-icon="inline-start" />
            {t(locale, 'listing.addBullet')}
          </Button>
        </div>
      ) : null}

      <label className="flex flex-col gap-1 text-[13px]">
        <span className="flex items-center justify-between font-semibold">
          {t(locale, 'listing.tags')}
          <span className={overLimit(draft.tags.length, rules.tagCount) ? 'font-normal text-error-text' : 'font-normal text-ink-muted'}>
            {counter(draft.tags.length, rules.tagCount)}
          </span>
        </span>
        <input
          data-testid="listing-tags"
          value={draft.tags.join(', ')}
          onChange={(e) => {
            const tags = e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
            setDraft((prev) => ({ ...prev, tags }))
          }}
          className="h-9 rounded-md border border-line bg-surface px-2 text-sm"
        />
      </label>
    </section>
  )
}
