import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { baseDesign } from '@/lib/engine'
import { LS_CURRENT_KEY, encodeDesignToHash, serializeDesign } from '@/lib/persist'
import { makeDebouncedSaver, readInitialDesign, shareUrl, useStudioPersistence, SAVE_DEBOUNCE_MS } from './persist'

describe('makeDebouncedSaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('пишет один раз на серию правок', () => {
    const save = vi.fn()
    const saver = makeDebouncedSaver(save)
    saver.push(baseDesign())
    saver.push(baseDesign({ kerfMm: 4 }))
    saver.push(baseDesign({ kerfMm: 5 }))
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[0]).toMatchObject({ kerfMm: 5 })
  })

  it('flush пишет немедленно и снимает таймер', () => {
    const save = vi.fn()
    const saver = makeDebouncedSaver(save)
    saver.push(baseDesign())
    saver.flush()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('cancel отменяет запись', () => {
    const save = vi.fn()
    const saver = makeDebouncedSaver(save)
    saver.push(baseDesign())
    saver.cancel()
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(save).not.toHaveBeenCalled()
  })
})

describe('readInitialDesign', () => {
  beforeEach(() => window.localStorage.clear())

  it('читает документ из хэша ссылки', () => {
    const design = baseDesign({ name: 'из ссылки' })
    window.location.hash = encodeDesignToHash(design)
    expect(readInitialDesign(window.location.hash)?.name).toBe('из ссылки')
    window.location.hash = ''
  })

  it('падает обратно на localStorage, когда хэша нет', () => {
    window.localStorage.setItem(LS_CURRENT_KEY, serializeDesign(baseDesign({ name: 'из хранилища' })))
    expect(readInitialDesign('')?.name).toBe('из хранилища')
  })

  it('возвращает null на битом хэше и пустом хранилище', () => {
    expect(readInitialDesign('#этонекодек')).toBe(null)
  })
})

describe('shareUrl', () => {
  it('заменяет старый хэш новым', () => {
    const url = shareUrl('https://endgrain.example/studio#старое', baseDesign())
    expect(url.startsWith('https://endgrain.example/studio#')).toBe(true)
    expect(url.includes('старое')).toBe(false)
  })
})

describe('useStudioPersistence', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.location.hash = ''
  })
  afterEach(() => {
    window.location.hash = ''
  })

  it('снимает хэш ссылки из адресной строки после восстановления документа', () => {
    window.location.hash = encodeDesignToHash(baseDesign({ name: 'из ссылки' }))
    const { unmount } = renderHook(() => useStudioPersistence())
    expect(window.location.hash).toBe('')
    unmount()
  })

  it('не трогает адресную строку, если ссылки не было', () => {
    const { unmount } = renderHook(() => useStudioPersistence())
    expect(window.location.hash).toBe('')
    unmount()
  })
})
