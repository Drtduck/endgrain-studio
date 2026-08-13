import type { Design } from '@/lib/engine'
import type { GallerySummary } from '@/lib/gallery/types'

/** Строка public.projects. Держим руками: две таблицы не стоят генерации типов. */
export interface ProjectRow {
  readonly id: string
  readonly user_id: string
  readonly name: string
  readonly design: Design
  readonly created_at: string
  readonly updated_at: string
}

/** То, что уезжает на клиент в списке: документ грузим отдельным запросом. */
export interface ProjectSummary {
  readonly id: string
  readonly name: string
  readonly updatedAt: string
}

/** Строка public.published_projects. */
/**
 * design сознательно не входит в эту строку: колонка закрыта column-grant'ом
 * (миграция 20260813100000) от anon и authenticated, обычный select её не
 * вернёт. Полный design - через getPublishedProjectDesign в lib/gallery/list.ts.
 */
export interface PublishedProjectRow {
  readonly id: string
  readonly author_id: string
  readonly source_project_id: string | null
  readonly title: string
  readonly summary: GallerySummary
  readonly price_cents: number
  readonly currency: string
  readonly likes_count: number
  readonly saves_count: number
  readonly status: 'public' | 'unlisted' | 'removed'
  readonly created_at: string
  readonly updated_at: string
}

/** Строка public.wallets. */
export interface WalletRow {
  readonly user_id: string
  readonly balance_cents: number
  readonly currency: string
}

/** Строка public.wallet_transactions. */
export interface WalletTransactionRowDb {
  readonly id: string
  readonly user_id: string
  readonly kind: 'topup' | 'spend' | 'refund'
  readonly amount_cents: number
  readonly balance_after: number
  readonly ref: string
  readonly created_at: string
}
