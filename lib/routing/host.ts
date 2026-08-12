/**
 * Один продукт живёт на двух доменах: корневой endgrain.app показывает лендинг,
 * app.endgrain.app показывает студию. Разводит их proxy.ts по заголовку Host,
 * и это единственное место, где имена доменов записаны буквами.
 */
export const SITE_ORIGIN: string = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? 'https://endgrain.app'
export const APP_ORIGIN: string = process.env.NEXT_PUBLIC_APP_ORIGIN ?? 'https://app.endgrain.app'

/** Canonical-путь лендинга внутри приложения. Корень сайта переписывается сюда. */
export const LANDING_PATH = '/landing'

const SITE_HOSTS: readonly string[] = ['endgrain.app', 'www.endgrain.app']
const APP_HOSTS: readonly string[] = ['app.endgrain.app']

export type HostRole = 'site' | 'app' | 'unknown'

/**
 * unknown это localhost, 127.0.0.1 и превью-домены *.vercel.app. Для них ничего
 * не разводится: приложение ведёт себя ровно как до фазы 8, а лендинг открывается
 * по прямому пути /landing. Без этого 43 существующих e2e (они ходят на 127.0.0.1)
 * увидели бы на / лендинг вместо студии.
 */
export function hostRole(hostHeader: string | null): HostRole {
  if (!hostHeader) return 'unknown'
  const host = hostHeader.split(':')[0]?.toLowerCase() ?? ''
  if (SITE_HOSTS.includes(host)) return 'site'
  if (APP_HOSTS.includes(host)) return 'app'
  return 'unknown'
}
