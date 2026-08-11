import { describe, it, expect } from 'vitest'
import { compile } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { SCENE_SCALE, buildInstances, cameraDistance, cellJitter } from './instances'

const model = compile(makeCheckerboard({ cols: 2, rows: 2, cellMm: 30, thicknessMm: 40 }))

describe('cellJitter', () => {
  it('детерминирован и лежит в диапазоне -1..1', () => {
    for (const id of ['r0:0', 'r0:1', 'r1:0', 'r7:11', 'r0:2:3']) {
      const value = cellJitter(id)
      expect(value).toBe(cellJitter(id))
      expect(value).toBeGreaterThanOrEqual(-1)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('разные ячейки получают разные отклонения', () => {
    expect(cellJitter('r0:0')).not.toBe(cellJitter('r0:1'))
  })
})

describe('buildInstances', () => {
  it('раскладывает ячейки по породам и считает общее число', () => {
    const instances = buildInstances(model)
    expect(instances.total).toBe(4)
    expect(instances.groups.map((g) => g.speciesId).sort()).toEqual(['maple', 'walnut'])
    for (const group of instances.groups) {
      expect(group.items).toHaveLength(2)
      expect(group.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('центрирует доску по X и Z и ставит её на нулевую плоскость', () => {
    const instances = buildInstances(model)
    const all = instances.groups.flatMap((g) => g.items)
    const xs = all.map((i) => i.position[0])
    const zs = all.map((i) => i.position[2])
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(0, 9)
    expect(Math.min(...zs) + Math.max(...zs)).toBeCloseTo(0, 9)
    for (const item of all) {
      expect(item.position[1]).toBeCloseTo((40 / 2) * SCENE_SCALE, 9)
      expect(item.scale[1]).toBeCloseTo(40 * SCENE_SCALE, 9)
    }
  })

  it('ужимает ячейку на клеевой зазор, но не в ноль', () => {
    const wide = buildInstances(model, { gapMm: 0 }).groups[0]?.items[0]
    const gapped = buildInstances(model, { gapMm: 4 }).groups[0]?.items[0]
    if (!wide || !gapped) throw new Error('инстансы не построены')
    expect(wide.scale[0]).toBeCloseTo(30 * SCENE_SCALE, 9)
    expect(gapped.scale[0]).toBeCloseTo(26 * SCENE_SCALE, 9)
    const crushed = buildInstances(model, { gapMm: 100 }).groups[0]?.items[0]
    if (!crushed) throw new Error('инстансы не построены')
    expect(crushed.scale[0]).toBeGreaterThan(0)
  })

  it('отдаёт габарит сцены в тех же единицах', () => {
    const instances = buildInstances(model)
    expect(instances.sizeUnits).toEqual([60 * SCENE_SCALE, 40 * SCENE_SCALE, 60 * SCENE_SCALE])
  })

  it('режет по бюджету инстансов и честно об этом сообщает', () => {
    const big = compile(makeCheckerboard({ cols: 8, rows: 8 }))
    const capped = buildInstances(big, { maxInstances: 10 })
    expect(capped.total).toBe(10)
    expect(capped.truncated).toBe(true)
    expect(buildInstances(big).truncated).toBe(false)
  })

  it('пустая модель не ломает сборку', () => {
    const empty = buildInstances({
      widthMm: 0, lengthMm: 0, thicknessMm: 0, cells: [],
      panelLengthsMm: {}, glueUpCount: 0, cutCount: 0, truncated: false,
    })
    expect(empty.groups).toEqual([])
    expect(empty.total).toBe(0)
    expect(cameraDistance(empty)).toBeGreaterThan(0)
  })
})

describe('cameraDistance', () => {
  it('растёт вместе с доской', () => {
    const small = cameraDistance(buildInstances(compile(makeCheckerboard({ cols: 2, rows: 2 }))))
    const large = cameraDistance(buildInstances(compile(makeCheckerboard({ cols: 10, rows: 10 }))))
    expect(large).toBeGreaterThan(small)
  })
})
