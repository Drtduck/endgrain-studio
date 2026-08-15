'use client'

import { useEffect } from 'react'
import type { Design } from '@/lib/engine'
import {
  decodeDesignFromHash,
  encodeDesignToHash,
  loadFromLocalStorage,
  saveToLocalStorage,
} from '@/lib/persist'
import { selectDesign, useStudio } from './studio'

/** Автосохранение раз в две секунды после последней правки, как в спеке. */
export const SAVE_DEBOUNCE_MS = 2000

export interface DebouncedSaver {
  push(design: Design): void
  flush(): void
  cancel(): void
}

export function makeDebouncedSaver(save: (design: Design) => void, delayMs: number = SAVE_DEBOUNCE_MS): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: Design | null = null

  const clear = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  return {
    push(design) {
      pending = design
      clear()
      timer = setTimeout(() => {
        timer = null
        if (pending) save(pending)
        pending = null
      }, delayMs)
    },
    flush() {
      clear()
      if (pending) save(pending)
      pending = null
    },
    cancel() {
      clear()
      pending = null
    },
  }
}

export interface InitialDesign {
  design: Design | null
  /** true, только если документ реально декодирован из хэша, а не подставлен из localStorage. */
  fromHash: boolean
}

/**
 * Id облачного проекта живёт отдельным ключом localStorage, не внутри Design:
 * Design уезжает в хэш-ссылку и в projects.design, и id строки внутри самой
 * строки был бы циклической ссылкой и утечкой чужого id в публичную ссылку
 * (docs/specs/promo-studio.md, раздел 3.2).
 */
export const PROJECT_ID_KEY = 'eg-current-project'

export interface StoredProjectRef {
  readonly id: string
  readonly name: string
  readonly savedAt: number
}

export function saveProjectRef(ref: StoredProjectRef): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PROJECT_ID_KEY, JSON.stringify(ref))
}

export function loadProjectRef(): StoredProjectRef | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(PROJECT_ID_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredProjectRef>
    if (typeof parsed.id !== 'string' || typeof parsed.name !== 'string' || typeof parsed.savedAt !== 'number') return null
    return { id: parsed.id, name: parsed.name, savedAt: parsed.savedAt }
  } catch {
    return null
  }
}

export function clearProjectRef(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(PROJECT_ID_KEY)
}

/** Ссылка важнее автосохранения: человек прислал проект, его и открываем. */
export function readInitialDesignDetailed(hash: string): InitialDesign {
  const raw = hash.replace(/^#/, '')
  if (raw.length > 0) {
    try {
      return { design: decodeDesignFromHash(raw), fromHash: true }
    } catch {
      // Битая ссылка не должна стирать локальную работу: молча идём в localStorage.
    }
  }
  return { design: loadFromLocalStorage(), fromHash: false }
}

/** Ссылка важнее автосохранения: человек прислал проект, его и открываем. */
export function readInitialDesign(hash: string): Design | null {
  return readInitialDesignDetailed(hash).design
}

export function shareUrl(href: string, design: Design): string {
  const base = href.split('#')[0] ?? href
  return `${base}#${encodeDesignToHash(design)}`
}

/**
 * Стирает хэш из адресной строки после того, как документ из него восстановлен.
 * Иначе ссылка на снимок навсегда перевешивает автосохранение: любая правка уйдёт
 * в localStorage, но при перезагрузке хэш опять победит и молча съест эти правки.
 */
function clearHashFromAddressBar(): void {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

/**
 * Единственное место, где стор встречается с браузером: подъём документа при монтировании
 * (после гидратации, поэтому серверная и клиентская разметка совпадают) и автосохранение.
 */
export function useStudioPersistence(): void {
  useEffect(() => {
    const { design: restored, fromHash } = readInitialDesignDetailed(window.location.hash)
    if (restored) useStudio.getState().loadDesign(restored)
    if (restored && fromHash) clearHashFromAddressBar()

    // projectId восстанавливается ТОЛЬКО если документ пришёл из localStorage, не из хэша:
    // пришедший по ссылке чужой узор не имеет права перезаписать мою привязку к проекту
    // (docs/specs/promo-studio.md, раздел 3.2). loadDesign выше уже сбросил currentProjectId
    // в null для любого источника - здесь мы либо оставляем его null (хэш/пусто), либо
    // восстанавливаем поверх.
    if (restored && !fromHash) {
      const ref = loadProjectRef()
      if (ref) useStudio.getState().restoreCurrentProjectId(ref.id)
    }

    const saver = makeDebouncedSaver(saveToLocalStorage)
    const unsubscribe = useStudio.subscribe((state, prev) => {
      const design = selectDesign(state)
      if (design !== selectDesign(prev)) {
        // resetStudio уводит documentTouched в false вместе со сменой документа - это единственный
        // случай, когда design меняется таким образом. Обычный дебаунс в 2 с здесь опасен: если
        // человек перезагрузит страницу раньше, localStorage ещё хранит стёртый проект, и сброс
        // «воскреснет» после reload. Поэтому сброс пишется в localStorage немедленно.
        if (!state.documentTouched) {
          saver.cancel()
          saveToLocalStorage(design)
        } else {
          saver.push(design)
        }
      }

      // currentProjectId - отдельный ключ, синхронизируется отдельно от дебаунса документа:
      // привязка/отвязка от облачного проекта это не правка геометрии, откладывать её на
      // 2 секунды незачем, а потерять на pagehide до флаша - можно (см. persist.ts:117).
      if (state.currentProjectId !== prev.currentProjectId) {
        if (state.currentProjectId === null) {
          clearProjectRef()
        } else {
          saveProjectRef({ id: state.currentProjectId, name: design.name, savedAt: Date.now() })
        }
      }
    })
    const onHide = (): void => saver.flush()
    window.addEventListener('pagehide', onHide)

    return () => {
      unsubscribe()
      window.removeEventListener('pagehide', onHide)
      saver.flush()
    }
  }, [])
}
