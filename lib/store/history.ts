import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer'

// Патчи выключены в immer по умолчанию: без этого вызова produceWithPatches бросает.
enablePatches()

/** Потолок стека отмены из спеки: 100 шагов. */
export const HISTORY_LIMIT = 100

export interface HistoryStep {
  readonly patches: readonly Patch[]
  readonly inverse: readonly Patch[]
}

export interface HistoryState<T> {
  readonly present: T
  readonly past: readonly HistoryStep[]
  readonly future: readonly HistoryStep[]
}

export function initHistory<T>(present: T): HistoryState<T> {
  return { present, past: [], future: [] }
}

function pushStep<T>(state: HistoryState<T>, present: T, step: HistoryStep): HistoryState<T> {
  const past = [...state.past, step]
  return { present, past: past.slice(-HISTORY_LIMIT), future: [] }
}

export function commit<T>(state: HistoryState<T>, recipe: (draft: Draft<T>) => void): HistoryState<T> {
  const [present, patches, inverse] = produceWithPatches(state.present, recipe)
  if (patches.length === 0) return state
  return pushStep(state, present, { patches, inverse })
}

/**
 * Коммит готового значения, пришедшего из движка (applyPaint, splitPanel).
 * Присваивание идентичной ссылки immer не считает изменением, поэтому патчи
 * получаются только по реально изменившимся ключам корня.
 */
export function commitValue<T extends object>(state: HistoryState<T>, next: T): HistoryState<T> {
  return commit(state, (draft) => {
    Object.assign(draft, next)
  })
}

/** Загрузка другого документа: история предыдущего к нему неприменима. */
export function resetHistory<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  void state
  return initHistory(next)
}

export function undo<T>(state: HistoryState<T>): HistoryState<T> {
  const step = state.past.at(-1)
  if (!step) return state
  return {
    // applyPatches типизирован через Objectish (immer не знает про произвольный T);
    // present у нас всегда объект/массив, так что каст безопасен.
    present: applyPatches(state.present as object, [...step.inverse]) as T,
    past: state.past.slice(0, -1),
    future: [step, ...state.future],
  }
}

export function redo<T>(state: HistoryState<T>): HistoryState<T> {
  const step = state.future[0]
  if (!step) return state
  return {
    present: applyPatches(state.present as object, [...step.patches]) as T,
    past: [...state.past, step].slice(-HISTORY_LIMIT),
    future: state.future.slice(1),
  }
}

export function canUndo(state: HistoryState<unknown>): boolean {
  return state.past.length > 0
}

export function canRedo(state: HistoryState<unknown>): boolean {
  return state.future.length > 0
}
