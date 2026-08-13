/**
 * Снимки интерфейса для лендинга. Список вынесен из компонента, чтобы тест словарей
 * ходил по тем же слагам: ключи `landing.shots.alt.*` собираются строкой и кастуются
 * в MessageKey, компилятор пропажу перевода не поймает.
 */
export const SHOTS = [
  { file: 'editor.png', slug: 'editor' },
  { file: 'templates.png', slug: 'templates' },
  { file: 'generator.png', slug: 'generator' },
  { file: 'photo.png', slug: 'photo' },
  { file: 'view3d.png', slug: 'view3d' },
] as const

export type ShotSlug = (typeof SHOTS)[number]['slug']
