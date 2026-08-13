import { describe, expect, it } from 'vitest'
import type { PostMeta } from '@/lib/blog/types'
import { buildLlmsTxt } from './llms'

const POST: PostMeta = {
  slug: 'kerf-i-pripuski',
  lang: 'ru',
  title: 'Пропил и припуски',
  description: 'Описание для выдачи',
  answer: 'Первое предложение факта. Второе предложение с подробностями.',
  date: '2026-08-14',
  updated: '2026-08-14',
  tags: ['раскрой'],
  cover: '/blog/kerf-i-pripuski/cover.jpg',
  readingMinutes: 6,
}

describe('buildLlmsTxt', () => {
  it('начинается с H1 и блоквот-описания одной строкой', () => {
    const txt = buildLlmsTxt([POST])
    const lines = txt.split('\n')
    expect(lines[0]).toBe('# Endgrain Studio')
    const firstNonEmpty = lines.slice(1).find((l) => l.trim().length > 0)
    expect(firstNonEmpty?.startsWith('>')).toBe(true)
  })

  it('содержит секции Продукт, Блог, Optional', () => {
    const txt = buildLlmsTxt([POST])
    expect(txt).toContain('## Продукт')
    expect(txt).toContain('## Блог')
    expect(txt).toContain('## Optional')
  })

  it('ссылка на статью использует answer, обрезанный до одного предложения, а не description', () => {
    const txt = buildLlmsTxt([POST])
    expect(txt).toContain('[Пропил и припуски](https://endgrain.app/blog/kerf-i-pripuski): Первое предложение факта.')
    expect(txt).not.toContain('Описание для выдачи')
    expect(txt).not.toContain('Второе предложение с подробностями')
  })

  it('ссылки на продукт и тарифы абсолютные', () => {
    const txt = buildLlmsTxt([POST])
    expect(txt).toContain('[Endgrain Studio](https://endgrain.app)')
    expect(txt).toContain('[Тарифы](https://app.endgrain.app/pricing)')
  })

  it('содержит ссылки на RSS и sitemap', () => {
    const txt = buildLlmsTxt([POST])
    expect(txt).toContain('[RSS](https://endgrain.app/blog/rss.xml)')
    expect(txt).toContain('[Карта сайта](https://endgrain.app/sitemap.xml)')
  })

  it('пустой список статей не ломает файл', () => {
    const txt = buildLlmsTxt([])
    expect(txt).toContain('## Блог')
    expect(txt.startsWith('# Endgrain Studio')).toBe(true)
  })
})
