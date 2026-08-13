import { describe, expect, it } from 'vitest'
import { LEGAL_DOCS } from './index'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

describe('lib/legal', () => {
  for (const [slug, byLocale] of Object.entries(LEGAL_DOCS)) {
    describe(slug, () => {
      it('есть обе локали', () => {
        expect(byLocale.ru).toBeDefined()
        expect(byLocale.en).toBeDefined()
      })

      it('заголовок непустой в обеих локалях', () => {
        expect(byLocale.ru.title.length).toBeGreaterThan(0)
        expect(byLocale.en.title.length).toBeGreaterThan(0)
      })

      it('updatedAt - валидная ISO-дата в обеих локалях', () => {
        expect(byLocale.ru.updatedAt).toMatch(ISO_DATE)
        expect(byLocale.en.updatedAt).toMatch(ISO_DATE)
        expect(Number.isNaN(new Date(byLocale.ru.updatedAt).getTime())).toBe(false)
        expect(Number.isNaN(new Date(byLocale.en.updatedAt).getTime())).toBe(false)
      })

      it('одинаковое число секций в ru и en', () => {
        expect(byLocale.ru.sections.length).toBe(byLocale.en.sections.length)
        expect(byLocale.ru.sections.length).toBeGreaterThan(0)
      })

      it('ни одной пустой секции', () => {
        for (const locale of ['ru', 'en'] as const) {
          for (const section of byLocale[locale].sections) {
            expect(section.heading.length, `${slug}/${locale}`).toBeGreaterThan(0)
            expect(section.paragraphs.length, `${slug}/${locale}`).toBeGreaterThan(0)
            for (const paragraph of section.paragraphs) {
              expect(paragraph.length, `${slug}/${locale}`).toBeGreaterThan(0)
            }
          }
        }
      })

      it('не содержит длинного тире', () => {
        const EM_DASH = String.fromCharCode(0x2014)
        for (const locale of ['ru', 'en'] as const) {
          for (const section of byLocale[locale].sections) {
            expect(section.heading.includes(EM_DASH), `${slug}/${locale} heading`).toBe(false)
            for (const paragraph of section.paragraphs) {
              expect(paragraph.includes(EM_DASH), `${slug}/${locale} paragraph`).toBe(false)
            }
          }
        }
      })
    })
  }
})
