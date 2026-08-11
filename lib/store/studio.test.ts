import { describe, it, expect } from 'vitest'
import { baseDesign } from '@/lib/engine'
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
    store.getState().setBoardWidthMm(300)
    store.getState().setBoardLengthMm(400)
    store.getState().setPlaningAllowanceMm(4)
    store.getState().setPlanerWidthMm(250)
    store.getState().setDesignName('Доска для мамы')
    const d = selectDesign(store.getState())
    expect(d.board.targetWidthMm).toBe(300)
    expect(d.board.targetLengthMm).toBe(400)
    expect(d.planingAllowanceMm).toBe(4)
    expect(d.planerWidthMm).toBe(250)
    expect(d.name).toBe('Доска для мамы')
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

  it('resetStudio returns locale, unit and selection to defaults', () => {
    const store = createStudioStore(baseDesign())
    store.getState().setLocale('en')
    store.getState().setUnit('in')
    store.getState().setActiveSpecies('padauk')
    store.getState().selectCell('r1:0')
    store.getState().resetStudio(baseDesign())
    const s = store.getState()
    expect(s.locale).toBe('ru')
    expect(s.unit).toBe('mm')
    expect(s.activeSpeciesId).toBe('walnut')
    expect(s.selectedCellId).toBe(null)
    expect(s.pendingFork).toBe(null)
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
