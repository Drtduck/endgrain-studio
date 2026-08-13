import { describe, expect, it } from 'vitest'
import { generateApiKey, hashApiKey, parseApiKey, PREFIX_PATTERN, timingSafeEqualHex } from './keys'

// Та же строка регулярки, что и в SQL-констрейнте api_keys_prefix_fmt миграции
// 20260813120000_agent_api_keys.sql. Дубль осознанный: он ловит расхождение
// кода и миграции, если одну из сторон поправят и забудут про вторую.
const SQL_PREFIX_PATTERN = /^egs_(live|test)_[0-9a-z]{8}$/

describe('lib/api/keys', () => {
  it('сгенерированный ключ разбирается своей же parseApiKey, префикс совпадает с формой из SQL', async () => {
    const key = await generateApiKey('live')
    const parsed = parseApiKey(key.plaintext)
    expect(parsed).not.toBeNull()
    expect(parsed?.prefix).toBe(key.prefix)
    expect(SQL_PREFIX_PATTERN.test(key.prefix)).toBe(true)
    expect(PREFIX_PATTERN.test(key.prefix)).toBe(true)
  })

  it('test-ключ тоже проходит форму', async () => {
    const key = await generateApiKey('test')
    expect(SQL_PREFIX_PATTERN.test(key.prefix)).toBe(true)
  })

  it('hashApiKey даёт 64 hex-символа в нижнем регистре и стабилен между вызовами', async () => {
    const hash1 = await hashApiKey('egs_live_a3f9c204_abc')
    const hash2 = await hashApiKey('egs_live_a3f9c204_abc')
    expect(hash1).toMatch(/^[0-9a-f]{64}$/)
    expect(hash1).toBe(hash2)
  })

  it('timingSafeEqualHex даёт false на разной длине и на отличии в последнем символе', () => {
    expect(timingSafeEqualHex('ab', 'abc')).toBe(false)
    expect(timingSafeEqualHex('aaaa', 'aaab')).toBe(false)
    expect(timingSafeEqualHex('aaaa', 'aaaa')).toBe(true)
  })

  it.each(['', 'Bearer ', 'egs_live_короткий', 'egs_live_a3f9c2😀4_' + 'x'.repeat(43)])(
    'мусорный вход %s возвращает null, а не бросает',
    (raw) => {
      expect(() => parseApiKey(raw)).not.toThrow()
      expect(parseApiKey(raw)).toBeNull()
    },
  )
})
