import { describe, it, expect } from 'vitest'
import { baseDesign } from '@/lib/engine'
import { makeCheckerboard } from '@/lib/designs/samples'
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
