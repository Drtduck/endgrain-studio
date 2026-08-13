import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Барьер против утечки русского в английскую локаль: во всём, что видит пользователь,
 * текста быть не должно вовсе, только ключи словаря. Сканируем исходники и падаем на кириллице.
 */
const ROOTS = ['components', 'app', 'lib/designs', 'lib/generators', 'lib/photo', 'lib/export']

/** Серверные действия и роуты пользователю ничего не рисуют, у них своя жизнь. */
const SKIPPED_DIRS = ['app/actions', 'app/api']

/**
 * global-error рендерится вместо всего документа: ни layout, ни стор студии до него не доходят,
 * язык взять неоткуда, поэтому текст там сознательно двуязычный целиком.
 */
const ALLOWED_FILES = ['app/global-error.tsx']

const CYRILLIC = /[Ѐ-ӿ]/

const MIN_SCANNED_FILES = 60

/**
 * Диагностика для разработчика утечкой не считается: сообщения ошибок движка в интерфейс
 * не попадают (их перехватывает error boundary), а формы множественного числа в plural()
 * это и есть словарь, просто по месту вызова.
 */
function stripNonUiText(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    // Один уровень вложенных скобок нужен для подстановок вида ${String(id)} внутри сообщения.
    .replace(/new [A-Za-z]*Error\((?:[^()]|\([^()]*\))*\)/g, '')
    .replace(/console\.(error|warn|log|info)\([\s\S]*?\)\n/g, '')
    .replace(/\{\s*ru:\s*\[[\s\S]*?\]\s*,\s*en:\s*\[[\s\S]*?\]\s*\}/g, '')
}

function sourceFiles(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      const rel = relative(process.cwd(), full)
      if (SKIPPED_DIRS.some((skip) => rel === skip || rel.startsWith(`${skip}/`))) continue
      if (statSync(full).isDirectory()) {
        walk(full)
        continue
      }
      if (!/\.tsx?$/.test(entry) || entry.includes('.test.')) continue
      if (ALLOWED_FILES.includes(rel)) continue
      out.push(rel)
    }
  }
  walk(join(process.cwd(), root))
  return out
}

const FILES = ROOTS.flatMap(sourceFiles)

describe('в интерфейсе нет захардкоженного русского', () => {
  it('находит исходники, а не пустой список', () => {
    // Битый путь сделал бы этот тест вечнозелёным, поэтому объём скана проверяется отдельно.
    expect(FILES.length).toBeGreaterThan(MIN_SCANNED_FILES)
  })

  for (const file of FILES) {
    it(`${file} не содержит русского текста`, () => {
      const source = stripNonUiText(readFileSync(join(process.cwd(), file), 'utf8'))
      const leaks = source
        .split('\n')
        .map((line, index) => ({ line: line.trim(), number: index + 1 }))
        .filter((entry) => CYRILLIC.test(entry.line))
      expect(leaks.map((l) => `${l.number}: ${l.line}`)).toEqual([])
    })
  }

  it('ловит подсунутую русскую строку в разметке', () => {
    const fake = 'export function X() { return <p>Привет</p> }'
    expect(CYRILLIC.test(stripNonUiText(fake))).toBe(true)
  })
})
