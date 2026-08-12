import type { MessageKey } from '@/lib/i18n'

export interface HelpEntry {
  readonly id: HelpId
  readonly titleKey: MessageKey
  readonly bodyKey: MessageKey
}

export type HelpId =
  | 'editor'
  | 'palette'
  | 'panels'
  | 'rows'
  | 'meter'
  | 'diagnostics'
  | 'export'
  | 'templates'
  | 'generator'
  | 'evolution'
  | 'photo'
  | 'view3d'
  | 'promo'
  | 'feedback'

export const HELP_ENTRIES: readonly HelpEntry[] = [
  { id: 'editor', titleKey: 'help.editor.title', bodyKey: 'help.editor.body' },
  { id: 'palette', titleKey: 'help.palette.title', bodyKey: 'help.palette.body' },
  { id: 'panels', titleKey: 'help.panels.title', bodyKey: 'help.panels.body' },
  { id: 'rows', titleKey: 'help.rows.title', bodyKey: 'help.rows.body' },
  { id: 'meter', titleKey: 'help.meter.title', bodyKey: 'help.meter.body' },
  { id: 'diagnostics', titleKey: 'help.diagnostics.title', bodyKey: 'help.diagnostics.body' },
  { id: 'export', titleKey: 'help.export.title', bodyKey: 'help.export.body' },
  { id: 'templates', titleKey: 'help.templates.title', bodyKey: 'help.templates.body' },
  { id: 'generator', titleKey: 'help.generator.title', bodyKey: 'help.generator.body' },
  { id: 'evolution', titleKey: 'help.evolution.title', bodyKey: 'help.evolution.body' },
  { id: 'photo', titleKey: 'help.photo.title', bodyKey: 'help.photo.body' },
  { id: 'view3d', titleKey: 'help.view3d.title', bodyKey: 'help.view3d.body' },
  { id: 'promo', titleKey: 'help.promo.title', bodyKey: 'help.promo.body' },
  { id: 'feedback', titleKey: 'help.feedback.title', bodyKey: 'help.feedback.body' },
]

const REGISTRY: ReadonlyMap<HelpId, HelpEntry> = new Map(HELP_ENTRIES.map((entry) => [entry.id, entry]))

/** null означает потерянную подсказку: иконка не рисуется, в консоли предупреждение. */
export function getHelp(id: HelpId): HelpEntry | null {
  const entry = REGISTRY.get(id)
  if (!entry) {
    console.warn(`[help] нет записи для id ${id}`)
    return null
  }
  return entry
}
