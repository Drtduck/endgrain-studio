/**
 * Чистые числа тарифа, без единого импорта. Отдельный файл, а не plans.ts,
 * сознательно: эти константы читают клиентские компоненты (ProjectsPanel,
 * ExportPanel), а plans.ts тянет lib/stripe/config.ts, где лежат серверные ключи.
 * Значения оттуда в бандл не попадают, но и графа импортов до модуля с секретами
 * из клиента быть не должно.
 */

/** Сколько проектов в облаке держит бесплатный аккаунт. */
export const FREE_PROJECT_LIMIT = 3

/** Максимальная сторона PNG: обычный экспорт и экспорт для печати. */
export const PNG_MAX_PX_FREE = 2400
export const PNG_MAX_PX_PRO = 4000
export const PNG_SCALE_FREE = 2
export const PNG_SCALE_PRO = 4
