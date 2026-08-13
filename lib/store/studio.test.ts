import { describe, it, expect } from 'vitest'
import { baseDesign, isSliceRef, validate, type Design } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
import { seedPopulation } from '@/lib/generators'
import { FAMILY_IDS } from '@/lib/generators/genome'
import { createStudioStore, selectCanRedo, selectCanUndo, selectDesign, selectIsDirty } from './studio'

describe('studio store: settings, selection, history', () => {
  it('starts on the given design with Russian locale and millimetres', () => {
    const s = createStudioStore(baseDesign()).getState()
    expect(selectDesign(s).id).toBe('fixture')
    expect(s.locale).toBe('ru')
    expect(s.unit).toBe('mm')
    expect(s.activeSpeciesId).toBe('walnut')
    expect(selectCanUndo(s)).toBe(false)
  })

  it('changes locale and unit without touching the design history', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setLocale('en')
    store.getState().setUnit('in')
    expect(store.getState().locale).toBe('en')
    expect(store.getState().unit).toBe('in')
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('edits board settings and records one undo step each', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setBoardThicknessMm(50)
    store.getState().setKerfMm(4)
    expect(selectDesign(store.getState()).board.thicknessMm).toBe(50)
    expect(selectDesign(store.getState()).kerfMm).toBe(4)
    store.getState().undo()
    expect(selectDesign(store.getState()).kerfMm).toBe(3)
    expect(selectDesign(store.getState()).board.thicknessMm).toBe(50)
    store.getState().undo()
    expect(selectDesign(store.getState()).board.thicknessMm).toBe(40)
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(selectCanRedo(store.getState())).toBe(true)
    store.getState().redo()
    expect(selectDesign(store.getState()).board.thicknessMm).toBe(50)
  })

  it('ignores a non finite number instead of poisoning the design', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setKerfMm(Number.NaN)
    expect(selectDesign(store.getState()).kerfMm).toBe(3)
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('sets every remaining board field', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setPlaningAllowanceMm(4)
    store.getState().setPlanerWidthMm(250)
    store.getState().setDesignName('Доска для мамы')
    const d = selectDesign(store.getState())
    expect(d.planingAllowanceMm).toBe(4)
    expect(d.planerWidthMm).toBe(250)
    expect(d.name).toBe('Доска для мамы')
  })

  it('setBoardWidthMm rescales every strip width proportionally in one undo step', () => {
    // Панель A: полосы 25+25=50мм ширины (панель B такая же). Удваиваем ширину доски.
    const store = createStudioStore(baseDesign())
    const before = selectDesign(store.getState())
    const beforeWidths = before.panels.map((p) => p.elements.map((el) => (el.kind === 'strip' ? el.widthMm : null)))

    store.getState().setBoardWidthMm(100) // было 50 -> фактор 2

    const after = selectDesign(store.getState())
    expect(after.board.targetWidthMm).toBe(100)
    for (const panel of after.panels) {
      for (const el of panel.elements) {
        if (el.kind === 'strip') expect(el.widthMm).toBe(50)
      }
    }
    expect(selectCanUndo(store.getState())).toBe(true)
    store.getState().undo()
    const reverted = selectDesign(store.getState())
    expect(reverted.board.targetWidthMm).toBe(50)
    expect(
      reverted.panels.map((p) => p.elements.map((el) => (el.kind === 'strip' ? el.widthMm : null))),
    ).toEqual(beforeWidths)
  })

  it('setBoardLengthMm rescales every row thickness proportionally, keeps trims, one undo step', () => {
    const store = createStudioStore(baseDesign())
    const before = selectDesign(store.getState())
    const beforeThicknesses = before.rows.map((r) => r.thicknessMm)
    const beforeTrims = before.rows.map((r) => r.trimMm)

    store.getState().setBoardLengthMm(120) // было 60 -> фактор 2

    const after = selectDesign(store.getState())
    expect(after.board.targetLengthMm).toBe(120)
    for (const row of after.rows) expect(row.thicknessMm).toBe(60)
    expect(after.rows.map((r) => r.trimMm)).toEqual(beforeTrims)
    expect(selectCanUndo(store.getState())).toBe(true)
    store.getState().undo()
    const reverted = selectDesign(store.getState())
    expect(reverted.board.targetLengthMm).toBe(60)
    expect(reverted.rows.map((r) => r.thicknessMm)).toEqual(beforeThicknesses)
  })

  it('крайнее уменьшение ширины доски не роняет стор, а даёт MIN_STRIP_WIDTH при валидации', () => {
    const store = createStudioStore(baseDesign())
    expect(() => store.getState().setBoardWidthMm(0.5)).not.toThrow()
    const design = selectDesign(store.getState())
    expect(design.board.targetWidthMm).toBe(0.5)
    for (const panel of design.panels) {
      for (const el of panel.elements) {
        if (el.kind === 'strip') expect(el.widthMm).toBeGreaterThanOrEqual(0.5)
      }
    }
    expect(validate(design).map((d) => d.code)).toContain('MIN_STRIP_WIDTH')
  })

  it('setBoardWidthMm/LengthMm no-ops on non finite, zero or negative input', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setBoardWidthMm(Number.NaN)
    store.getState().setBoardWidthMm(0)
    store.getState().setBoardWidthMm(-10)
    store.getState().setBoardLengthMm(Number.NaN)
    store.getState().setBoardLengthMm(0)
    store.getState().setBoardLengthMm(-10)
    expect(selectCanUndo(store.getState())).toBe(false)
    const d = selectDesign(store.getState())
    expect(d.board.targetWidthMm).toBe(50)
    expect(d.board.targetLengthMm).toBe(60)
  })

  it('keeps selection out of the undo history', () => {
    const store = createStudioStore(baseDesign())
    store.getState().selectCell('r1:0')
    store.getState().hoverCell('r1:1')
    store.getState().selectPanel('A')
    store.getState().selectRow('r1')
    expect(store.getState().selectedCellId).toBe('r1:0')
    expect(store.getState().hoveredCellId).toBe('r1:1')
    expect(store.getState().selectedPanelId).toBe('A')
    expect(store.getState().selectedRowId).toBe('r1')
    expect(selectCanUndo(store.getState())).toBe(false)
  })

  it('loadDesign swaps the document and forgets the history', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setKerfMm(5)
    store.getState().loadDesign(baseDesign({ id: 'другой', name: 'другой' }))
    expect(selectDesign(store.getState()).id).toBe('другой')
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(selectCanRedo(store.getState())).toBe(false)
  })

  it('resetStudio returns selection to defaults but keeps locale and unit', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setLocale('en')
    store.getState().setUnit('in')
    store.getState().setActiveSpecies('padauk')
    store.getState().selectCell('r1:0')
    store.getState().resetStudio(baseDesign())
    const s = store.getState()
    // Язык и единицы - настройки человека, а не состояние проекта: сброс их не трогает.
    expect(s.locale).toBe('en')
    expect(s.unit).toBe('in')
    expect(s.activeSpeciesId).toBe('walnut')
    expect(s.selectedCellId).toBe(null)
    expect(s.pendingFork).toBe(null)
  })

  it('resetStudio полностью стирает историю правок, выбор ячеек/рядов/полос и подсветку тронутых ячеек', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setKerfMm(4)
    store.getState().setKerfMm(5)
    store.getState().selectRow('r1')
    store.getState().selectPanel('A')
    store.getState().selectStrip(0)
    store.getState().markCellTouched('r1:0')
    expect(selectCanUndo(store.getState())).toBe(true)

    store.getState().resetStudio(baseDesign())
    const s = store.getState()
    expect(selectCanUndo(s)).toBe(false)
    expect(selectCanRedo(s)).toBe(false)
    expect(s.history.past).toHaveLength(0)
    expect(s.history.future).toHaveLength(0)
    expect(s.selectedRowId).toBe(null)
    expect(s.selectedPanelId).toBe(null)
    expect(s.selectedStripIndex).toBe(null)
    expect(s.touchedCellIds.size).toBe(0)
    expect(s.documentTouched).toBe(false)
  })

  it('fresh sample is not dirty, but loadDesign marks it dirty even though history is empty', () => {
    const store = createStudioStore(baseDesign())
    expect(selectIsDirty(store.getState())).toBe(false)

    // Восстановление из localStorage/ссылки идёт через loadDesign и обнуляет историю,
    // поэтому canUndo/canRedo тут ничего не скажут - это регрессия на потерю данных из ревью.
    store.getState().loadDesign(baseDesign({ id: 'восстановленный', name: 'восстановленный' }))
    expect(selectCanUndo(store.getState())).toBe(false)
    expect(selectCanRedo(store.getState())).toBe(false)
    expect(selectIsDirty(store.getState())).toBe(true)
  })

  it('a real edit marks the document dirty, and resetStudio clears the flag again', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setKerfMm(5)
    expect(selectIsDirty(store.getState())).toBe(true)
    store.getState().resetStudio(baseDesign())
    expect(selectIsDirty(store.getState())).toBe(false)
  })
})

describe('вкладки студии', () => {
  it('стартует в редакторе и переключается', () => {
    const store = createStudioStore(baseDesign())
    expect(store.getState().view).toBe('editor')
    store.getState().setView('view3d')
    expect(store.getState().view).toBe('view3d')
  })

  it('загрузка документа не сбрасывает вкладку, а сброс студии сбрасывает', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setView('view3d')
    store.getState().loadDesign(makeCheckerboard({ cols: 2, rows: 2 }))
    expect(store.getState().view).toBe('view3d')
    store.getState().resetStudio()
    expect(store.getState().view).toBe('editor')
  })
})

describe('состояние вкладок генератора и фото', () => {
  it('по умолчанию пусто', () => {
    const store = createStudioStore()
    expect(store.getState().generator).toBe(null)
    expect(store.getState().photo).toBe(null)
  })

  it('знает про пять вкладок', () => {
    const store = createStudioStore()
    for (const view of ['editor', 'templates', 'generate', 'photo', 'view3d'] as const) {
      store.getState().setView(view)
      expect(store.getState().view).toBe(view)
    }
  })

  it('хранит популяцию между переключениями вкладок', () => {
    const store = createStudioStore()
    const population = seedPopulation(1, FAMILY_IDS)
    store.getState().setGenerator({ population, favouriteIds: ['g1i0'] })
    store.getState().setView('editor')
    store.getState().setView('generate')
    expect(store.getState().generator?.population.items).toHaveLength(9)
    expect(store.getState().generator?.favouriteIds).toEqual(['g1i0'])
  })

  it('загрузка документа из генератора не стирает популяцию', () => {
    const store = createStudioStore()
    store.getState().setGenerator({ population: seedPopulation(2, FAMILY_IDS), favouriteIds: [] })
    store.getState().loadDesign(makeCheckerboard())
    expect(store.getState().generator).not.toBe(null)
    expect(store.getState().documentTouched).toBe(true)
  })

  it('resetStudio сбрасывает обе панели', () => {
    const store = createStudioStore()
    store.getState().setGenerator({ population: seedPopulation(3, FAMILY_IDS), favouriteIds: [] })
    store.getState().setPhoto({
      grid: { cols: 2, rows: 2, rgba: new Uint8ClampedArray(16) },
      fileName: 'x.png',
      colors: 3,
      panels: 2,
    })
    store.getState().resetStudio()
    expect(store.getState().generator).toBe(null)
    expect(store.getState().photo).toBe(null)
    expect(store.getState().view).toBe('editor')
  })

  it('setPhoto(null) очищает картинку', () => {
    const store = createStudioStore()
    store.getState().setPhoto({
      grid: { cols: 1, rows: 1, rgba: new Uint8ClampedArray(4) },
      fileName: 'y.png',
      colors: 2,
      panels: 1,
    })
    store.getState().setPhoto(null)
    expect(store.getState().photo).toBe(null)
  })
})

/**
 * Панель MAIN из 4 колонок SliceRef на INNER: та же раскладка, что и chevronMain
 * (lib/designs/templates.ts) - толщина 70 мм, угол чередуется 45/-45/45/-45, offsetMm по
 * канонической сцепке base_{k+1} = base_k + t_k * tan(phi_k) при base_0 = 0.
 */
function chevronLikeDesign(): Design {
  const angles = [45, -45, 45, -45]
  const elements: Array<{ kind: 'sliceRef'; panelId: string; thicknessMm: number; angleDeg: number; offsetMm: number }> = []
  let base = 0
  for (const angleDeg of angles) {
    elements.push({ kind: 'sliceRef', panelId: 'INNER', thicknessMm: 70, angleDeg, offsetMm: base })
    base += 70 * Math.tan((angleDeg * Math.PI) / 180)
  }
  return baseDesign({
    panels: [
      { id: 'INNER', elements: [{ kind: 'strip', speciesId: 'walnut', widthMm: 250 }] },
      { id: 'MAIN', elements },
    ],
    rows: [{ id: 'r1', panelId: 'MAIN', thicknessMm: 30, angleDeg: 0, flip: false, mirror: false, trimMm: 5 }],
  })
}

describe('setSliceAngle: пересчёт offsetMm хвоста цепочки', () => {
  it('смена угла колонки 0 пересчитывает offsetMm колонок 1-3 по правилу сцепки, колонку 0 не трогает', () => {
    const store = createStudioStore(chevronLikeDesign())
    store.getState().setSliceAngle('MAIN', 0, 30)

    const main = selectDesign(store.getState()).panels.find((p) => p.id === 'MAIN')!
    const refs = main.elements.filter(isSliceRef)
    expect(refs).toHaveLength(4)

    const rad30 = (30 * Math.PI) / 180
    const rad45 = (45 * Math.PI) / 180
    expect(refs[0]!.angleDeg).toBe(30)
    expect(refs[0]!.offsetMm).toBe(0) // офсет самой изменённой колонки не пересчитывается

    const expected1 = 0 + 70 * Math.tan(rad30)
    const expected2 = expected1 + 70 * Math.tan(-rad45) // колонка 1 сохранила свой угол -45
    const expected3 = expected2 + 70 * Math.tan(rad45) // колонка 2 сохранила свой угол 45
    expect(refs[1]!.offsetMm).toBeCloseTo(expected1, 9)
    expect(refs[2]!.offsetMm).toBeCloseTo(expected2, 9)
    expect(refs[3]!.offsetMm).toBeCloseTo(expected3, 9)
    // Углы соседей не меняются - меняется только offsetMm хвоста.
    expect(refs[1]!.angleDeg).toBe(-45)
    expect(refs[2]!.angleDeg).toBe(45)
    expect(refs[3]!.angleDeg).toBe(-45)
  })

  it('смена угла средней колонки не трогает offsetMm колонок ДО неё', () => {
    const store = createStudioStore(chevronLikeDesign())
    const before = selectDesign(store.getState())
      .panels.find((p) => p.id === 'MAIN')!
      .elements.filter(isSliceRef)
      .map((r) => r.offsetMm)

    store.getState().setSliceAngle('MAIN', 2, 10)

    const after = selectDesign(store.getState())
      .panels.find((p) => p.id === 'MAIN')!
      .elements.filter(isSliceRef)
    expect(after[0]!.offsetMm).toBe(before[0])
    expect(after[1]!.offsetMm).toBe(before[1])
    expect(after[2]!.angleDeg).toBe(10)
    expect(after[2]!.offsetMm).toBe(before[2]) // офсет изменённой колонки не пересчитывается

    const rad10 = (10 * Math.PI) / 180
    const radMinus45 = (-45 * Math.PI) / 180
    const expected3 = before[2]! + 70 * Math.tan(rad10)
    expect(after[3]!.offsetMm).toBeCloseTo(expected3, 9)
    expect(after[3]!.angleDeg).toBe(-45)
    void radMinus45
  })

  it('записывает один шаг истории (undo откатывает всю цепочку разом)', () => {
    const store = createStudioStore(chevronLikeDesign())
    expect(selectCanUndo(store.getState())).toBe(false)
    store.getState().setSliceAngle('MAIN', 0, 30)
    expect(selectCanUndo(store.getState())).toBe(true)
    store.getState().undo()
    const main = selectDesign(store.getState()).panels.find((p) => p.id === 'MAIN')!
    const refs = main.elements.filter(isSliceRef)
    expect(refs[0]!.angleDeg).toBe(45)
    expect(refs[1]!.offsetMm).toBeCloseTo(70, 9)
  })
})
