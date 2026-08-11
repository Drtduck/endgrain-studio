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

/** Ссылка важнее автосохранения: человек прислал проект, его и открываем. */
export function readInitialDesign(hash: string): Design | null {
  const raw = hash.replace(/^#/, '')
  if (raw.length > 0) {
    try {
      return decodeDesignFromHash(raw)
    } catch {
      // Битая ссылка не должна стирать локальную работу: молча идём в localStorage.
    }
  }
  return loadFromLocalStorage()
}

export function shareUrl(href: string, design: Design): string {
  const base = href.split('#')[0] ?? href
  return `${base}#${encodeDesignToHash(design)}`
}

/**
 * Единственное место, где стор встречается с браузером: подъём документа при монтировании
 * (после гидратации, поэтому серверная и клиентская разметка совпадают) и автосохранение.
 */
export function useStudioPersistence(): void {
  useEffect(() => {
    const restored = readInitialDesign(window.location.hash)
    if (restored) useStudio.getState().loadDesign(restored)

    const saver = makeDebouncedSaver(saveToLocalStorage)
    const unsubscribe = useStudio.subscribe((state, prev) => {
      const design = selectDesign(state)
      if (design !== selectDesign(prev)) saver.push(design)
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
