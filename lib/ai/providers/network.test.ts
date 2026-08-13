import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Структурный тест по образцу lib/ai/freeFeatures.test.ts: генерация изображений
 * ходит наружу только через lib/ai/providers, а не прямым fetch из действия
 * или компонента. Так рефакторинг на fal не потеряется в следующей правке,
 * которая по инерции добавит второй прямой вызов рядом с провайдерами.
 *
 * lib/promo/visionAnalyze.ts - единственное осознанное исключение: разбор
 * референса это vision-задача с другой формой ответа (структурированный JSON,
 * а не картинка), не подходит под интерфейс ImageProvider и не имеет fallback
 * по дизайну (см. docs/superpowers/specs/2026-08-13-fal-fallback-design.md, 2.5).
 */
const ROOTS = ['app/actions', 'components']
const HOSTS = ['generativelanguage.googleapis.com', 'fal.run', 'fal.ai']

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const rel = relative(process.cwd(), full)
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) continue
      out.push(rel)
    }
  }
  walk(join(process.cwd(), root))
  return out
}

const FILES = ROOTS.flatMap(sourceFiles)

describe('сетевой ход к моделям изображений идёт только через lib/ai/providers', () => {
  it('находит исходники, а не пустой список', () => {
    expect(FILES.length).toBeGreaterThan(10)
  })

  for (const file of FILES) {
    it(`${file} не обращается к API моделей напрямую`, () => {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      for (const host of HOSTS) expect(source, `${file} содержит ${host}`).not.toContain(host)
    })
  }

  it('ловит подсунутый прямой fetch на домен модели', () => {
    const fake = "fetch('https://generativelanguage.googleapis.com/v1beta/models/x:generateContent')"
    expect(HOSTS.some((host) => fake.includes(host))).toBe(true)
  })
})
