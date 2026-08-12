import { describe, it, expect, vi } from 'vitest'
import { getHelp, HELP_ENTRIES, type HelpId } from './index'
import ru from '@/lib/i18n/ru'
import en from '@/lib/i18n/en'

describe('help registry', () => {
  it('каждая запись имеет оба ключа в ru и en', () => {
    for (const entry of HELP_ENTRIES) {
      expect(ru).toHaveProperty(entry.titleKey)
      expect(ru).toHaveProperty(entry.bodyKey)
      expect(en).toHaveProperty(entry.titleKey)
      expect(en).toHaveProperty(entry.bodyKey)
    }
  })

  it('id записей уникальны', () => {
    const ids = HELP_ENTRIES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('все значения HelpId присутствуют в реестре', () => {
    const allIds: readonly HelpId[] = [
      'editor', 'palette', 'panels', 'rows', 'meter', 'diagnostics',
      'export', 'templates', 'generator', 'evolution', 'photo', 'view3d', 'feedback',
    ]
    const registered = new Set(HELP_ENTRIES.map((entry) => entry.id))
    expect(registered.size).toBe(allIds.length)
    for (const id of allIds) expect(registered.has(id)).toBe(true)
  })

  it('getHelp на несуществующем id возвращает null и предупреждает в консоль', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = getHelp('нет-такого' as HelpId)
    expect(result).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('getHelp на существующем id возвращает запись', () => {
    expect(getHelp('palette')).toEqual({ id: 'palette', titleKey: 'help.palette.title', bodyKey: 'help.palette.body' })
  })
})
