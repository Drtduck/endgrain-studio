import type { Locale } from '@/lib/i18n'

/**
 * Юридическая проза живёт вне lib/i18n/{ru,en}.ts: десятки килобайт текста раздули
 * бы плоские словари и попали бы в каждый клиентский бандл. lib/legal/ не входит в
 * список корней lib/i18n/purity.test.ts, поэтому кириллица здесь законна.
 */
export interface LegalSection {
  readonly heading: string
  readonly paragraphs: readonly string[]
}

export interface LegalDoc {
  readonly title: string
  /** ISO-дата, показывается человеку как «обновлено ...». */
  readonly updatedAt: string
  readonly sections: readonly LegalSection[]
}

export type LegalDocByLocale = Readonly<Record<Locale, LegalDoc>>

export type LegalSlug = 'privacy' | 'personal-data' | 'consent'
