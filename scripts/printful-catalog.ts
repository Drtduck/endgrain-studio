// Скрипт сверки каталога мерча с живым Printful (§1.2 docs/specs/merch-orders.md).
// Ничего не пишет в репозиторий сам: только печатает таблицу, человек сверяет
// глазами и правит lib/merch/catalog.ts руками. Гонять в CI не нужно, это
// ручной инструмент раз в квартал.
//
// Запускается напрямую в Node (>=22.18 стирает типы сам, tsx не нужен, тот же
// приём, что в scripts/newsletter.ts).
// Запуск: PRINTFUL_API_KEY=... PRINTFUL_STORE_ID=... node scripts/printful-catalog.ts
// (или положить оба ключа в .env.local - скрипт подхватит их сам).
//
// Делает две вещи:
//   1. GET /products/{id} по каждому из четырёх товаров каталога v1 и печатает
//      variant_id/name/size/color/price - подтвердить id размеров футболки и
//      снять актуальную себестоимость печати (§2.2 спеки).
//   2. POST /shipping/rates на тестовый адрес в Австралии (дальше всех от
//      фабрик Printful) для каждого variant_id - снять худшую ставку доставки
//      по allowed_countries (§2.4, §2.5 спеки), тот самый ручной шаг из §14.2,
//      только через API вместо кабинета.
import { existsSync } from 'node:fs'
import path from 'node:path'

const ENV_LOCAL_PATH = path.resolve(import.meta.dirname, '../.env.local')
if (existsSync(ENV_LOCAL_PATH)) {
  process.loadEnvFile(ENV_LOCAL_PATH)
}

const PRINTFUL_API = 'https://api.printful.com'
const API_KEY = process.env['PRINTFUL_API_KEY'] ?? ''
const STORE_ID = (process.env['PRINTFUL_STORE_ID'] ?? '').trim()

if (API_KEY === '') {
  console.error('PRINTFUL_API_KEY не задан. Пропишите его в .env.local или в окружении.')
  process.exit(1)
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' }
  // Токен уровня аккаунта без этого заголовка получает 400 «requires store_id» (см. lib/promo/printful.ts).
  if (STORE_ID !== '') h['X-PF-Store-Id'] = STORE_ID
  return h
}

// Товары каталога v1 (§1 спеки): id Printful и наш внутренний идентификатор.
const PRODUCTS: readonly { readonly id: number; readonly label: string }[] = [
  { id: 71, label: 'tshirt (71 Unisex Staple T-Shirt, Bella+Canvas 3001)' },
  { id: 19, label: 'mug (19 White Glossy Mug)' },
  { id: 1, label: 'poster (1 Enhanced Matte Paper Poster in)' },
  { id: 894, label: 'apron (894 All-Over Print Apron)' },
]

interface PrintfulVariant {
  readonly id: number
  readonly name?: string
  readonly size?: string
  readonly color?: string
  readonly price?: string
}

interface ProductResponse {
  readonly code?: number
  readonly result?: { readonly variants?: readonly PrintfulVariant[] }
  readonly error?: { readonly message?: string }
}

interface ShippingRate {
  readonly id?: string
  readonly name?: string
  readonly rate?: string
  readonly currency?: string
}

interface ShippingRatesResponse {
  readonly code?: number
  readonly result?: readonly ShippingRate[]
  readonly error?: { readonly message?: string }
}

async function fetchVariants(productId: number): Promise<readonly PrintfulVariant[]> {
  const res = await fetch(`${PRINTFUL_API}/products/${productId}`, { headers: headers() })
  const body = (await res.json()) as ProductResponse
  if (!res.ok) {
    throw new Error(`GET /products/${productId}: HTTP ${res.status} ${body.error?.message ?? ''}`)
  }
  return body.result?.variants ?? []
}

// Тестовый адрес в Австралии - дальше всех от фабрик Printful, значит даёт
// худшую ставку доставки по allowed_countries (§2.4 спеки). Реальных денег
// запрос не тратит: это только расчёт ставки, не заказ.
const AU_ADDRESS = {
  address1: '1 Elizabeth Street',
  city: 'Melbourne',
  country_code: 'AU',
  state_code: 'VIC',
  zip: '3000',
}

async function fetchShippingRate(variantId: number): Promise<ShippingRate | null> {
  const res = await fetch(`${PRINTFUL_API}/shipping/rates`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ recipient: AU_ADDRESS, items: [{ variant_id: variantId, quantity: 1 }], currency: 'USD' }),
  })
  const body = (await res.json()) as ShippingRatesResponse
  if (!res.ok) {
    console.error(`  POST /shipping/rates (variant ${variantId}): HTTP ${res.status} ${body.error?.message ?? ''}`)
    return null
  }
  const rates = body.result ?? []
  if (rates.length === 0) return null
  // Худшая (самая дорогая) ставка среди предложенных - консервативная оценка расходов.
  return rates.reduce((worst, r) => (Number.parseFloat(r.rate ?? '0') > Number.parseFloat(worst.rate ?? '0') ? r : worst), rates[0]!)
}

async function main(): Promise<void> {
  console.log(`Сверка каталога Printful. Дата: ${new Date().toISOString().slice(0, 10)}`)
  console.log(`Store ID: ${STORE_ID === '' ? '(не задан, токен уровня магазина)' : STORE_ID}`)
  console.log('')

  for (const product of PRODUCTS) {
    console.log(`=== ${product.label} (product_id ${product.id}) ===`)
    try {
      const variants = await fetchVariants(product.id)
      console.log('variant_id\tname\tsize\tcolor\tprice')
      for (const v of variants) {
        console.log(`${v.id}\t${v.name ?? ''}\t${v.size ?? ''}\t${v.color ?? ''}\t${v.price ?? ''}`)
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
    }
    console.log('')
  }

  console.log('=== Ставки доставки (худшая по AU-адресу) ===')
  // Только наши variant_id из lib/merch/catalog.ts, а не весь ряд цветов/размеров
  // товара: смысла гонять ставку по вариантам, которые мы не продаём, нет,
  // а лишние сотни запросов к Printful только жгут лимит.
  const CATALOG_VARIANT_IDS: readonly { readonly id: number; readonly label: string }[] = [
    { id: 4011, label: 'tshirt S' },
    { id: 4012, label: 'tshirt M' },
    { id: 4013, label: 'tshirt L' },
    { id: 4014, label: 'tshirt XL' },
    { id: 1320, label: 'mug' },
    { id: 1, label: 'poster' },
    { id: 22903, label: 'apron' },
  ]
  for (const v of CATALOG_VARIANT_IDS) {
    const rate = await fetchShippingRate(v.id)
    console.log(`variant ${v.id} (${v.label}): ${rate ? `${rate.rate} ${rate.currency} (${rate.name})` : 'нет ставки'}`)
  }
}

void main()
