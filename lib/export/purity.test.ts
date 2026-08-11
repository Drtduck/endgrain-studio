import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PURE_FILES = ['svg.ts', 'filename.ts', 'index.ts']
const FORBIDDEN = ['document.', 'window.', 'new Blob', 'URL.createObjectURL', 'canvas', 'Math.random', 'Date.now']

describe('чистая половина lib/export', () => {
  for (const file of PURE_FILES) {
    it(`${file} не трогает DOM и не зависит от окружения`, () => {
      const source = readFileSync(join(process.cwd(), 'lib/export', file), 'utf8')
      for (const needle of FORBIDDEN) expect(source, `${file} содержит ${needle}`).not.toContain(needle)
    })
  }

  it('барель не тянет браузерные модули', () => {
    const source = readFileSync(join(process.cwd(), 'lib/export/index.ts'), 'utf8')
    for (const browserOnly of ['./png', './pdf', './download', './pdfFont']) {
      expect(source).not.toContain(browserOnly)
    }
  })
})
