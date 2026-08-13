import { describe, expect, it } from 'vitest'
import { APP_ORIGIN, SITE_ORIGIN } from '@/lib/routing/host'
import { appUrl, pageMetadata, siteUrl } from './metadata'

describe('siteUrl / appUrl', () => {
  it('собирает абсолютный адрес на домене лендинга', () => {
    expect(siteUrl('/blog')).toBe(`${SITE_ORIGIN}/blog`)
    expect(siteUrl()).toBe(SITE_ORIGIN)
  })

  it('собирает абсолютный адрес на домене студии', () => {
    expect(appUrl('/pricing')).toBe(`${APP_ORIGIN}/pricing`)
  })
})

describe('pageMetadata', () => {
  it('собирает канон, OG и twitter из общего набора полей', () => {
    const meta = pageMetadata({
      title: 'Заголовок',
      description: 'Описание',
      canonical: siteUrl('/blog'),
      locale: 'ru',
    })
    expect(meta.alternates?.canonical).toBe(siteUrl('/blog'))
    expect(meta.openGraph?.locale).toBe('ru_RU')
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' })
  })

  it('en выставляет en_US в openGraph.locale', () => {
    const meta = pageMetadata({
      title: 'Title',
      description: 'Description',
      canonical: siteUrl('/blog'),
      locale: 'en',
    })
    expect(meta.openGraph?.locale).toBe('en_US')
  })

  it('noIndex проставляет robots index:false, follow:true', () => {
    const meta = pageMetadata({
      title: 'Заголовок',
      description: 'Описание',
      canonical: siteUrl('/blog/tag/raskroi'),
      locale: 'ru',
      noIndex: true,
    })
    expect(meta.robots).toMatchObject({ index: false, follow: true })
  })

  it('без noIndex поле robots не проставляется', () => {
    const meta = pageMetadata({
      title: 'Заголовок',
      description: 'Описание',
      canonical: siteUrl('/blog'),
      locale: 'ru',
    })
    expect(meta.robots).toBeUndefined()
  })

  it('image добавляет картинку в openGraph и twitter', () => {
    const image = siteUrl('/blog/kerf-i-pripuski/cover.jpg')
    const meta = pageMetadata({
      title: 'Заголовок',
      description: 'Описание',
      canonical: siteUrl('/blog/kerf-i-pripuski'),
      locale: 'ru',
      image,
    })
    expect(meta.openGraph?.images).toEqual([{ url: image }])
    expect(meta.twitter?.images).toEqual([{ url: image }])
  })
})
