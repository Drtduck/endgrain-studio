import type { PostMeta } from '@/lib/blog/types'
import { APP_ORIGIN } from '@/lib/routing/host'
import { siteUrl } from './metadata'

/**
 * Разметка только JSON-LD, микроформатов не пишем. Функции возвращают простые
 * объекты (никакой сериализации здесь) - вставка в HTML происходит в
 * components/seo/JsonLd.tsx.
 */

// siteUrl() без пути, не siteUrl('/'): Next.js Metadata API отдаёт canonical и
// og:url корня без слеша на конце, JSON-LD должен указывать тот же адрес,
// иначе Organization.url и canonical расходятся на один слеш.
const ORG_ID = `${siteUrl()}#organization`
const WEBSITE_ID = `${siteUrl()}#website`

export interface BreadcrumbItem {
  readonly name: string
  readonly url: string
}

export function organizationJsonLd(): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': ORG_ID,
    name: 'Endgrain App',
    url: siteUrl(),
    logo: siteUrl('/icon.svg'),
    description:
      'Производственный инструмент для торцевых разделочных досок: узор, схема распила и переклеек, расчёт материала и себестоимости.',
  }
}

export function websiteJsonLd(): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': WEBSITE_ID,
    name: 'Endgrain App',
    url: siteUrl(),
    inLanguage: 'ru',
    publisher: { '@id': ORG_ID },
  }
}

/** Фичи продукта, перечисленные как есть, не как маркетинговый список. */
const FEATURE_LIST: readonly string[] = [
  'Редактор узора торцевой доски',
  'Схема распила и переклеек',
  'Расчёт материала, отходов и себестоимости',
  'Печатная инструкция в PDF',
]

export function softwareApplicationJsonLd(): Record<string, unknown> {
  return {
    '@type': 'SoftwareApplication',
    name: 'Endgrain App',
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    url: APP_ORIGIN,
    offers: [
      { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free' },
      { '@type': 'Offer', price: '9', priceCurrency: 'USD', name: 'Pro monthly', priceSpecification: { '@type': 'UnitPriceSpecification', price: '9', priceCurrency: 'USD', unitText: 'MONTH' } },
      { '@type': 'Offer', price: '90', priceCurrency: 'USD', name: 'Pro yearly', priceSpecification: { '@type': 'UnitPriceSpecification', price: '90', priceCurrency: 'USD', unitText: 'YEAR' } },
      { '@type': 'Offer', price: '20', priceCurrency: 'USD', name: 'Developer monthly', priceSpecification: { '@type': 'UnitPriceSpecification', price: '20', priceCurrency: 'USD', unitText: 'MONTH' } },
      { '@type': 'Offer', price: '200', priceCurrency: 'USD', name: 'Developer yearly', priceSpecification: { '@type': 'UnitPriceSpecification', price: '200', priceCurrency: 'USD', unitText: 'YEAR' } },
    ],
    featureList: FEATURE_LIST,
  }
}

/** @graph для лендинга: Organization + WebSite + SoftwareApplication, связанные через @id. */
export function landingJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@graph': [organizationJsonLd(), websiteJsonLd(), softwareApplicationJsonLd()],
  }
}

/** SoftwareApplication дублируется на /pricing: именно там цены, оттуда Google их и берёт. */
export function pricingJsonLd(): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    ...softwareApplicationJsonLd(),
  }
}

export function blogJsonLd(posts: readonly PostMeta[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    '@id': `${siteUrl('/blog')}#blog`,
    name: 'Блог Endgrain App',
    url: siteUrl('/blog'),
    publisher: { '@id': ORG_ID },
    blogPost: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: siteUrl(`/blog/${post.slug}`),
      datePublished: post.date,
    })),
  }
}

export function breadcrumbListJsonLd(items: readonly BreadcrumbItem[]): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/** @graph для страницы статьи: BlogPosting + BreadcrumbList. */
export function postJsonLd(post: PostMeta): Record<string, unknown> {
  const url = siteUrl(`/blog/${post.slug}`)
  const blogPosting = {
    '@type': 'BlogPosting',
    headline: post.title.slice(0, 110),
    description: post.description,
    image: siteUrl(post.cover),
    datePublished: post.date,
    // dateModified из meta.updated, а не из даты сборки: иначе каждый деплой
    // врал бы, что все статьи обновились сегодня.
    dateModified: post.updated,
    author: { '@type': 'Person', name: 'Endgrain App' },
    publisher: { '@id': ORG_ID },
    inLanguage: post.lang,
    mainEntityOfPage: url,
    keywords: post.tags.join(', '),
  }
  const breadcrumb = breadcrumbListJsonLd([
    { name: 'Endgrain App', url: siteUrl() },
    { name: 'Блог', url: siteUrl('/blog') },
    { name: post.title, url },
  ])
  return {
    '@context': 'https://schema.org',
    '@graph': [blogPosting, breadcrumb],
  }
}
