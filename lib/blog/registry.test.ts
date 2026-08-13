import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { POST_METAS } from './registry'

/**
 * Реестр статей собирается руками (импорт по файлу, не сканирование fs на сервере),
 * поэтому новую статью легко физически забыть дописать. Этот тест читает директорию
 * через fs (можно в тесте) и падает, если .mdx-файл есть, а в реестре его нет.
 */
describe('registry', () => {
  it('содержит запись для каждого .mdx файла в content/blog', () => {
    const files = readdirSync(join(process.cwd(), 'content/blog'))
      .filter((name) => name.endsWith('.mdx'))
      .map((name) => name.replace(/\.mdx$/, ''))
      .sort()

    const registered = POST_METAS.map((meta) => meta.slug).sort()

    expect(registered).toEqual(files)
  })

  it('не содержит дублей slug', () => {
    const slugs = POST_METAS.map((meta) => meta.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
