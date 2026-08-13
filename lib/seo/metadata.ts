import type { Metadata } from 'next'
import { APP_ORIGIN, SITE_ORIGIN } from '@/lib/routing/host'

/** Абсолютный адрес на домене лендинга. `path` начинается со слеша либо пустой для корня. */
export function siteUrl(path: string = ''): string {
  return `${SITE_ORIGIN}${path}`
}

/** Абсолютный адрес на домене студии. */
export function appUrl(path: string = ''): string {
  return `${APP_ORIGIN}${path}`
}

export interface PageMetadataInput {
  readonly title: string
  readonly description: string
  /** Абсолютный канонический URL, обычно из siteUrl()/appUrl(). */
  readonly canonical: string
  readonly locale: 'ru' | 'en'
  readonly type?: 'website' | 'article'
  /** Абсолютный URL картинки OG. Без него страница наследует картинку через metadataBase. */
  readonly image?: string
  readonly noIndex?: boolean
  /** Доп. alternates (например rel=alternate rss). */
  readonly alternates?: Metadata['alternates']
}

/**
 * Единая точка сборки Metadata для публичных страниц: заголовок, описание, канон,
 * OpenGraph и twitter card собираются из одного набора полей, а не пишутся
 * руками на каждой странице по отдельности.
 */
export function pageMetadata(input: PageMetadataInput): Metadata {
  const ogLocale = input.locale === 'ru' ? 'ru_RU' : 'en_US'
  const images = input.image ? [{ url: input.image }] : undefined

  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical: input.canonical,
      ...(input.alternates ?? {}),
    },
    ...(input.noIndex ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      type: input.type ?? 'website',
      url: input.canonical,
      siteName: 'Endgrain Studio',
      title: input.title,
      description: input.description,
      locale: ogLocale,
      ...(images ? { images } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title: input.title,
      description: input.description,
      ...(images ? { images } : {}),
    },
  }
}
