import { describe, it, expect } from 'vitest'
import { compile, polygonAreaMm2, baseDesign, stripsPanel, type Design } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { SCENE_SCALE, buildInstances, cameraDistance, cellJitter, type BoardScene, type InstancedScene, type MergedScene } from './instances'

const model = compile(makeCheckerboard({ cols: 2, rows: 2, cellMm: 30, thicknessMm: 40 }))

/** Прямой узор всегда даёт instanced-сцену - сужает тип для тестов, которым нужны `.items`. */
function asInstanced(scene: BoardScene): InstancedScene {
  if (scene.kind !== 'instanced') throw new Error('ожидалась instanced-сцена')
  return scene
}

/** Одна колонка с угловым срезом: две ячейки, обе с `poly` (см. lib/engine/compile.angled.test.ts). */
function angledDesign(): Design {
  return baseDesign({
    panels: [
      stripsPanel('Q', ['walnut', 'maple'], 12),
      { id: 'P', elements: [{ kind: 'sliceRef', panelId: 'Q', thicknessMm: 10, angleDeg: 30, offsetMm: 0 }] },
    ],
    rows: [{ id: 'r1', panelId: 'P', thicknessMm: 12, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
  })
}

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
    const instances = asInstanced(buildInstances(model))
    expect(instances.total).toBe(4)
    expect(instances.groups.map((g) => g.speciesId).sort()).toEqual(['maple', 'walnut'])
    for (const group of instances.groups) {
      expect(group.items).toHaveLength(2)
      expect(group.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('центрирует доску по X и Z и ставит её на нулевую плоскость', () => {
    const instances = asInstanced(buildInstances(model))
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
    const wide = asInstanced(buildInstances(model, { gapMm: 0 })).groups[0]?.items[0]
    const gapped = asInstanced(buildInstances(model, { gapMm: 4 })).groups[0]?.items[0]
    if (!wide || !gapped) throw new Error('инстансы не построены')
    expect(wide.scale[0]).toBeCloseTo(30 * SCENE_SCALE, 9)
    expect(gapped.scale[0]).toBeCloseTo(26 * SCENE_SCALE, 9)
    const crushed = asInstanced(buildInstances(model, { gapMm: 100 })).groups[0]?.items[0]
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

describe('buildInstances: угловые узоры (слитая геометрия)', () => {
  it('модель хотя бы с одной поли-ячейкой уходит в путь merged, а не instanced', () => {
    const scene = buildInstances(compile(angledDesign()))
    expect(scene.kind).toBe('merged')
  })

  it('число треугольников и вершин на ячейку соответствует экструзии n-угольника: 4n-4 треугольника без индексации', () => {
    // Без зазора, чтобы число вершин полигона после insetConvex не менялось (иначе оно не 4n-4 предсказуемо).
    const m = compile(angledDesign())
    const scene = buildInstances(m, { gapMm: 0 }) as MergedScene
    expect(scene.kind).toBe('merged')

    const cellsWithPoly = m.cells.filter((c) => c.poly)
    expect(cellsWithPoly.length).toBeGreaterThan(0)

    let expectedTriangles = 0
    for (const cell of cellsWithPoly) {
      const n = cell.poly!.length
      expectedTriangles += 4 * n - 4
    }
    const expectedVertices = expectedTriangles * 3

    const totalVertices = scene.groups.reduce((s, g) => s + g.positions.length / 3, 0)
    expect(totalVertices).toBe(expectedVertices)
    for (const group of scene.groups) {
      expect(group.normals.length).toBe(group.positions.length)
      expect(group.jitters.length).toBe(group.positions.length / 3)
    }
  })

  it('объём слитой геометрии равен сумме площадей ячеек на толщину доски (инвариант «без дыр»)', () => {
    const m = compile(angledDesign())
    const scene = buildInstances(m, { gapMm: 0 }) as MergedScene

    // Объём через дивергентную теорему был бы избыточен для теста: проще и надёжнее проверить
    // ту же величину, которую независимо доказывает property-тест движка - сумму площадей поли.
    const areaSum = m.cells.reduce((s, c) => s + polygonAreaMm2(c.poly ?? []), 0)
    const expectedVolumeUnits = areaSum * SCENE_SCALE * SCENE_SCALE * (m.thicknessMm * SCENE_SCALE)

    // Считаем объём по треугольникам призмы: сумма (площадь треугольника top/bottom) * толщина
    // плюс боковые стенки, которые в сумме дают ноль вклада в объём по формуле дивергенции для
    // призмы - проверяем через прямое суммирование объёма каждой тройки top/bottom вершин.
    let volumeUnits = 0
    for (const group of scene.groups) {
      const pos = group.positions
      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i]!, ay = pos[i + 1]!, az = pos[i + 2]!
        const bx = pos[i + 3]!, by = pos[i + 4]!, bz = pos[i + 5]!
        const cx = pos[i + 6]!, cy = pos[i + 7]!, cz = pos[i + 8]!
        // Объём тетраэдра (0,0,0)-A-B-C, знаковый: суммарно по замкнутой поверхности даёт объём тела.
        volumeUnits += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
      }
    }
    expect(Math.abs(volumeUnits)).toBeCloseTo(expectedVolumeUnits, 9)
  })

  it('нормаль каждого треугольника действительно смотрит наружу (совпадает по знаку с посчитанной геометрически)', () => {
    const m = compile(angledDesign())
    const scene = buildInstances(m, { gapMm: 0 }) as MergedScene
    for (const group of scene.groups) {
      const pos = group.positions
      const nrm = group.normals
      for (let i = 0; i < pos.length; i += 9) {
        const ax = pos[i]!, ay = pos[i + 1]!, az = pos[i + 2]!
        const bx = pos[i + 3]!, by = pos[i + 4]!, bz = pos[i + 5]!
        const cx = pos[i + 6]!, cy = pos[i + 7]!, cz = pos[i + 8]!
        const e1x = bx - ax, e1y = by - ay, e1z = bz - az
        const e2x = cx - ax, e2y = cy - ay, e2z = cz - az
        const geomNx = e1y * e2z - e1z * e2y
        const geomNy = e1z * e2x - e1x * e2z
        const geomNz = e1x * e2y - e1y * e2x
        const storedNx = nrm[i]!, storedNy = nrm[i + 1]!, storedNz = nrm[i + 2]!
        const dot = geomNx * storedNx + geomNy * storedNy + geomNz * storedNz
        // Треугольник вырожденный (боковая грань горизонтального ребра) даёт geomN ~ 0 - пропускаем.
        const geomLen = Math.hypot(geomNx, geomNy, geomNz)
        if (geomLen < 1e-12) continue
        expect(dot).toBeGreaterThan(0)
      }
    }
  })
})

describe('cameraDistance', () => {
  it('растёт вместе с доской', () => {
    const small = cameraDistance(buildInstances(compile(makeCheckerboard({ cols: 2, rows: 2 }))))
    const large = cameraDistance(buildInstances(compile(makeCheckerboard({ cols: 10, rows: 10 }))))
    expect(large).toBeGreaterThan(small)
  })
})
