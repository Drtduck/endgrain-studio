# Stripe: минимальная production-честная монетизация

Дата: 12 августа 2026. Статус: принят к реализации. Исполнитель: Sonnet-агент, одна задача.
Этот документ - единственный источник требований. Всё, чего в нём нет, делать не надо.

## 0. Исходные условия и главное решение

Ключей Stripe на момент реализации нет и до сдачи конкурса может не быть. Поэтому весь код пишется по образцу, который в репозитории уже дважды применён и проверен: `isSupabaseConfigured()` в `lib/supabase/config.ts` и `isResendConfigured()` в `lib/resend/config.ts`. Без ключей приложение обязано собираться, проходить CI, открываться и работать полностью.

**Главное решение: без ключей Stripe Pro открыт всем.** Не «скрыт», не «заблокирован с предложением купить», а именно открыт. Обоснование простое и оно же самое честное: paywall без работающей кассы - это тупик. Человек нажимает «Улучшить», а купить не может. Судья конкурса открывает прод и видит инструмент, у которого часть кнопок ведёт в никуда. Это хуже, чем отсутствие монетизации вообще. Плюс это ровно то, что зафиксировано в принятом design spec от 11 августа: «монетизация не должна мешать судейству, судья не увидит ни одного paywall».

Формально: `getProStatus()` возвращает `pro: true` с причиной `'no-stripe'`, когда `isStripeConfigured()` даёт `false`. Страница тарифов при этом всё равно рендерится (она часть продуктового рассказа), но вместо кнопок оплаты показывает честную строку: «Оплата пока не подключена. Все возможности Pro сейчас открыты всем». Кнопка «Улучшить» в шапке студии в этом режиме не рендерится вовсе, как не рендерится `AccountButton` без Supabase.

Второй способ открыть Pro остаётся прежним: флаг `NEXT_PUBLIC_PRO_UNLOCK=1` из `lib/flags.ts`. Он выигрывает у всего остального, в том числе у настроенного Stripe. Это аварийный рубильник на случай, если ключи заведены, а вебхук по какой-то причине не доехал во время демонстрации.

## 1. Тарифная сетка

### Цена и её обоснование

В принятом design spec от 11 августа уже есть ресерч рынка, и мы его не переделываем, а пересчитываем под сокращённый объём Pro:

- Прямой конкурент `cuttingboarddesigner.app`: $0.99 в неделю, $2.99 в месяц, $9.99 в год. Это рисовалка узоров без расчёта себестоимости и без производственной инструкции.
- Инструменты для продавцов Etsy (eRank, Marmalead, Alura): $6-30 в месяц.
- Исходный spec ставил Pro в $9 в месяц и $79 в год, но считал внутрь Pro генерацию AI-картинок, Etsy-листинги и Printful. Ничего из этого в продукте нет и в рамках конкурса не будет.

Поэтому Pro стоит **$7 в месяц или $49 в год**. Годовой равен цене семи месяцев, экономия 42 процента, и это тот разрыв, при котором годовой действительно выбирают. Мы заметно дороже прямого конкурента, потому что считаем материал, отходы и себестоимость: подписка окупается с первой проданной доски. И мы заметно дешевле инструментов для Etsy, потому что закрываем один сценарий, а не весь магазин.

Валюта - доллар США. Тексты цен лежат в словарях i18n строками (`'$7'`, `'$49'`), а не тянутся из Stripe API: лишний сетевой поход при каждом рендере страницы тарифов не окупается, а цифры меняются раз в год. Цена в словаре и цена в Stripe Dashboard обязаны совпадать, это пункт ручного чеклиста при заведении ключей (раздел 8).

### Что входит

| | Free | Pro |
|---|---|---|
| Цена | 0 | $7 в месяц или $49 в год |
| Редактор, породы, поворот и отражение, размеры доски | да | да |
| Шаблоны, генераторы, эволюция узоров | да | да |
| Photo-to-pattern | да | да |
| 3D-превью | да | да |
| Диагностика изготовимости, расчёт материала и себестоимости | да | да |
| Экспорт PNG (x2), SVG, CSV | да | да |
| PDF-инструкция | да, с одной промо-строкой в подвале | без промо-строки |
| PNG для печати (x4, до 4000 px) | нет | да |
| Проекты в облаке | 3 | без ограничения |
| Локальное сохранение в браузере, ссылка-шара | да | да |

Три гейта. Ровно три, больше не добавлять.

### Почему гейтим именно это

Критерий отбора был один: демо конкурса не должно выглядеть обрезанным. Отсюда прямые запреты.

**Не гейтим 3D, генераторы и photo-to-pattern.** Это wow-функции, ради которых проект вообще смотрят, и они перечислены в README как то, что добавляет очков. Гейт на них превращает демо в трейлер.

**Не гейтим PDF-инструкцию как таковую.** Она и есть главный ответ на первый критерий оценки конкурса («по экспортированному PDF человек собирает доску»). Спрятать её за оплату - выстрелить в собственный основной аргумент. Вместо этого в бесплатном PDF на последней странице появляется одна строка мелким кеглем: «Сделано в Endgrain Studio, endgrain.app». Это не увечье, это подпись, и она работает как канал привлечения: PDF уходит в мастерскую и его видят другие люди. Pro эту строку убирает.

**Гейтим лимит облачных проектов (3 штуки).** Единственный гейт, который проверяется на сервере и который реально нельзя обойти из браузера. Он не мешает демо вообще: чтобы в него упереться, нужно завести аккаунт и сохранить четвёртый проект. Судья, скорее всего, вообще не будет логиниться, а если будет - три проекта это больше, чем нужно для оценки. Локальное сохранение в браузере и ссылка-шара при этом безлимитны, то есть человек без аккаунта не ограничен ничем.

**Гейтим PNG повышенного разрешения.** Обычный PNG (x2, до 2400 px по длинной стороне) остаётся бесплатным и его хватает и для экрана, и для мессенджера, и для карточки в соцсети. Отдельная кнопка «PNG для печати» даёт x4 и до 4000 px: это уже про печать плаката или карточки товара, то есть про заработок, а не про демо.

### Честность гейтов

Гейты разной прочности, и мы это признаём вслух, как признавал исходный spec.

Лимит проектов проверяется в server action `saveProjectAction`, до вставки строки. Обойти его из devtools нельзя.

Промо-строка в PDF и разрешение PNG считаются в браузере, потому что и PDF, и растеризация живут в клиенте ради отзывчивости. Технически подкованный человек снимет их через devtools. Это осознанный размен: серверный рендер PDF ради защиты промо-строки стоил бы дороже, чем весь доход с неё. В коде на обоих местах стоит комментарий про мягкий гейт, чтобы следующий читатель не решил, что это дыра по недосмотру.

## 2. Архитектура

### Схема потока

1. Пользователь на `/pricing` в студии жмёт «Оформить Pro». Требуется вход: без аккаунта подписку не к чему привязать, кнопка ведёт на `/login?next=/pricing`.
2. Server action `createCheckoutAction(plan)` создаёт Checkout Session через REST Stripe и возвращает `url`.
3. Клиент делает `window.location.assign(url)`. Оплата целиком на стороне Stripe (hosted checkout), карточных данных мы не видим никогда.
4. Stripe возвращает пользователя на `${origin}/?checkout=success`. Студия показывает баннер.
5. Параллельно Stripe шлёт вебхук на `POST /api/stripe/webhook`. Роут проверяет подпись, разбирает событие и делает upsert строки в `public.subscriptions` под service-role ключом.
6. Следующий серверный рендер видит строку, `getProStatus()` возвращает `pro: true`, гейты снимаются.

### Почему без SDK `stripe`

Пакет `stripe` весит порядка 3 МБ и тянет собственный HTTP-слой. Нам от него нужно ровно две вещи: один POST на создание сессии и проверка HMAC-подписи вебхука. Первое - это `fetch` с form-encoded телом, второе - двадцать строк на `node:crypto`. В репозитории уже есть прецедент и он себя оправдал: `app/actions/subscribe.ts` ходит в Resend голым `fetch` с комментарием «один POST не стоит 300 КБ зависимости».

Отдельный плюс: собственная проверка подписи покрывается честным unit-тестом без единого мока. Тест сам считает HMAC тестовым секретом и проверяет положительный случай, подделку, просроченный timestamp и отсутствие заголовка. С SDK пришлось бы либо мокать `stripe.webhooks.constructEvent`, либо тестировать чужую библиотеку.

Никаких новых зависимостей в `package.json` эта задача не добавляет.

### Версия Stripe API

Заголовок `Stripe-Version` мы не отправляем: запросы идут на версии, выставленной в аккаунте по умолчанию. Соответственно парсер события обязан быть терпимым к обеим формам объекта подписки, и это не перестраховка, а известная поломка. В версии `2025-03-31.basil` Stripe перенёс `current_period_start` и `current_period_end` с объекта подписки на её элементы (`items.data[].current_period_end`). Парсер читает сначала `items.data[0].current_period_end`, при отсутствии - `current_period_end` верхнего уровня, при отсутствии обоих кладёт `null`. То же самое с ценой: `items.data[0].price.id`.

### Ключи и гвард

Новый файл `lib/stripe/config.ts`, один в один по образцу `lib/resend/config.ts`.

```ts
/** Серверные: секретный ключ и секрет вебхука в клиентский бандл попасть не должны. */
export const STRIPE_SECRET_KEY: string = process.env['STRIPE_SECRET_KEY'] ?? ''
export const STRIPE_WEBHOOK_SECRET: string = process.env['STRIPE_WEBHOOK_SECRET'] ?? ''

/**
 * Публичные: id цен инлайнятся в клиентский бандл, поэтому только точечная
 * нотация process.env.NEXT_PUBLIC_*, как в lib/supabase/config.ts.
 * Id цены не секрет: он и так виден в URL страницы оплаты.
 */
export const STRIPE_PRICE_MONTHLY: string = process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY ?? ''
export const STRIPE_PRICE_YEARLY: string = process.env.NEXT_PUBLIC_STRIPE_PRICE_YEARLY ?? ''

/** Ссылка на hosted Customer Portal (no-code link из Stripe Dashboard). Необязательна. */
export const STRIPE_PORTAL_URL: string = process.env.NEXT_PUBLIC_STRIPE_PORTAL_URL ?? ''

/**
 * Без всех четырёх обязательных значений касса не существует: Pro открыт всем,
 * кнопки оплаты не рендерятся, вебхук отвечает 503 и ничего не пишет.
 * Это штатное состояние в CI и на конкурсном проде до заведения ключей.
 */
export function isStripeConfigured(): boolean {
  return (
    STRIPE_SECRET_KEY.length > 0 &&
    STRIPE_WEBHOOK_SECRET.length > 0 &&
    STRIPE_PRICE_MONTHLY.length > 0 &&
    STRIPE_PRICE_YEARLY.length > 0
  )
}
```

Важно: `isStripeConfigured()` вызывается и на клиенте (страница тарифов решает, рисовать кнопки или честную строку), а серверные ключи на клиенте всегда пустые строки. Поэтому клиент **не** зовёт `isStripeConfigured()`. Признак «касса работает» приезжает на клиент пропсом из серверного компонента, ровно как `enabled` в `SessionProvider`. Для этого в `lib/stripe/config.ts` есть отдельная функция:

```ts
/** Клиентская половина гварда: только публичные переменные, зовётся из клиентских компонентов. */
export function hasPublicPrices(): boolean {
  return STRIPE_PRICE_MONTHLY.length > 0 && STRIPE_PRICE_YEARLY.length > 0
}
```

### Планы

`lib/stripe/plans.ts`, чистый модуль без побочных эффектов.

```ts
export type PlanId = 'monthly' | 'yearly'

/** Сколько проектов в облаке держит бесплатный аккаунт. */
export const FREE_PROJECT_LIMIT = 3

/** Максимальная сторона PNG: обычный экспорт и экспорт для печати. */
export const PNG_MAX_PX_FREE = 2400
export const PNG_MAX_PX_PRO = 4000
export const PNG_SCALE_FREE = 2
export const PNG_SCALE_PRO = 4

export function priceIdFor(plan: PlanId): string
export function planForPriceId(priceId: string): PlanId | null
```

`planForPriceId` нужен вебхуку: событие приносит id цены, а в таблицу мы кладём человеческое `'monthly' | 'yearly'`. Если id не совпал ни с одной известной ценой (например, цену пересоздали в Dashboard), функция возвращает `null`, и вебхук пишет план `'monthly'` с предупреждением в лог, но подписку всё равно активирует: пользователь заплатил, и неизвестный price id не повод оставить его без Pro.

### Проверка подписи вебхука

`lib/stripe/signature.ts`.

```ts
export interface VerifyInput {
  readonly payload: string
  readonly header: string | null
  readonly secret: string
  readonly nowMs?: number
  readonly toleranceSec?: number
}

export type VerifyFailure = 'no-header' | 'no-secret' | 'malformed' | 'mismatch' | 'too-old'
export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure }

/**
 * Заголовок Stripe-Signature имеет вид t=1699999999,v1=hex,v1=hex.
 * Подписывается строка `${t}.${payload}` по HMAC-SHA256 секретом whsec_...
 * Схем v1 может быть несколько (во время ротации секрета), достаточно совпадения любой.
 */
export function verifyStripeSignature(input: VerifyInput): VerifyResult
```

Требования к реализации, которые проверяются тестами:

- сравнение только через `crypto.timingSafeEqual`, никакого `===` на строках подписи;
- перед `timingSafeEqual` сверить длины буферов, иначе функция бросает;
- допуск по времени 300 секунд по умолчанию, настраивается через `toleranceSec`;
- `nowMs` параметром, а не `Date.now()` внутри: иначе тест на просроченный timestamp пришлось бы писать с подменой таймеров;
- пустой секрет даёт `'no-secret'`, а не `'mismatch'`: разные причины не должны сливаться в логе.

### Разбор события

`lib/stripe/events.ts`. Схема на `zod` (уже в зависимостях, версия 4).

```ts
export type SubscriptionStatus =
  | 'trialing' | 'active' | 'past_due' | 'canceled'
  | 'incomplete' | 'incomplete_expired' | 'unpaid' | 'paused'

export interface SubscriptionUpsert {
  readonly userId: string
  readonly customerId: string
  readonly subscriptionId: string
  readonly priceId: string
  readonly plan: PlanId
  readonly status: SubscriptionStatus
  /** ISO-строка или null, если Stripe не прислал период (см. раздел про версию API). */
  readonly currentPeriodEnd: string | null
  readonly cancelAtPeriodEnd: boolean
  /** event.created в ISO: защита от применения устаревшего события поверх свежего. */
  readonly eventAt: string
}

/**
 * Возвращает null для всего, что нас не касается: чужих типов событий,
 * подписок без metadata.supabase_user_id, битого JSON.
 * Null это не ошибка: роут отвечает 200, иначе Stripe будет ретраить вечно.
 */
export function parseSubscriptionEvent(raw: unknown): SubscriptionUpsert | null
```

Обрабатываем ровно три типа событий: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Всё остальное игнорируем.

`checkout.session.completed` сознательно не обрабатывается, и это стоит объяснить, потому что во всех туториалах он есть. Мы при создании сессии кладём `subscription_data[metadata][supabase_user_id]`, поэтому идентификатор пользователя приезжает в каждом событии подписки, включая продления и отмены через полгода. Значит `checkout.session.completed` не несёт ни одного факта, которого нет в `customer.subscription.created`, приходящем следом. Обработать его означало бы завести четвёртую ветку и второй поход в API за объектом подписки ради нуля новой информации.

Для `customer.subscription.deleted` статус берётся из тела события (там уже `canceled`), отдельной ветки не нужно.

### Таблица и доступ к ней

Вебхук приходит без cookie пользователя, значит писать под anon-ключом с RLS нельзя. Нужен service-role клиент. До сих пор `SUPABASE_SERVICE_ROLE_KEY` в приложении не использовался (так написано в README), с этой задачей это меняется, и README правится.

`lib/supabase/admin.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './config'

export const SUPABASE_SERVICE_ROLE_KEY: string = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? ''

export function isSupabaseAdminConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_SERVICE_ROLE_KEY.length > 0
}

/**
 * Клиент, обходящий RLS. Используется ровно в одном месте: app/api/stripe/webhook.
 * Не createServerClient из @supabase/ssr: cookie тут не нужны и сессию заводить нельзя.
 * Любое новое место вызова этой функции обязано быть обосновано в ревью.
 */
export function getSupabaseAdmin(): SupabaseClient
```

Опции клиента: `{ auth: { persistSession: false, autoRefreshToken: false } }`.

### Серверный хелпер статуса

`lib/stripe/pro.ts`. Разделён на чистое ядро и async-обёртку: ядро тестируется unit-тестом без единого мока Supabase.

```ts
export type ProReason = 'flag' | 'no-stripe' | 'subscription' | 'free'

export interface ProStatus {
  readonly pro: boolean
  readonly reason: ProReason
  readonly plan: PlanId | null
  /** ISO-строка конца оплаченного периода или null. */
  readonly currentPeriodEnd: string | null
  readonly cancelAtPeriodEnd: boolean
}

export interface SubscriptionRecord {
  readonly status: string
  readonly plan: string
  readonly currentPeriodEnd: string | null
  readonly cancelAtPeriodEnd: boolean
}

/** Три дня после конца периода Pro ещё работает: неудачный платёж не должен мгновенно рубить доступ. */
export const GRACE_MS = 3 * 24 * 60 * 60 * 1000

export function resolveProStatus(row: SubscriptionRecord | null, nowMs: number): ProStatus

/** Мемоизация на один серверный рендер, как getCurrentUser в lib/supabase/session.ts. */
export const getProStatus: () => Promise<ProStatus>
```

Порядок правил в `getProStatus()`, строго такой:

1. `flags.pro` истинно -> `{ pro: true, reason: 'flag', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }`. Аварийный рубильник выигрывает у всего.
2. `!isStripeConfigured()` -> `{ pro: true, reason: 'no-stripe', ... }`. Кассы нет, значит гейтов нет.
3. Пользователя нет (`getCurrentUser()` вернул null) -> `{ pro: false, reason: 'free', ... }`.
4. Читаем строку `subscriptions` под обычным серверным клиентом (RLS пустит владельца к своей строке) и отдаём `resolveProStatus(row, Date.now())`.
5. Любое исключение по дороге -> `{ pro: false, reason: 'free', ... }` и `console.error`. Лежащая база не должна ронять рендер студии, ровно как в `getCurrentUser`.

Правила `resolveProStatus`:

- `row === null` -> `pro: false`, `reason: 'free'`;
- статус в `('active', 'trialing', 'past_due')` и (`currentPeriodEnd` пустой **или** `Date.parse(currentPeriodEnd) + GRACE_MS > nowMs`) -> `pro: true`, `reason: 'subscription'`;
- всё остальное -> `pro: false`, `reason: 'free'`, но `plan` и `currentPeriodEnd` из строки сохраняются: страница тарифов покажет «подписка закончилась такого-то числа»;
- `past_due` считается Pro сознательно: карта не прошла, Stripe будет пробовать ещё несколько дней, отбирать доступ в этот момент - худший возможный момент для конфликта с платящим человеком.

### Клиентский хук

`components/ProProvider.tsx`, копия подхода `SessionProvider`: значение считается на сервере в `app/layout.tsx` и приезжает пропсом, никаких эффектов и никакого мигания «free -> pro».

```ts
export interface ProValue {
  readonly status: ProStatus
  /** true, когда касса настроена и можно показывать кнопки оплаты. */
  readonly billingEnabled: boolean
}

export function ProProvider({ value, children }: { value: ProValue; children: ReactNode }): ReactElement
export function usePro(): ProValue
```

Дефолт контекста: `{ status: { pro: true, reason: 'no-stripe', plan: null, currentPeriodEnd: null, cancelAtPeriodEnd: false }, billingEnabled: false }`. Дефолт открытый, а не закрытый, сознательно: если компонент отрендерился вне провайдера (в юнит-тесте, например), он не должен показывать замок.

### Server action оплаты

Типы живут в `lib/stripe/billing.ts`, потому что модуль с `'use server'` наружу отдаёт только async-функции. Это правило репозиторий уже выучил больно (см. `lib/subscribe.ts` и комментарий в плане фазы 8).

`lib/stripe/billing.ts`:

```ts
export type CheckoutError = 'disabled' | 'unauthenticated' | 'invalid' | 'already' | 'failed'
export type CheckoutResult = { ok: true; url: string } | { ok: false; error: CheckoutError }
```

`app/actions/billing.ts`:

```ts
'use server'

export async function createCheckoutAction(plan: unknown): Promise<CheckoutResult>
```

Тело по шагам:

1. `z.enum(['monthly', 'yearly']).safeParse(plan)`, иначе `'invalid'`.
2. `!isStripeConfigured()` -> `'disabled'`.
3. `getCurrentUser()` пуст -> `'unauthenticated'`.
4. `getProStatus()` уже даёт `reason === 'subscription'` -> `'already'`. Второй чек-аут поверх активной подписки создал бы вторую подписку и двойное списание.
5. `origin` берётся из заголовка `origin` запроса (`await headers()`), с падением обратно на `APP_ORIGIN` из `lib/routing/host.ts`. Жёстко зашитый `APP_ORIGIN` отправлял бы с localhost на прод.
6. POST `https://api.stripe.com/v1/checkout/sessions`, `Authorization: Bearer ${STRIPE_SECRET_KEY}`, `Content-Type: application/x-www-form-urlencoded`, `cache: 'no-store'`. Тело собирается через `URLSearchParams`:

```
mode=subscription
line_items[0][price]=<priceIdFor(plan)>
line_items[0][quantity]=1
success_url=<origin>/?checkout=success
cancel_url=<origin>/pricing?checkout=cancel
client_reference_id=<user.id>
customer_email=<user.email>
metadata[supabase_user_id]=<user.id>
subscription_data[metadata][supabase_user_id]=<user.id>
allow_promotion_codes=true
```

7. Ответ не ok или в теле нет строкового `url` -> `'failed'` и `console.error` с телом ответа. Ключ в лог не попадает никогда.
8. Исключение (сеть, таймаут) -> `'failed'`.

`subscription_data[metadata][supabase_user_id]` - самая важная строка во всём файле. Именно она делает ненужным `checkout.session.completed` и делает вебхук одноветочным.

### Роут вебхука

`app/api/stripe/webhook/route.ts`.

```ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request): Promise<Response>
```

`runtime = 'nodejs'` обязателен: нужен `node:crypto` и сырое тело.

Порядок:

1. `if (!isStripeConfigured() || !isSupabaseAdminConfigured()) return new Response('stripe disabled', { status: 503 })`. 503, а не 200: Stripe отложит доставку и переотправит, когда ключи появятся, вместо того чтобы посчитать событие принятым и потерять его.
2. `const payload = await request.text()`. Именно текст, до всякого `JSON.parse`: подпись считается по байтам исходного тела.
3. `verifyStripeSignature({ payload, header: request.headers.get('stripe-signature'), secret: STRIPE_WEBHOOK_SECRET })`. Не ok -> `400` с текстом причины. Никаких деталей подписи в теле ответа.
4. `JSON.parse` в try/catch, при исключении -> `400`.
5. `parseSubscriptionEvent(raw)`. `null` -> `200` с телом `ignored`. Событие не наше или без metadata, ретраить его бессмысленно.
6. Upsert в `subscriptions` по `user_id` через service-role клиент. Защита от гонки: `.lte('last_event_at', upsert.eventAt)` не работает в upsert, поэтому делаем так - сначала `select last_event_at`, и если сохранённое значение строго больше `eventAt`, отвечаем `200 stale` и ничего не пишем. Это не идеальная сериализация, но она снимает реальный сценарий: Stripe при ретрае может доставить `created` после `updated`, и без проверки активная подписка откатилась бы в `incomplete`.
7. Ошибка записи -> `500` и `console.error`. Stripe переотправит.
8. Успех -> `200 ok`.

Ответ всегда короткий текст, никакого JSON и никакого эха события.

### Гейты в коде

**Лимит проектов.** В `app/actions/projects.ts`, функция `saveProjectAction`, после проверки имени и документа, до вставки:

```ts
const { pro } = await getProStatus()
if (!pro) {
  const { count, error: countError } = await sb
    .from('projects')
    .select('id', { count: 'exact', head: true })
  if (countError) return { ok: false, error: 'failed' }
  if ((count ?? 0) >= FREE_PROJECT_LIMIT) return { ok: false, error: 'limit' }
}
```

В `ProjectsError` добавляется `'limit'`, в `ERROR_KEYS` в `ProjectsPanel.tsx` - ключ `'projects.errorLimit'`. Текст ошибки содержит ссылку на `/pricing`? Нет: `ERROR_KEYS` отдаёт строку, а не разметку. Достаточно текста «Бесплатный аккаунт хранит 3 проекта. Откройте вкладку тарифов, чтобы снять ограничение». Плюс под кнопкой «Сохранить» показывается `projects.limitHint` со счётчиком, но только когда `!pro && billingEnabled`.

**PNG для печати.** В `ExportPanel.tsx` добавляется четвёртая (по факту пятая) кнопка с `data-testid="export-png-hd"`. Тип `ExportFormat` расширяется значением `'png-hd'`. Логика в `run`:

```ts
// Мягкий гейт: растеризация целиком в браузере, поэтому проверка тут не защита,
// а честная витрина. Серверно защищён только лимит облачных проектов.
const maxPx = format === 'png-hd' ? PNG_MAX_PX_PRO : PNG_MAX_PX_FREE
const scale = format === 'png-hd' ? PNG_SCALE_PRO : PNG_SCALE_FREE
```

Кнопка `png-hd` при `!pro` рендерится с иконкой замка (`lucide-react`, `Lock`), `variant="outline"`, и по клику вместо экспорта делает `router.push('/pricing')`. При `pro` работает как обычная.

**Промо-строка в PDF.** В `PdfInput` добавляется `readonly pro: boolean`. В конце `buildInstructionPdf`, после отрисовки последней страницы:

```ts
// Мягкий гейт, см. комментарий в ExportPanel. Строка не увечит инструкцию,
// она подписывает её: PDF уходит в чужую мастерскую и работает как визитка.
if (!input.pro) {
  doc.setFontSize(7)
  doc.text(t(locale, 'export.pdfPromo'), PAGE.marginMm, PAGE.heightMm - 6)
}
```

`ExportPanel` передаёт `pro` из `usePro()`.

## 3. UI

### Страница тарифов

`app/pricing/page.tsx` - серверный компонент на домене студии. Читает `getProStatus()`, `getCurrentUser()`, локаль через `getLandingLocale()`, и рендерит `<PricingPlans>` в режиме `mode="checkout"`.

`components/pricing/PricingPlans.tsx` - клиентский компонент, единственное место, где описаны обе карточки. Используется дважды: на странице тарифов с настоящими кнопками и в секции лендинга со ссылками.

```ts
export interface PricingPlansProps {
  readonly locale: Locale
  readonly mode: 'checkout' | 'link'
  readonly pro: boolean
  readonly reason: ProReason
  readonly billingEnabled: boolean
  readonly signedIn: boolean
  readonly currentPeriodEnd: string | null
  readonly portalUrl: string
}
```

Состояния кнопки Pro:

| Условие | Что показываем |
|---|---|
| `mode === 'link'` (лендинг) | ссылка `${APP_ORIGIN}/pricing`, текст `pricing.cta.open` |
| `!billingEnabled` | кнопки нет, вместо неё строка `pricing.disabled` в рамке |
| `billingEnabled && !signedIn` | ссылка на `/login?next=/pricing`, текст `pricing.cta.needAuth` |
| `billingEnabled && pro && reason === 'subscription'` | бейдж `pricing.current` плюс ссылка `pricing.manage` на `portalUrl`, если он задан |
| остальное | две кнопки: `pricing.cta.monthly` и `pricing.cta.yearly`, обе зовут `createCheckoutAction` |

Кнопки оплаты работают через `useTransition`, во время запроса показывают `pricing.busy` и обе задизейблены. Успех -> `window.location.assign(res.url)`. Ошибка -> строка под кнопками с `role="alert"` и `data-testid="pricing-error"`, тексты по кодам `CheckoutError`.

Тестовые id: `pricing-plans`, `pricing-free`, `pricing-pro`, `pricing-buy-monthly`, `pricing-buy-yearly`, `pricing-disabled`, `pricing-current`, `pricing-manage`, `pricing-error`.

### Кнопка в студии

`components/UpgradeButton.tsx`, ставится в шапку `StudioShell` между `AccountButton` и разделителем перед `HistoryControls`.

```ts
export function UpgradeButton(): ReactElement | null
```

- `!billingEnabled` -> `null`. Ровно как `AccountButton` без Supabase: кнопка, ведущая в тупик, не рендерится.
- `pro` -> компактный бейдж `Pro` (`components/ui/badge.tsx`, уже есть), `data-testid="pro-badge"`, ссылка на `/pricing`.
- иначе -> `Button` `variant="outline"` `size="sm"` с иконкой `Sparkles`, текст `pricing.upgrade`, `data-testid="upgrade-button"`, ссылка на `/pricing`.

### Секция на лендинге

`components/landing/PricingSection.tsx`, серверный, вставляется в `app/(landing)/landing/page.tsx` между `<BooksTeaser>` и финальным CTA. Якорь `id="pricing"`, `data-testid="landing-pricing"`, `scroll-mt-14` как у секции узоров. Внутри `<PricingPlans mode="link" ...>`, где `pro` и `signedIn` заведомо `false` (лендинг анонимен и в Supabase не ходит, это принципиально, см. комментарий в `proxy.ts`), а `billingEnabled` считается по `hasPublicPrices()`.

В `LandingFooter` в колонку «Продукт» добавляется ссылка на `${APP_ORIGIN}/pricing` с текстом `pricing.navTitle` и `data-testid="landing-footer-pricing"`.

### Состояние после оплаты

`app/page.tsx` перестаёт быть однострочным:

```tsx
export default async function Page(props: PageProps<'/'>) {
  const { checkout } = await props.searchParams
  const state = checkout === 'success' ? 'success' : checkout === 'cancel' ? 'cancel' : null
  return (
    <>
      {state ? <CheckoutBanner state={state} /> : null}
      <StudioShell />
    </>
  )
}
```

`components/CheckoutBanner.tsx` - клиентский, закрывается крестиком (локальный `useState`), `data-testid="checkout-banner"`.

Текст успеха обязан быть честным про задержку вебхука: между возвратом пользователя и записью в базу проходит от долей секунды до нескольких секунд, и человек вполне может увидеть страницу ещё без Pro. Поэтому: «Оплата прошла, спасибо. Pro включится в течение минуты. Если возможности ещё закрыты, обновите страницу». Никакого автоматического поллинга и никакого `router.refresh()` по таймеру: одна честная фраза дешевле и надёжнее.

Текст отмены нейтральный, без давления: «Оплата отменена. Ничего не списано, студия работает как прежде».

### Тексты i18n

Все ключи добавляются в оба словаря. Ниже полный список с русским и английским текстом.

| Ключ | ru | en |
|---|---|---|
| `pricing.navTitle` | Тарифы | Pricing |
| `pricing.title` | Бесплатно хватает, Pro снимает потолок | Free is enough, Pro removes the ceiling |
| `pricing.subtitle` | Движок, расчёты и экспорт открыты всем. Платите, только если студия начала приносить деньги. | The engine, the maths and the exports are open to everyone. Pay only once the studio starts paying you back. |
| `pricing.free.name` | Бесплатно | Free |
| `pricing.free.price` | $0 | $0 |
| `pricing.free.note` | Навсегда, без карты | Forever, no card |
| `pricing.pro.name` | Pro | Pro |
| `pricing.pro.monthlyPrice` | $7 | $7 |
| `pricing.pro.monthlyPeriod` | в месяц | per month |
| `pricing.pro.yearlyPrice` | $49 | $49 |
| `pricing.pro.yearlyPeriod` | в год | per year |
| `pricing.pro.yearlyNote` | Год стоит как семь месяцев | A year costs what seven months do |
| `pricing.f.editor` | Редактор, породы, размеры, поворот и отражение | Editor, species, sizes, rotate and mirror |
| `pricing.f.generate` | Шаблоны, генераторы, эволюция, узор из фотографии | Templates, generators, evolution, photo to pattern |
| `pricing.f.calc` | 3D-превью, диагностика, материал и себестоимость | 3D preview, diagnostics, material and cost |
| `pricing.f.exportBasic` | Экспорт PNG, SVG и CSV | PNG, SVG and CSV export |
| `pricing.f.pdfFree` | PDF-инструкция с подписью студии | PDF instructions with a studio credit line |
| `pricing.f.pdfPro` | PDF-инструкция без подписи | PDF instructions without the credit line |
| `pricing.f.pngPro` | PNG для печати: 4000 px | Print-ready PNG at 4000 px |
| `pricing.f.projectsFree` | 3 проекта в облаке | 3 cloud projects |
| `pricing.f.projectsPro` | Проекты в облаке без ограничения | Unlimited cloud projects |
| `pricing.f.local` | Локальное сохранение и ссылка-шара без ограничений | Unlimited local saves and share links |
| `pricing.cta.monthly` | Оформить за $7 в месяц | Subscribe for $7 a month |
| `pricing.cta.yearly` | Оформить за $49 в год | Subscribe for $49 a year |
| `pricing.cta.open` | Открыть студию | Open the studio |
| `pricing.cta.needAuth` | Войти и оформить | Sign in and subscribe |
| `pricing.busy` | Открываем оплату | Opening checkout |
| `pricing.current` | Ваш текущий план | Your current plan |
| `pricing.until` | Оплачено до {date} | Paid through {date} |
| `pricing.canceling` | Подписка закончится {date} и не продлится | The subscription ends {date} and will not renew |
| `pricing.manage` | Управлять подпиской | Manage subscription |
| `pricing.disabled` | Оплата пока не подключена. Все возможности Pro сейчас открыты всем. | Payments are not connected yet. Every Pro feature is open to everyone right now. |
| `pricing.upgrade` | Улучшить | Upgrade |
| `pricing.errDisabled` | Оплата пока не подключена. | Payments are not connected yet. |
| `pricing.errAuth` | Сначала войдите: подписку нужно к чему-то привязать. | Sign in first: a subscription needs an account to live on. |
| `pricing.errAlready` | Подписка уже активна. | The subscription is already active. |
| `pricing.errInvalid` | Неизвестный тариф. Обновите страницу. | Unknown plan. Reload the page. |
| `pricing.errFailed` | Не получилось открыть оплату. Попробуйте ещё раз через минуту. | Could not open checkout. Try again in a minute. |
| `checkout.successTitle` | Оплата прошла, спасибо | Payment went through, thank you |
| `checkout.successBody` | Pro включится в течение минуты. Если возможности ещё закрыты, обновите страницу. | Pro will switch on within a minute. If features still look locked, reload the page. |
| `checkout.cancelTitle` | Оплата отменена | Checkout cancelled |
| `checkout.cancelBody` | Ничего не списано, студия работает как прежде. | Nothing was charged, the studio works exactly as before. |
| `checkout.dismiss` | Закрыть | Dismiss |
| `export.pngHd` | PNG для печати | Print PNG |
| `export.pdfPromo` | Сделано в Endgrain Studio, endgrain.app | Made in Endgrain Studio, endgrain.app |
| `projects.errorLimit` | Бесплатный аккаунт хранит 3 проекта. Откройте тарифы, чтобы снять ограничение. | A free account holds 3 projects. Open the pricing page to lift the limit. |
| `projects.limitHint` | Занято {used} из {limit} мест бесплатного плана | {used} of {limit} free slots used |
| `landing.pricing.title` | Сколько это стоит | What it costs |
| `landing.pricing.body` | Инструмент открыт целиком. Pro снимает лимит облачных проектов, убирает подпись с PDF и даёт PNG для печати. | The tool is open in full. Pro lifts the cloud project limit, drops the credit line from the PDF and unlocks print-ready PNG. |

`pricing.until` и `pricing.canceling` подставляют дату через `toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')`.

## 4. Тест-план

### Unit (vitest)

`lib/stripe/config.test.ts`
- `isStripeConfigured()` даёт `false` при пустом окружении;
- даёт `false`, если задан только секретный ключ, только секрет вебхука, только цены (три отдельных случая);
- даёт `true`, когда заданы все четыре;
- `hasPublicPrices()` не зависит от серверных ключей.
Переменные подменяются через `vi.stubEnv` с `vi.resetModules()`, потому что значения читаются на верхнем уровне модуля.

`lib/stripe/signature.test.ts` (моков нет вообще, HMAC считается прямо в тесте через `node:crypto`)
- корректная подпись проходит;
- заголовок `null` -> `'no-header'`;
- пустой секрет -> `'no-secret'`;
- заголовок без `t=` или без `v1=` -> `'malformed'`;
- подпись от другого секрета -> `'mismatch'`;
- подпись короче или длиннее ожидаемой (проверка, что `timingSafeEqual` не бросает) -> `'mismatch'`;
- timestamp старше 300 секунд -> `'too-old'`;
- timestamp старше 300 секунд, но `toleranceSec: 100000` -> проходит;
- заголовок с двумя `v1`, из которых верна вторая -> проходит (сценарий ротации секрета).

`lib/stripe/events.test.ts` (фикстуры - урезанные, но реальные по форме JSON-объекты событий, лежат прямо в тесте)
- `customer.subscription.created` со свежей формой (период в `items.data[0]`) разбирается, `plan` и `priceId` правильные;
- то же со старой формой (период на верхнем уровне);
- ни одной формы -> `currentPeriodEnd === null`, но событие всё равно разбирается;
- `customer.subscription.deleted` даёт `status: 'canceled'`;
- `cancel_at_period_end: true` доезжает;
- отсутствие `metadata.supabase_user_id` -> `null`;
- чужой тип события (`invoice.paid`) -> `null`;
- полностью посторонний объект (`{}`, строка, `null`) -> `null`;
- неизвестный `price.id` -> план `'monthly'`, событие не отбрасывается.

`lib/stripe/pro.test.ts` (только чистая `resolveProStatus`)
- `null` -> не Pro, `reason: 'free'`;
- `active` с периодом в будущем -> Pro;
- `trialing` -> Pro;
- `past_due` в пределах грейса -> Pro;
- `active` с периодом, истёкшим 1 день назад -> Pro (грейс 3 дня);
- `active` с периодом, истёкшим 5 дней назад -> не Pro;
- `canceled` -> не Pro, но `plan` и `currentPeriodEnd` сохранены в ответе;
- `active` без периода (`null`) -> Pro;
- `cancelAtPeriodEnd: true` при `active` -> Pro и флаг в ответе.

`lib/stripe/plans.test.ts`
- `priceIdFor` и `planForPriceId` взаимно обратны при заданных переменных;
- `planForPriceId('price_unknown')` -> `null`;
- при пустых переменных `planForPriceId('')` -> `null`, а не `'monthly'` (иначе пустой price id в CI совпал бы с пустой переменной).

`components/pricing/PricingPlans.test.tsx` (testing-library, экшен замокан через `vi.mock('@/app/actions/billing')`)
- `billingEnabled: false` -> виден `pricing-disabled`, кнопок покупки нет;
- `billingEnabled: true, signedIn: false` -> ссылка на вход, кнопок покупки нет;
- `billingEnabled: true, signedIn: true, pro: false` -> обе кнопки покупки на месте;
- `pro: true, reason: 'subscription'` -> виден `pricing-current`, кнопок покупки нет;
- ошибка от экшена -> виден `pricing-error` с текстом по коду;
- `mode: 'link'` -> обе карточки рендерятся, ни одного вызова экшена.

`components/UpgradeButton.test.tsx`
- `billingEnabled: false` -> ничего не отрендерено;
- `pro: true` -> виден `pro-badge`;
- `pro: false` -> виден `upgrade-button` со ссылкой на `/pricing`.

`app/actions/projects.test.ts` (файл уже существует, дополняется)
- при `pro: false` и четвёртом проекте возвращается `'limit'` и вставки не происходит;
- при `pro: true` четвёртый проект сохраняется.

Роут вебхука unit-тестом не покрывается: он состоит из склейки уже покрытых чистых функций и походов в Supabase, мок которых проверял бы мок. Его логика проверяется e2e при живых ключах.

### E2E (Playwright)

`e2e/billing.spec.ts`. Две группы.

Группа «без ключей» выполняется всегда, в том числе в CI, и это самый ценный тест этой задачи, потому что именно так проект поедет на конкурс:
- `/pricing` открывается, виден `pricing-plans`, обе карточки на месте;
- виден `pricing-disabled`, элементов `pricing-buy-monthly` и `pricing-buy-yearly` на странице нет;
- в шапке студии нет `upgrade-button`;
- на `/landing` виден `landing-pricing`;
- на редакторе видны и работают обе кнопки PNG, включая `export-png-hd`: без кассы всё открыто, замка нет;
- `/?checkout=success` показывает `checkout-banner`, крестик его закрывает.

Группа «с живыми ключами» пропускается по образцу `e2e/auth.spec.ts`:

```ts
const enabled = process.env['E2E_STRIPE'] === '1'
test.describe('оплата', () => {
  test.skip(!enabled, 'Требует тестовых ключей Stripe: запускать локально с E2E_STRIPE=1')
  ...
})
```

Внутри: вход тестовым пользователем, `/pricing`, клик по `pricing-buy-monthly`, ожидание редиректа на `checkout.stripe.com`. Дальше форму Stripe не заполняем: гонять тестовую карту через чужой UI в CI - это тест чужой вёрстки, который сломается от их редизайна. Проверяем ровно то, за что отвечаем: сессия создалась и нас на неё увели.

Проверка вебхука руками, не автотестом: `stripe listen --forward-to localhost:3100/api/stripe/webhook` плюс `stripe trigger customer.subscription.created`. Процедура в разделе 8.

### Гейты качества

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e` - все зелёные без единой переменной Stripe в окружении. Это обязательное условие приёмки: если тест падает без ключей, он написан неправильно.

## 5. Файлы

### Создать

| Путь | Что |
|---|---|
| `supabase/migrations/20260812130000_phase9_subscriptions.sql` | таблица, индексы, RLS (полный текст в разделе 6) |
| `lib/stripe/config.ts` | ключи, `isStripeConfigured`, `hasPublicPrices` |
| `lib/stripe/config.test.ts` | тесты гварда |
| `lib/stripe/plans.ts` | `PlanId`, лимиты, `priceIdFor`, `planForPriceId` |
| `lib/stripe/plans.test.ts` | тесты сопоставления цен |
| `lib/stripe/signature.ts` | `verifyStripeSignature` |
| `lib/stripe/signature.test.ts` | девять случаев подписи |
| `lib/stripe/events.ts` | `parseSubscriptionEvent`, zod-схема |
| `lib/stripe/events.test.ts` | фикстуры событий |
| `lib/stripe/pro.ts` | `resolveProStatus`, `getProStatus`, `ProStatus` |
| `lib/stripe/pro.test.ts` | тесты чистого ядра |
| `lib/stripe/billing.ts` | `CheckoutResult`, `CheckoutError` |
| `lib/supabase/admin.ts` | service-role клиент и его гвард |
| `app/actions/billing.ts` | `createCheckoutAction` |
| `app/api/stripe/webhook/route.ts` | `POST`, `runtime = 'nodejs'` |
| `app/pricing/page.tsx` | страница тарифов в студии |
| `components/ProProvider.tsx` | `ProProvider`, `usePro` |
| `components/pricing/PricingPlans.tsx` | обе карточки, оба режима |
| `components/pricing/PricingPlans.test.tsx` | шесть состояний |
| `components/UpgradeButton.tsx` | кнопка и бейдж в шапке |
| `components/UpgradeButton.test.tsx` | три состояния |
| `components/CheckoutBanner.tsx` | баннер возврата из кассы |
| `components/landing/PricingSection.tsx` | секция лендинга |
| `e2e/billing.spec.ts` | две группы сценариев |

### Изменить

| Путь | Что именно |
|---|---|
| `app/layout.tsx` | обернуть детей в `ProProvider` с посчитанным на сервере значением |
| `app/page.tsx` | принять `PageProps<'/'>`, разобрать `?checkout=`, отрисовать `CheckoutBanner` |
| `app/actions/projects.ts` | лимит в `saveProjectAction`, код `'limit'` в `ProjectsError` |
| `app/actions/projects.test.ts` | два новых случая |
| `components/ProjectsPanel.tsx` | `'limit'` в `ERROR_KEYS`, подсказка со счётчиком мест |
| `components/StudioShell.tsx` | `<UpgradeButton />` в шапку после `<AccountButton />` |
| `components/ExportPanel.tsx` | формат `'png-hd'`, замок при `!pro`, `pro` в `buildInstructionPdf` |
| `components/ExportPanel.test.tsx` | новая кнопка и состояние замка |
| `lib/export/pdf.ts` | поле `pro` в `PdfInput`, промо-строка на последней странице |
| `lib/i18n/ru.ts`, `lib/i18n/en.ts` | ключи из таблицы раздела 3 |
| `app/(landing)/landing/page.tsx` | `<PricingSection>` между `BooksTeaser` и финальным CTA |
| `components/landing/LandingFooter.tsx` | ссылка на тарифы в колонке «Продукт» |
| `app/sitemap.ts` | запись `${APP_ORIGIN}/pricing` с приоритетом 0.6 |
| `README.md` | четыре новые переменные в таблицу, правка строки про `SUPABASE_SERVICE_ROLE_KEY`, короткий раздел «Монетизация» |

### Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| `STRIPE_SECRET_KEY` | для кассы | Секретный ключ (`sk_live_` или `sk_test_`). Серверная, в бандл не попадает. |
| `STRIPE_WEBHOOK_SECRET` | для кассы | Секрет эндпоинта вебхука (`whsec_`). Серверная. |
| `NEXT_PUBLIC_STRIPE_PRICE_MONTHLY` | для кассы | Id месячной цены (`price_...`). Публичная, инлайнится в бандл. |
| `NEXT_PUBLIC_STRIPE_PRICE_YEARLY` | для кассы | Id годовой цены. Публичная. |
| `NEXT_PUBLIC_STRIPE_PORTAL_URL` | нет | Ссылка на hosted Customer Portal. Без неё пункт «Управлять подпиской» не рендерится. |
| `SUPABASE_SERVICE_ROLE_KEY` | для вебхука | Уже есть в проекте, но до сих пор не использовался в коде. Нужен вебхуку, чтобы писать в `subscriptions` в обход RLS. |
| `E2E_STRIPE` | нет | `1` включает группу e2e с живыми ключами. По умолчанию пропускается. |

## 6. Миграция SQL

Файл `supabase/migrations/20260812130000_phase9_subscriptions.sql`, полный текст:

```sql
-- Фаза 9: подписка Pro через Stripe.
-- Одна строка на пользователя. Пишет в таблицу только вебхук под service-role
-- ключом, пользователь свою строку исключительно читает. Отсюда единственная
-- политика на select и отсутствие политик на запись: это не забывчивость,
-- а требование. Любая запись из браузера означала бы, что Pro включается
-- подделкой запроса.

create table if not exists public.subscriptions (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id     text not null,
  stripe_subscription_id text not null,
  price_id               text not null,
  plan                   text not null,
  status                 text not null,
  -- Может быть null: в API-версиях начиная с 2025-03-31.basil период переехал
  -- на элементы подписки, и в редких формах события его нет вовсе.
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  -- event.created последнего применённого события. Защита от ретрая Stripe,
  -- который может доставить created после updated и откатить активную подписку.
  last_event_at          timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint subscriptions_plan_allowed
    check (plan in ('monthly', 'yearly')),
  constraint subscriptions_status_allowed
    check (status in (
      'trialing', 'active', 'past_due', 'canceled',
      'incomplete', 'incomplete_expired', 'unpaid', 'paused'
    )),
  constraint subscriptions_customer_len
    check (char_length(stripe_customer_id) between 1 and 255),
  constraint subscriptions_subscription_len
    check (char_length(stripe_subscription_id) between 1 and 255),
  constraint subscriptions_price_len
    check (char_length(price_id) between 1 and 255)
);

comment on table public.subscriptions is 'Активные и прошлые подписки Pro. Единственный писатель - вебхук Stripe под service-role ключом';
comment on column public.subscriptions.last_event_at is 'event.created последнего применённого события Stripe, старее не применяем';
comment on column public.subscriptions.current_period_end is 'Конец оплаченного периода, null допустим';

-- Одна подписка Stripe не может принадлежать двум пользователям.
create unique index if not exists subscriptions_stripe_subscription_idx
  on public.subscriptions (stripe_subscription_id);

-- Разбор обращений в поддержку идёт от идентификатора клиента Stripe.
create index if not exists subscriptions_customer_idx
  on public.subscriptions (stripe_customer_id);

-- updated_at двигает та же триггерная функция, что и у projects
-- (создана в 20260812090000, search_path зафиксирован в 20260812091000).
drop trigger if exists subscriptions_touch_updated_at on public.subscriptions;
create trigger subscriptions_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

alter table public.subscriptions enable row level security;

-- Читать свою строку может владелец: страница тарифов показывает план и дату.
drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Политик insert, update и delete нет сознательно. Под RLS без политики операция
-- запрещена, а service-role ключ RLS обходит. Значит записать строку может
-- только вебхук, и никакой запрос из браузера, даже с валидным JWT, Pro не включит.
```

Применяется через Supabase MCP (`apply_migration`) или через `supabase db push`. После применения обязательно прогнать `get_advisors` по образцу миграции `20260812091000`: линтер Supabase ругается на таблицы с RLS без политик и на функции без `search_path`, и результат должен быть чистым.

## 7. Чего сознательно не делаем

**Свой Customer Portal.** Отмена, смена карты, счета и история платежей - всё это Stripe уже нарисовал и поддерживает. Мы даём ссылку на hosted-портал из `NEXT_PUBLIC_STRIPE_PORTAL_URL` и на этом останавливаемся. Свой UI управления подпиской - это ещё один экран, ещё три server action и ещё один источник расхождения с реальным состоянием в Stripe.

**Usage-based биллинг, кредиты, счётчики.** Ни одного счётчика потребления. Подписка либо есть, либо нет.

**Тарифы Lifetime и Studio из исходного spec.** Lifetime потребовал бы второй ветки в вебхуке (`mode: 'payment'`, `checkout.session.completed`, отсутствие подписки как объекта), Studio - функций, которых в продукте нет. Обе строки удаляются из планов до тех пор, пока Pro не начнёт продаваться.

**Триалы и промокоды в интерфейсе.** `allow_promotion_codes=true` в сессии оплаты включён, то есть поле для промокода на странице Stripe есть, но своего UI со списком акций мы не делаем.

**Налоги, инвойсы, юрлица.** Stripe Tax не включаем, поле VAT не собираем. Для конкурсного продукта на предпродажной стадии это преждевременно.

**Письмо после оплаты.** Stripe сам шлёт чек. Своё приветственное письмо через Resend - хорошая идея на потом, не в этой задаче.

**Обработка `invoice.payment_failed`.** Неудачный платёж и так приезжает как `customer.subscription.updated` со статусом `past_due`. Отдельная ветка ради письма-напоминания не нужна, письма шлёт Stripe.

**Хранение `email` в `subscriptions`.** Он уже есть в `auth.users`, дублировать его - заводить второй источник правды и лишние обязательства по персональным данным.

**Реакция на смену цены в Dashboard.** Если цену пересоздать, старые подписки продолжат работать (`planForPriceId` вернёт `null`, план запишется `'monthly'`, Pro останется). Автоматической миграции подписок на новую цену нет.

**Скрытие Pro-функций от глаз.** Заблокированное показывается с замком, а не прячется. Человек должен видеть, что он получит за деньги, иначе гейт не продаёт, а просто раздражает.

## 8. Ручные шаги владельца

Не блокируют разработку: до их выполнения всё работает в guard-режиме и все тесты зелёные.

1. Stripe Dashboard -> Product «Endgrain Studio Pro», две recurring-цены: $7 в месяц и $49 в год. Скопировать оба `price_...`.
2. Developers -> API keys -> секретный ключ.
3. Developers -> Webhooks -> добавить эндпоинт `https://app.endgrain.app/api/stripe/webhook`, выбрать ровно три события: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Скопировать `whsec_...`.
4. Settings -> Billing -> Customer portal -> включить, скопировать ссылку no-code портала.
5. Заложить все пять переменных в Vercel (Production и Preview) плюс убедиться, что `SUPABASE_SERVICE_ROLE_KEY` там уже есть.
6. Сверить цифры в `lib/i18n/{ru,en}.ts` (`pricing.pro.monthlyPrice`, `pricing.pro.yearlyPrice`, `pricing.cta.monthly`, `pricing.cta.yearly`) с ценами в Dashboard. Расхождение здесь - прямой путь к спору с клиентом.
7. Локальная проверка вебхука до включения на проде: `stripe login`, затем `stripe listen --forward-to localhost:3100/api/stripe/webhook`, затем в соседнем терминале `stripe trigger customer.subscription.created`. Ожидаемое: в логе `200 ok`, в таблице `subscriptions` появилась строка. Событие от `stripe trigger` придёт без `metadata.supabase_user_id`, то есть штатный ответ будет `200 ignored` - это правильное поведение, а для проверки записи нужно пройти настоящий чек-аут тестовой картой `4242 4242 4242 4242`.
8. После первого живого платежа: открыть `/pricing` под тем же аккаунтом и убедиться, что виден `pricing-current`, а не кнопки покупки.
