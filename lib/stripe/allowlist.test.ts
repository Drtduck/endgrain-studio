import { describe, expect, it } from 'vitest'
import { matchesAllowlist, parseAllowlist } from './allowlist'

describe('parseAllowlist', () => {
  it('разбирает список через запятую и приводит к нижнему регистру', () => {
    expect(parseAllowlist('A@example.com, b@Example.com')).toEqual(['a@example.com', 'b@example.com'])
  })

  it('пустая переменная даёт пустой список, а не список из пустой строки', () => {
    expect(parseAllowlist('')).toEqual([])
    expect(parseAllowlist('  ,  ,')).toEqual([])
  })
})

describe('matchesAllowlist', () => {
  const LIST = 'jury@endgrain.app, drtloki@gmail.com'

  it('адрес из списка проходит независимо от регистра и пробелов', () => {
    expect(matchesAllowlist('  Jury@Endgrain.app ', LIST)).toBe(true)
    expect(matchesAllowlist('drtloki@gmail.com', LIST)).toBe(true)
  })

  it('чужой адрес не проходит', () => {
    expect(matchesAllowlist('someone@example.com', LIST)).toBe(false)
  })

  it('пустой список не пускает никого: это главное свойство', () => {
    expect(matchesAllowlist('drtloki@gmail.com', '')).toBe(false)
  })

  it('пустой или отсутствующий адрес не совпадает даже с пустым элементом списка', () => {
    expect(matchesAllowlist('', LIST)).toBe(false)
    expect(matchesAllowlist(null, LIST)).toBe(false)
    expect(matchesAllowlist(undefined, ' , ')).toBe(false)
  })

  it('подстрока не считается совпадением', () => {
    expect(matchesAllowlist('jury@endgrain.app.evil.com', LIST)).toBe(false)
    expect(matchesAllowlist('xjury@endgrain.app', LIST)).toBe(false)
  })
})
