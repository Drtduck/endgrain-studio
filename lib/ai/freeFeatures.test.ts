import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Узор по фото считается локально, k-means крутится в браузере, наружу не уходит
 * ни байта и денег это не стоит. Значит гейта на нём быть не должно: платим
 * только за то, за что платим сами.
 *
 * Тест структурный, как lib/export/purity.test.ts: он ловит момент, когда кто-то
 * по инерции навесит проверку Pro на бесплатную фичу.
 */
const GATE_MARKERS = ['assertAiAllowed', 'entitlements', 'usePro', 'useAiGate', 'AiGateNote', 'getProStatus']

function sourcesOf(dir: string): readonly [name: string, source: string][] {
  return readdirSync(join(process.cwd(), dir))
    .filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
    .map((name) => [`${dir}/${name}`, readFileSync(join(process.cwd(), dir, name), 'utf8')] as const)
}

describe('узор по фото остаётся бесплатным', () => {
  for (const [path, source] of sourcesOf('lib/photo')) {
    it(`${path} не знает ни про Pro, ни про квоту`, () => {
      for (const marker of GATE_MARKERS) expect(source, `${path} содержит ${marker}`).not.toContain(marker)
    })

    it(`${path} считает локально и в сеть не ходит`, () => {
      expect(source).not.toContain('fetch(')
      expect(source).not.toContain("'use server'")
    })
  }

  it('панель импорта фото не спрашивает разрешения у сервера', () => {
    const source = readFileSync(join(process.cwd(), 'components/PhotoImport.tsx'), 'utf8')
    for (const marker of GATE_MARKERS) expect(source, `PhotoImport содержит ${marker}`).not.toContain(marker)
    // Серверных действий в панели нет вовсе: всё считает браузер.
    expect(source).not.toContain('@/app/actions/')
  })
})
