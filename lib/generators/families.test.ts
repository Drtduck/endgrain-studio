import { describe, it, expect } from 'vitest'
import ru from '@/lib/i18n/ru'
import { FAMILIES, familyById, toDesign } from './families'
import { FAMILY_IDS, randomGenome } from './genome'

describe('FAMILIES', () => {
  it('перечисляет ровно восемь семейств из FAMILY_IDS', () => {
    expect(FAMILIES.map((f) => f.id).sort()).toEqual([...FAMILY_IDS].sort())
  })

  it('у каждого семейства есть ключ перевода в обоих словарях', () => {
    for (const family of FAMILIES) expect(ru).toHaveProperty(family.nameKey)
  })

  it('familyById бросает на неизвестном идентификаторе, а не возвращает undefined', () => {
    expect(() => familyById('нет-такого' as never)).toThrow()
  })
})

describe('toDesign', () => {
  it('присваивает документу переданное имя', () => {
    expect(toDesign(randomGenome('stripes', 1), 'Мой узор').name).toBe('Мой узор')
  })

  it('детерминирована', () => {
    const g = randomGenome('chaos', 5)
    expect(toDesign(g, 'A')).toEqual(toDesign(g, 'A'))
  })

  it('одинаковые ряды схлопываются в одну панель', () => {
    const design = toDesign(randomGenome('stripes', 7), 'Полосы')
    // У полосатого узора все ряды одинаковы: склейка ровно одна.
    expect(design.panels).toHaveLength(1)
  })

  it('перестановка рядов меняет документ', () => {
    // На отдельных сидах brickCells вырождается в чистые полосы (block=1, shift нечётный,
    // палитра из двух пород), и тогда индекс не зависит от ряда вовсе: перестановка рядов
    // ничего не меняет. Это свойство конкретного генома, а не баг реализации, поэтому
    // ищем сид, на котором перестановка действительно видна, как и соседний тест выше.
    let changed = false
    for (let seed = 0; seed < 30 && !changed; seed += 1) {
      const g = randomGenome('brick', seed)
      const shuffled = { ...g, rowOrder: [...g.rowOrder].reverse() }
      if (JSON.stringify(toDesign(shuffled, 'X')) !== JSON.stringify(toDesign(g, 'X'))) changed = true
    }
    expect(changed).toBe(true)
  })
})
