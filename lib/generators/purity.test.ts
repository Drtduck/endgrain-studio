import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIRS = ['lib/generators', 'lib/photo', 'lib/designs', 'lib/species']
const EM_DASH = String.fromCharCode(0x2014)

function sourceFiles(): string[] {
  const out: string[] = []
  for (const dir of DIRS) {
    let entries: string[] = []
    try {
      entries = readdirSync(dir)
    } catch {
      // Каталог lib/photo появляется в восьмой задаче: до неё тест просто его пропускает.
      continue
    }
    for (const entry of entries) {
      if (!entry.endsWith('.ts')) continue
      out.push(join(dir, entry))
    }
  }
  return out
}

describe('чистота генеративных модулей', () => {
  it('находит исходники', () => {
    expect(sourceFiles().length).toBeGreaterThan(5)
  })

  it('нигде не зовёт Math.random, Date.now и crypto', () => {
    // Проверяем именно вызов ("Math.random("), а не упоминание в прозе: random.ts
    // документирует запрет словами «Math.random в lib запрещён» безо всякого вызова,
    // а этот тест печатает имена запрещённых вызовов в сообщениях assert. Оба случая
    // не должны считаться нарушением.
    for (const file of sourceFiles()) {
      if (file.endsWith('purity.test.ts')) continue
      const source = readFileSync(file, 'utf8')
      expect(source.includes('Math.random('), file).toBe(false)
      expect(source.includes('Date.now('), file).toBe(false)
      expect(source.includes('getRandomValues('), file).toBe(false)
      expect(source.includes('performance.now('), file).toBe(false)
    }
  })

  it('не тянет DOM внутрь lib', () => {
    for (const file of sourceFiles()) {
      if (file.endsWith('.test.ts')) continue
      const source = readFileSync(file, 'utf8')
      for (const forbidden of ['document.', 'window.', 'HTMLCanvas', 'createImageBitmap', 'OffscreenCanvas']) {
        expect(source.includes(forbidden), `${file}: ${forbidden}`).toBe(false)
      }
    }
  })

  it('нигде не использует длинное тире', () => {
    for (const file of sourceFiles()) {
      expect(readFileSync(file, 'utf8').includes(EM_DASH), file).toBe(false)
    }
  })
})
