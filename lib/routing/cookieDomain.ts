/**
 * Двухуровневые публичные суффиксы, которые встречаются у боевых доменов. Полный
 * Public Suffix List сюда тащить не за чем: он весит мегабайт и обновляется отдельно,
 * а промахнуться можно только на домене, которого у продукта нет.
 */
const SECOND_LEVEL_SUFFIXES = new Set(['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'])

/**
 * Хост, от которого считается cookie. Принимает и заголовок Host ("app.endgrain.app:3000"),
 * и полный origin ("https://app.endgrain.app"): на сервере доступен первый, в браузере
 * удобнее второй, а правило домена обязано быть одно на всех.
 * Возвращает undefined для IPv6 и всего, что на доменное имя не похоже.
 */
function hostnameOf(hostOrOrigin: string): string | undefined {
  const lower = hostOrOrigin.trim().toLowerCase()
  const schemeAt = lower.indexOf('://')
  const authority = (schemeAt === -1 ? lower : lower.slice(schemeAt + 3)).split('/')[0] ?? ''
  // IPv6 приходит в скобках, и регистрируемого домена у него нет по определению.
  if (authority.startsWith('[')) return undefined
  const hostname = authority.split(':')[0] ?? ''
  if (!/^[a-z0-9.-]+$/.test(hostname)) return undefined
  return hostname.replace(/\.$/, '')
}

/** Хост без домена cookie: там регистрируемый домен человеку не принадлежит. */
function isDomainlessHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true
  return hostname.endsWith('.vercel.app')
}

/**
 * Регистрируемый домен для cookie, общей у лендинга и приложения. Нужен именно он,
 * а не hostname: cookie с domain=.app.endgrain.app лендинг на endgrain.app не увидит.
 * Точка спереди обязательна: без неё cookie получается host-only и на соседний
 * поддомен не приезжает.
 * Считается от реального хоста запроса, а не от константы сборки: на localhost и на
 * превью *.vercel.app домен не ставится вовсе (host-only cookie), иначе браузер молча
 * выбросит cookie с чужим доменом вместе со всей сессией.
 */
export function registrableCookieDomain(hostOrOrigin: string): string | undefined {
  const hostname = hostnameOf(hostOrOrigin)
  if (hostname === undefined || isDomainlessHost(hostname)) return undefined
  const labels = hostname.split('.')
  if (labels.length < 2) return undefined
  const take = labels.length > 2 && SECOND_LEVEL_SUFFIXES.has(labels[labels.length - 2] ?? '') ? 3 : 2
  if (labels.length < take) return undefined
  return `.${labels.slice(-take).join('.')}`
}

/**
 * Ставить ли cookie флаг secure. На localhost и по IP приложение открывают по http,
 * и secure убил бы cookie целиком; на доменном хосте, включая превью *.vercel.app,
 * https есть всегда.
 */
export function isSecureCookieHost(hostOrOrigin: string): boolean {
  const hostname = hostnameOf(hostOrOrigin)
  if (hostname === undefined) return false
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return false
  return !/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
}
