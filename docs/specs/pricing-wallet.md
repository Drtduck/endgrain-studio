# Спека: тарифы, кошелёк и оплата генераций

Статус: принято владельцем, к исполнению. Автор спеки: архитектурный агент, 14.08.2026.
Исполнителю: спека самодостаточна. Все пути от корня репозитория, все суммы в центах, все
идентификаторы и testid приведены буквально. Длинное тире запрещено во всём, что пишется по этой
спеке: код, комментарии, коммиты, UI-тексты.

## 0. Что меняем и зачем

1. Продукт «Пропуск» ($19 / 90 дней) снимается с продажи и вычищается из кода, витрины и Stripe.
   Уже купленные пропуска дорабатывают свой срок.
2. На витрине остаются три карточки: Free, Pro «от $7.50 в месяц», Developer «от $16.67 в месяц».
   Никаких объяснений про месяц/год в текстах: период человек выбирает на странице Stripe
   встроенным тумблером (Subscription upsells).
3. Оплата генераций сверх бесплатной квоты: пакеты кадров (frames) за деньги, наценка x2.5 к
   себестоимости 8 центов за кадр. Один прозрачный счётчик «осталось кадров».
4. Залогиненный видит на витрине свой текущий тариф.

Порядок работ (по волнам, каждая волна = отдельный PR):

- Волна A: удаление Пропуска + новые тексты + upsell-правки в коде (разделы 1-3).
- Волна B: карточка текущего плана на витрине (раздел 4).
- Волна C: кадры, миграция, списание, экран покупки, учёт себестоимости (разделы 5-8).

Волны A и B не зависят от C и могут ехать на прод раньше.

---

## 1. Удаление продукта «Пропуск»

### 1.1 Принцип обратной совместимости

Удаляем **путь продажи**, не трогаем **выданные права**. Это значит:

- Таблица `public.pro_passes` остаётся. Строки не трогаем, миграцию не откатываем.
- Функция `grant_pro_pass` остаётся (мёртвая, но безопасная).
- Ветка вебхука `payment.kind === 'pro_pass'` в `app/api/stripe/webhook/route.ts:81` **остаётся**
  минимум до 01.11.2026: сессия Checkout живёт 24 часа, и событие по последней покупке может
  приехать уже после деплоя. Над веткой добавить комментарий:
  `// Пропуск снят с продажи 08.2026, ветка живёт ради поздних событий. Удалить после 01.11.2026.`
- `ProReason` сохраняет значение `'pass'`, `resolveProStatus` и `readPassRow` в `lib/stripe/pro.ts`
  не меняются: человек с живым пропуском обязан продолжать видеть Pro.
- `lib/stripe/oneTime.ts` сохраняет `'pro_pass'` в `OneTimeKind` и `kindSchema`.

### 1.2 Что удалить в коде

| Файл | Что делаем |
| --- | --- |
| `lib/stripe/config.ts:26` | удалить `STRIPE_PRICE_PASS` |
| `lib/stripe/config.ts:68-70` | удалить `hasPassPrice()` |
| `app/actions/billing.ts:7` | убрать `hasPassPrice`, `STRIPE_PRICE_PASS` из импорта |
| `app/actions/billing.ts:12` | `const planSchema = z.enum(['pro', 'api'])` |
| `app/actions/billing.ts:29` | удалить гвард `product === 'pass'` |
| `app/actions/billing.ts:46-55` | ветку `else` (pass) удалить, оставить `pro` и `api` |
| `app/actions/billing.ts:60-72` | тернарник по `pass` убрать: остаётся один `URLSearchParams` для `mode=subscription` |
| `app/actions/billing.ts` | комментарий шапки переписать: две ветки, не три |
| `app/pricing/page.tsx:10,73,75` | убрать `hasPassPrice`, props `passEnabled`, `passExpiresAt` |
| `app/pricing/page.tsx:39-43` | вызов `getSubscriptionStatus('pro')` для даты пропуска **оставить** (см. 1.4) |
| `components/pricing/PricingPlans.tsx:28,32` | удалить props `passEnabled`, `passExpiresAt` |
| `components/pricing/PricingPlans.tsx:35` | `type CheckoutPlan = Product` (алиас можно удалить целиком) |
| `components/pricing/PricingPlans.tsx:68-73` | удалить `PASS_FEATURES` |
| `components/pricing/PricingPlans.tsx:201-203` | удалить `passBuyBlocked` |
| `components/pricing/PricingPlans.tsx:220-260` | удалить секцию `pricing-pass` целиком |
| `components/pricing/PricingPlans.tsx:207` | сетка становится `sm:grid-cols-2 lg:grid-cols-3` |
| `components/landing/PricingSection.tsx:3,29,31` | убрать `hasPassPrice`, `passEnabled`, `passExpiresAt` |
| `lib/analytics/events.ts:12` | `readonly checkout_started: { readonly plan: 'pro' \| 'api' }` |
| `lib/seo/jsonld.ts:64` | удалить offer `{ price: '19', name: 'Pass' }` |
| `lib/stripe/plans.ts:11` | комментарий про `'pass'` переписать (продукта больше нет) |
| `docs/tech-debt.md:216` | пометить пункт как снятый с продажи |

### 1.3 i18n-ключи к удалению

`lib/i18n/ru.ts:524-532` и зеркально `lib/i18n/en.ts:524-532`:

```
pricing.pass.name, pricing.pass.price, pricing.pass.note,
pricing.pass.f.days, pricing.pass.f.ai, pricing.pass.f.noRenew, pricing.pass.f.why,
pricing.pass.cta, pricing.pass.until
```

Взамен добавляется один ключ для унаследованных пропусков (см. 1.4).

### 1.4 Что видит человек с живым пропуском

`app/pricing/page.tsx` продолжает читать `getSubscriptionStatus('pro')` и передаёт новый проп:

```ts
readonly legacyPassUntil: string | null   // proSubscription.reason === 'pass' ? proSubscription.currentPeriodEnd : null
```

В карточке Pro, когда `legacyPassUntil !== null` и подписки нет, над кнопкой покупки рисуется
строка (testid `pricing-legacy-pass`):

- ru `'pricing.legacyPass'`: `Ваш пропуск работает до {date}. Продлить его нельзя, дальше только подписка.`
- en `'pricing.legacyPass'`: `Your pass runs through {date}. It cannot be renewed; a subscription takes it from there.`

Кнопка «Оформить Pro» при этом активна: апгрейд с пропуска на подписку разрешён (как и сейчас).

### 1.5 Тесты к правке

| Файл | Что |
| --- | --- |
| `app/actions/billing.test.ts:15,18,102,114` | удалить кейсы покупки `'pass'` и мок `STRIPE_PRICE_PASS`/`hasPassPrice`; кейс «`reason='pass'` не блокирует покупку Pro» (строки 7, 46) **оставить** |
| `components/pricing/PricingPlans.test.tsx:20,22,112-142` | удалить props и все кейсы карточки Пропуска; добавить кейс `pricing-legacy-pass` |
| `app/api/stripe/webhook/route.test.ts:382-402` | **оставить** (ветка вебхука жива) |
| `lib/stripe/pro.test.ts:82-105` | **оставить** |
| `lib/supabase/migrations.proPasses.test.ts` | **оставить** |
| `lib/stripe/oneTime.test.ts:34-37` | **оставить** |

### 1.6 Env

- Vercel (Production, Preview, Development): удалить `NEXT_PUBLIC_STRIPE_PRICE_PASS`.
- Удалить упоминание из `.env.example` и из любого README/доки, где оно есть
  (`grep -rn "STRIPE_PRICE_PASS" --include='*.md' --include='*.example' .`).

### 1.7 Stripe Dashboard

Ничего не удалять, только архивировать, иначе история платежей и чеки поедут:

1. Products -> найти продукт Пропуска -> Price ($19 one-time) -> «...» -> **Archive price**.
2. Затем сам Product -> «...» -> **Archive product**.
3. Повторить в **test mode** и в **live mode**.
4. Payment Links, если для Пропуска заводился, деактивировать.

---

## 2. Тексты карточек Pro и Developer

Правило: цена в карточке пишется как «от $X в месяц», ни слова про переключение периода, про
«два месяца в подарок» и про «год стоит как десять месяцев». Всё это человек увидит в тумблере
Stripe своими глазами.

### 2.1 `lib/i18n/ru.ts`

Заменить строки 491-492, 507, 538-541:

```ts
'pricing.pro.monthlyPrice': 'от $7.50',
'pricing.pro.monthlyPeriod': 'в месяц',
'pricing.pro.note': 'Отменить можно в любой момент, доступ доработает оплаченный срок.',
'pricing.cta.pro': 'Оформить Pro',

'developer.price': 'от $16.67',
'developer.period': 'в месяц',
'developer.note': 'Ключи, MCP-сервер и лимиты под агентов.',
'developer.cta': 'Подключить Developer',
```

Удалить ключи `'pricing.pro.checkoutHint'` и `'developer.checkoutHint'` вместе с их рендером
(`PricingPlans.tsx:337-343` и блок `pricing-api-hint`).

### 2.2 `lib/i18n/en.ts`

```ts
'pricing.pro.monthlyPrice': 'from $7.50',
'pricing.pro.monthlyPeriod': 'a month',
'pricing.pro.note': 'Cancel anytime; access runs to the end of the paid period.',
'pricing.cta.pro': 'Get Pro',

'developer.price': 'from $16.67',
'developer.period': 'a month',
'developer.note': 'Keys, MCP server and agent-grade limits.',
'developer.cta': 'Get Developer',
```

### 2.3 Заголовок и подзаголовок страницы

Не трогаем: `pricing.title` и `pricing.subtitle` про период ничего не обещают.

### 2.4 Тест, который упадёт

`components/pricing/PricingPlans.test.tsx:47-53` завязан на подстроку «два месяца в подарок».
Заменить проверку на:

```ts
it('вошедшему без Pro карточка Pro показывает ровно одну кнопку покупки и цену «от $7.50»', () => {
  const { container } = setup()
  const button = container.querySelector('[data-testid="pricing-buy-pro"]')
  expect(button).not.toBe(null)
  expect(container.querySelector('[data-testid="pricing-pro"]')?.textContent).toContain('от $7.50')
  expect(container.querySelector('[data-testid="pricing-pro"]')?.textContent).not.toContain('в подарок')
})
```

---

## 3. Subscription upsells: Dashboard плюс правки в коде

### 3.1 Почему сессия обязана стартовать с месячной цены

Тумблер периода на странице Checkout рисует механизм Stripe **Subscription upsells**
(https://docs.stripe.com/payments/checkout/upsells). Он показывает пару «дешевле -> дороже», то
есть в `line_items` должна лежать **месячная** цена, а годовая подключается к ней как upsell.
Требования механизма, все обязаны выполняться: один и тот же Product, одна валюта, оба Price
`type=recurring`, сессия `mode=subscription`, ровно один recurring line item. Ни Pricing Table, ни
`adjustable_quantity`, ни `optional_items`, ни Payment Links этого не дают. Настраивается только
в Dashboard, через API не создаётся.

### 3.2 Правка кода

`lib/stripe/config.ts:32-38`: удалить `STRIPE_PRO_DEFAULT_PRICE` целиком. Переменная больше не
имеет допустимых значений: `'yearly'` ломает upsell, значит выбор фиктивный.

`lib/stripe/plans.ts:30-33`: `checkoutPriceFor` становится

```ts
/**
 * Цена, с которой стартует Checkout Session. Всегда месячная и для Pro, и для API:
 * тумблер месяц/год рисует Subscription upsell, настроенный в Dashboard, а он
 * работает только когда сессия стартует с более дешёвой (месячной) цены.
 */
export function checkoutPriceFor(product: Product): string {
  return product === 'api' ? STRIPE_PRICE_API_MONTHLY : STRIPE_PRICE_MONTHLY
}
```

Импорт `STRIPE_PRO_DEFAULT_PRICE` и `STRIPE_PRICE_YEARLY` из `plans.ts` убрать, если после правки
`STRIPE_PRICE_YEARLY` там остаётся только в `priceIdFor`/`resolvePriceId` (он там нужен, не удалять).

`isStripeConfigured()` продолжает требовать обе цены Pro: годовая нужна для `resolvePriceId` при
разборе вебхука после переключения тумблера.

Vercel: удалить env `STRIPE_PRO_DEFAULT_PRICE` из всех окружений.

### 3.3 Инструкция для Dashboard (делать в test mode, затем повторить в live mode)

Обязательное условие: у Pro один Product с двумя ценами (monthly $9, yearly $90), у Developer один
Product с двумя ценами (monthly $20, yearly $200). Если сейчас годовая цена лежит в отдельном
Product, upsell не появится: сначала перенести цену в тот же Product (создать новый Price в нужном
Product, старый архивировать).

1. **Settings -> Payments -> Checkout and Payment Links -> Pricing display**: включить
   «Show yearly prices as monthly» (per month). Без этого на форме будет «$90 per year», а не
   «$7.50 per month», и обещание карточки «от $7.50» разойдётся с формой оплаты.
2. **Products -> Pro -> Pricing -> Monthly $9 -> кнопка «...» -> Upsells -> Upsells to**: выбрать
   годовую цену $90. Сохранить.
3. То же для Developer: Product Developer -> Price $20/month -> Upsells -> Upsells to -> $200/year.
4. Проверка в test mode: открыть витрину, нажать «Оформить Pro», на странице Stripe обязаны быть
   видны тумблер месяц/год и подпись «$7.50 per month» при выборе года.
5. Повторить пункты 1-3 в live mode (настройки Upsells не переносятся между режимами).

Ничего в коде после этого менять не нужно: `subscription_data[metadata][product]` уже проставляется
в `app/actions/billing.ts`, поэтому после переключения тумблера вебхук всё равно узнаёт продукт
(см. комментарий в `lib/stripe/events.ts` про приоритет metadata над `resolvePriceId`).

---

## 4. Текущий тариф на витрине

### 4.1 Данные

`app/pricing/page.tsx` расширяет проп-набор `PricingPlans`:

```ts
readonly reason: ProReason                    // уже есть
readonly apiSubscribed: boolean               // уже есть
readonly apiPeriodEnd: string | null          // новое: apiStatus.currentPeriodEnd
readonly apiCancelAtPeriodEnd: boolean        // новое: apiStatus.cancelAtPeriodEnd
readonly legacyPassUntil: string | null       // новое, см. 1.4
```

### 4.2 Правило пометки

Ровно одна карточка помечена как текущая. Приоритет: Pro-подписка -> Developer-подписка ->
служебный доступ (`flag`/`allowlist`) -> Free.

```ts
type CurrentPlan = 'free' | 'pro' | 'developer' | 'granted'

const currentPlan: CurrentPlan =
  reason === 'subscription' ? 'pro'
  : reason === 'flag' || reason === 'allowlist' ? 'granted'
  : apiSubscribed ? 'developer'
  : 'free'
```

`granted` помечает карточку Pro (человек фактически пользуется Pro), но с другим текстом и без даты.
Developer-подписка помечается независимо от Pro: у Developer своя строка в `subscriptions`, и
человек может держать оба продукта. Поэтому бейдж рисуется по двум флагам:

```ts
const proBadge = currentPlan === 'pro' || currentPlan === 'granted'
const devBadge = apiSubscribed
const freeBadge = currentPlan === 'free' && !apiSubscribed
```

### 4.3 Разметка

Общий компонент внутри `PricingPlans.tsx`:

```tsx
function CurrentBadge({ locale, testId, label }: { locale: Locale; testId: string; label: MessageKey }) {
  return (
    <span
      data-testid={testId}
      className="w-fit rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-[11px] font-semibold tracking-wide text-accent uppercase"
    >
      {t(locale, label)}
    </span>
  )
}
```

Карточка текущего плана получает `aria-current="true"` и усиленную рамку:
`ring-2 ring-accent-border` поверх базовых классов `CARD_BASE`.

Что показывает каждая карточка:

| Карточка | Состояние | Что видно | testid |
| --- | --- | --- | --- |
| Free | `freeBadge` | бейдж «Ваш план», без кнопок | `pricing-free-badge` |
| Free | иначе | как сейчас (без CTA) | - |
| Pro | `currentPlan === 'pro'` | бейдж «Ваш план», дата (`pricing.until` или `pricing.canceling`), ссылка на портал | `pricing-pro-badge`, `pricing-period`, `pricing-manage` |
| Pro | `currentPlan === 'granted'` | бейдж «Доступ открыт», строка-пояснение, кнопки покупки нет | `pricing-pro-badge`, `pricing-granted-note` |
| Pro | пропуск жив (1.4) | строка `pricing-legacy-pass` + активная кнопка покупки | `pricing-legacy-pass`, `pricing-buy-pro` |
| Pro | остальные | кнопка покупки как сейчас | `pricing-buy-pro` |
| Developer | `apiSubscribed` | бейдж «Ваш план», дата, ссылка на портал | `pricing-developer-badge`, `pricing-api-period`, `pricing-api-manage` |
| Developer | иначе | кнопка покупки | `pricing-buy-api` |

Отдельной «отключённой кнопки» не рисуем: кнопка, которую нельзя нажать, шумит. На месте CTA
текущего плана стоит дата плюс ссылка на портал, это и есть полезное действие.

Существующий `data-testid="pricing-current"` сохранить как есть (на нём висят e2e), но перевести
его на общий бейдж: `pricing-pro-badge` и `pricing-current` могут быть одним элементом с двумя
атрибутами не могут, поэтому оставляем `pricing-current` для Pro и добавляем новые testid для
остальных карточек.

### 4.4 Новые i18n-ключи

```ts
// ru
'pricing.badge.current': 'Ваш план',
'pricing.badge.granted': 'Доступ открыт',
'pricing.granted.note': 'Pro включён вам вручную: подписка не нужна и денег не спишется.',
'pricing.legacyPass': 'Ваш пропуск работает до {date}. Продлить его нельзя, дальше только подписка.',

// en
'pricing.badge.current': 'Your plan',
'pricing.badge.granted': 'Access granted',
'pricing.granted.note': 'Pro is switched on for you manually. No subscription, no charge.',
'pricing.legacyPass': 'Your pass runs through {date}. It cannot be renewed; a subscription takes it from there.',
```

`pricing.until`, `pricing.canceling`, `pricing.manage` переиспользуются для Developer, новых
ключей под него не заводим.

### 4.5 Лендинг

`components/landing/PricingSection.tsx` анонимен: передаёт `reason='free'`, `apiSubscribed=false`,
`apiPeriodEnd=null`, `apiCancelAtPeriodEnd=false`, `legacyPassUntil=null`. Ни один бейдж там не
рисуется, потому что `mode="link"` уже отключает CTA-ветки.

---

## 5. Модель «кадров»

### 5.1 Решение: отдельный ledger кадров, не центы кошелька

Купленные кадры хранятся **в штуках** в новой паре таблиц `ai_credits` / `ai_credit_transactions`,
а не центами в `wallets`. Обоснование:

1. Цена кадра нелинейна по пакетам: 20, 16.67 и 15 центов. Если хранить центы, «сколько кадров у
   меня осталось» станет делением с плавающей точкой и разным делителем в зависимости от того, чем
   человек пополнялся. Счётчик «осталось кадров» перестанет быть честным.
2. Владелец меняет наценку и себестоимость; купленное не должно дешеветь или дорожать задним
   числом. Штука кадра это обязательство перед человеком, цент это выручка.
3. Возврат за упавший кадр обязан вернуть ровно кадр, а не «сколько-то центов по курсу дня».
4. Кошелёк в центах уже занят другим сценарием: `app/actions/video.ts:63` списывает за видео живые
   центы по `videoCostCents`, и там центы правильны, потому что цена секунды линейна.

Кошелёк (`wallets`) остаётся как есть и обслуживает только видео. Кадры и кошелёк живут рядом на
одном экране (раздел 6), но не смешиваются.

### 5.2 Единый счётчик на фронте

`осталось кадров = свободная месячная квота Pro + купленные кадры`.

`lib/ai/quota.ts`, интерфейс `AiAccess` расширяется:

```ts
export interface AiAccess {
  readonly state: AiAccessState
  readonly limit: number          // месячный лимит (30 для Pro, 3 для trial)
  readonly used: number
  /** Остаток бесплатной квоты периода. */
  readonly freeRemaining: number
  /** Купленные кадры на балансе. */
  readonly credits: number
  /** Единый счётчик для интерфейса: freeRemaining + credits. */
  readonly remaining: number
  readonly tier: 'pro' | 'trial' | 'credits' | null
}

export type AiAccessState = 'mock' | 'unavailable' | 'anonymous' | 'free' | 'trial' | 'trialSpent' | 'pro' | 'credits'

export function aiAccess(state: AiAccessState, used = 0, limit = AI_MONTHLY_LIMIT, credits = 0): AiAccess
```

`remaining` намеренно остаётся суммарным: вся логика `components/promo/AiGate.tsx` уже принимает
решение по `remaining <= 0`, и она продолжит работать без правок в ветвлении. Новое состояние
`'credits'` (не Pro, бесплатное кончилось, купленные кадры есть) ведёт себя как незапертое.

Новый пакет фич, которые можно оплачивать кадрами (без Pro):

```ts
/** Что можно купить кадрами без подписки. Совпадает с пробным тиром сознательно:
 *  разбор референса и мокапы мерча остаются Pro-фичами. */
export const AI_CREDIT_FEATURES: readonly AiFeature[] = ['promoShots', 'referenceShots', 'saleListing']
```

### 5.3 Пакеты и цены

Новый чистый файл `lib/ai/packs.ts` (без импортов, читается и клиентом, и сервером):

```ts
export type AiPackId = 'frames10' | 'frames30' | 'frames100'

export interface AiPack {
  readonly id: AiPackId
  readonly frames: number
  readonly priceCents: number
}

/** Наценка x2.5 к себестоимости 8 центов за кадр, с оптовой скидкой на больших пакетах. */
export const AI_PACKS: readonly AiPack[] = [
  { id: 'frames10', frames: 10, priceCents: 200 },   // 20 центов за кадр
  { id: 'frames30', frames: 30, priceCents: 500 },   // 16.67 центов за кадр
  { id: 'frames100', frames: 100, priceCents: 1500 } // 15 центов за кадр
]

export function isAiPackId(value: unknown): value is AiPackId
export function aiPack(id: AiPackId): AiPack
/** Только для отображения: цена кадра в центах с двумя знаками. */
export function perFrameCents(pack: AiPack): number
```

Пресеты кошелька `lib/wallet/format.ts:10` не трогаем: это другой продукт (видео).

### 5.4 Миграция

Новый файл `supabase/migrations/20260815100000_ai_credits.sql`. Идиомы взяты один в один из
`20260813110000_wallet.sql`: insert-first идемпотентность, отсутствие политик записи, доступ только
service_role.

```sql
-- Купленные кадры AI. Штуками, а не центами: цена кадра зависит от пакета,
-- и хранение в деньгах сделало бы счётчик «осталось кадров» делением с разным делителем.

create table if not exists public.ai_credits (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  balance    integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_credits_balance_nonneg check (balance >= 0)
);

comment on table public.ai_credits is 'Баланс купленных кадров AI. Пишут только функции ниже под service-role';

drop trigger if exists ai_credits_touch_updated_at on public.ai_credits;
create trigger ai_credits_touch_updated_at
  before update on public.ai_credits
  for each row execute function public.touch_updated_at();

alter table public.ai_credits enable row level security;

drop policy if exists ai_credits_select_own on public.ai_credits;
create policy ai_credits_select_own on public.ai_credits
  for select to authenticated using (user_id = (select auth.uid()));

-- Ledger кадров. Он же учёт себестоимости и выручки: одна строка на одно
-- денежное или квотное движение, суммы провайдера и выручки лежат тут же.
create table if not exists public.ai_credit_transactions (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  kind                text not null,
  -- В кадрах, со знаком: покупка и возврат положительные, списание нулевое или отрицательное
  -- (ноль значит «списали только бесплатную квоту», строка всё равно нужна для идемпотентности).
  amount              integer not null,
  balance_after       integer not null,
  ref                 text not null,
  feature             text,
  free_units          integer not null default 0,
  credit_units        integer not null default 0,
  provider_cost_cents integer not null default 0,
  revenue_cents       integer not null default 0,
  released            boolean not null default false,
  meta                jsonb,
  created_at          timestamptz not null default now(),
  constraint ai_credit_tx_kind_allowed check (kind in ('purchase', 'grant', 'spend', 'refund')),
  constraint ai_credit_tx_amount_sign check (
    (kind in ('purchase', 'grant', 'refund') and amount > 0) or
    (kind = 'spend' and amount <= 0)
  ),
  constraint ai_credit_tx_balance_nonneg check (balance_after >= 0),
  constraint ai_credit_tx_ref_len check (char_length(ref) between 1 and 255),
  constraint ai_credit_tx_meta_size check (meta is null or pg_column_size(meta) <= 4096)
);

comment on table public.ai_credit_transactions is 'Ledger кадров AI плюс учёт себестоимости: provider_cost_cents и revenue_cents';

create unique index if not exists ai_credit_tx_kind_ref_idx on public.ai_credit_transactions (kind, ref);
create index if not exists ai_credit_tx_user_idx on public.ai_credit_transactions (user_id, created_at desc);

alter table public.ai_credit_transactions enable row level security;

drop policy if exists ai_credit_tx_select_own on public.ai_credit_transactions;
create policy ai_credit_tx_select_own on public.ai_credit_transactions
  for select to authenticated using (user_id = (select auth.uid()));
```

Функции:

```sql
/*
 * Начисление кадров: покупка пакета (kind='purchase') или ручной подарок (kind='grant').
 * Порядок как в wallet_topup: сперва пометка идемпотентности, потом движение баланса.
 * p_revenue_cents кладётся в ledger ради маржи, на баланс не влияет.
 */
create or replace function public.ai_credits_grant(
  p_user_id       uuid,
  p_frames        integer,
  p_ref           text,
  p_kind          text default 'purchase',
  p_revenue_cents integer default 0,
  p_meta          jsonb default null
) returns integer
```

```sql
/*
 * Единая точка списания: сперва бесплатная месячная квота (ai_usage), остаток - кадрами.
 * Одна функция, а не два вызова из JS, ровно потому что это одна транзакция:
 * иначе списание квоты могло бы пройти, а списание кадров упасть, и человек
 * потерял бы бесплатные единицы без единого кадра на выходе.
 *
 * Блокировки берутся до любых записей: сперва считаем, хватает ли всего вместе,
 * и только потом двигаем счётчики. p_allow_free=false для не-Pro: у них
 * месячной квоты нет вовсе, платят только кадрами.
 *
 * Возвращает jsonb:
 *   { ok: true,  free: int, credits: int, credits_balance: int, quota_used: int, replay: bool }
 *   { ok: false, free_available: int, credits_balance: int }
 */
create or replace function public.consume_ai_units(
  p_user_id   uuid,
  p_period    text,
  p_limit     integer,
  p_cost      integer,
  p_ref       text,
  p_feature   text default null,
  p_allow_free boolean default true,
  p_provider_cost_cents integer default 0
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_existing public.ai_credit_transactions%rowtype;
  v_used integer := 0;
  v_free integer := 0;
  v_rest integer := 0;
  v_balance integer := 0;
begin
  if p_cost is null or p_cost <= 0 then
    return jsonb_build_object('ok', false, 'free_available', 0, 'credits_balance', 0);
  end if;

  -- Идемпотентность: тот же ref уже списан (двойной клик, ретрай действия).
  select * into v_existing from public.ai_credit_transactions
   where kind = 'spend' and ref = p_ref;
  if found then
    select coalesce(balance, 0) into v_balance from public.ai_credits where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'replay', true,
      'free', v_existing.free_units, 'credits', v_existing.credit_units,
      'credits_balance', coalesce(v_balance, 0), 'quota_used', 0);
  end if;

  -- Блокируем обе строки до любых записей: два параллельных запроса обязаны разойтись.
  if p_allow_free then
    insert into public.ai_usage (user_id, period, used) values (p_user_id, p_period, 0)
      on conflict (user_id, period) do nothing;
    select used into v_used from public.ai_usage
      where user_id = p_user_id and period = p_period for update;
    v_free := least(p_cost, greatest(p_limit - coalesce(v_used, 0), 0));
  end if;

  insert into public.ai_credits (user_id, balance) values (p_user_id, 0)
    on conflict (user_id) do nothing;
  select balance into v_balance from public.ai_credits where user_id = p_user_id for update;

  v_rest := p_cost - v_free;
  if v_rest > coalesce(v_balance, 0) then
    return jsonb_build_object('ok', false, 'free_available', v_free, 'credits_balance', coalesce(v_balance, 0));
  end if;

  if v_free > 0 then
    update public.ai_usage set used = used + v_free
      where user_id = p_user_id and period = p_period;
  end if;

  if v_rest > 0 then
    update public.ai_credits set balance = balance - v_rest
      where user_id = p_user_id returning balance into v_balance;
  end if;

  insert into public.ai_credit_transactions
    (user_id, kind, amount, balance_after, ref, feature, free_units, credit_units, provider_cost_cents)
  values
    (p_user_id, 'spend', -v_rest, coalesce(v_balance, 0), p_ref, p_feature, v_free, v_rest, p_provider_cost_cents);

  return jsonb_build_object('ok', true, 'replay', false, 'free', v_free, 'credits', v_rest,
    'credits_balance', coalesce(v_balance, 0), 'quota_used', coalesce(v_used, 0) + v_free);
end;
$$;
```

```sql
/*
 * Возврат за то, что не вышло наружу. Читает строку списания по ref и
 * возвращает ровно её состав: бесплатные единицы в ai_usage, кадры на баланс
 * отдельной строкой ledger с kind='refund' и тем же ref (уникальный индекс
 * (kind, ref) не даёт вернуть дважды). Флаг released на строке списания -
 * вторая защита и заодно читаемость истории.
 */
create or replace function public.release_ai_units(p_user_id uuid, p_period text, p_ref text)
returns jsonb
```

Права в конце файла, как в `wallet.sql`:

```sql
revoke all on function public.ai_credits_grant(uuid, integer, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.consume_ai_units(uuid, text, integer, integer, text, text, boolean, integer) from public, anon, authenticated;
revoke all on function public.release_ai_units(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_credits_grant(uuid, integer, text, text, integer, jsonb) to service_role;
grant execute on function public.consume_ai_units(uuid, text, integer, integer, text, text, boolean, integer) to service_role;
grant execute on function public.release_ai_units(uuid, text, text) to service_role;
```

Старые `consume_ai_quota` и `release_ai_quota` **не удаляем**: их продолжает звать пробный тир и
они остаются точкой отката, если новая функция поведёт себя плохо.

Тест миграции (по образцу `lib/supabase/migrations.proPasses.test.ts`) в
`lib/supabase/migrations.aiCredits.test.ts`: проверяет отсутствие политик insert/update, наличие
уникального индекса `(kind, ref)`, порядок «блокировки до записей» и revoke/grant.

### 5.5 Порядок списания в коде

`lib/ai/entitlements.ts`, `assertAiAllowed` получает третий аргумент:

```ts
export async function assertAiAllowed(feature: AiFeature, units = 1, ref?: string): Promise<AiVerdict>
```

`ref` это ключ идемпотентности, тот же приём, что в `app/actions/video.ts`: панель генерирует
`crypto.randomUUID()` один раз на клик и передаёт в действие, действие пробрасывает сюда. Если
`ref` не пришёл, функция генерирует свой (тогда идемпотентности между ретраями нет, и это
осознанная деградация, а не тихая поломка).

Новая ветка порядка:

1. Не настроен Supabase -> `deny('unavailable')` (как сейчас).
2. Pro: `consume_ai_units(userId, period, AI_MONTHLY_LIMIT, cost, ref, feature, true, providerCost)`.
   `ok=false` -> `deny('quota')` c `remaining = free_available + credits_balance`.
   `ok=true` -> `{ ok: true, tier: 'pro', userId, period, ref, cost, free, credits, remaining }`.
3. Не Pro, фича входит в `AI_TRIAL_FEATURES` и пробный тир настроен: как сейчас, `consumeTrial`.
   Пробное всегда идёт раньше купленного: бесплатное тратится первым.
4. Не Pro, пробное кончилось (или тир не настроен), фича входит в `AI_CREDIT_FEATURES`:
   `consume_ai_units(userId, period, 0, cost, ref, feature, false, providerCost)`.
   `ok=true` -> `{ ok: true, tier: 'credits', userId, period, ref, cost, free: 0, credits: cost, remaining }`.
   `ok=false` -> `deny('noCredits')`.
5. Иначе -> как сейчас (`anonymous` / `notPro` / `trialSpent`).

`AiGrant` получает вариант:

```ts
| { readonly ok: true; readonly tier: 'credits'; readonly userId: string; readonly period: string
    readonly ref: string; readonly cost: number; readonly free: number; readonly credits: number; readonly remaining: number }
```

и вариант `tier: 'pro'` дополняется полями `ref`, `free`, `credits`.

`AiDenyReason` пополняется значением `'noCredits'`.

`releaseAiQuota(grant)` для тиров `'pro'` и `'credits'` зовёт `release_ai_units(userId, period, ref)`
вместо `release_ai_quota`. Для `'trial'` всё как было. Ошибка возврата логируется и не роняет ответ
(как сейчас).

`getAiAccess()` дополнительно читает `ai_credits.balance` (новая функция `readCredits(userId)` в
`lib/ai/credits.ts` с `import 'server-only'`, по образцу `lib/wallet/server.ts`) и складывает:

- Pro: `aiAccess('pro', used, AI_MONTHLY_LIMIT, credits)`.
- не Pro, пробное есть: `aiAccess('trial', usedTrial, FREE_TRIAL_LIMIT, credits)`.
- не Pro, пробное кончилось, `credits > 0`: `aiAccess('credits', usedTrial, FREE_TRIAL_LIMIT, credits)`.
- не Pro, пробное кончилось, кадров нет: `aiAccess('trialSpent', ...)` (как сейчас).

### 5.6 Атомарность, идемпотентность, возврат: что именно гарантируется

- **Атомарность**: одна SQL-функция = одна транзакция. Расчёт «хватает ли» идёт под
  `for update` на обеих строках (`ai_usage`, `ai_credits`) до первой записи, поэтому два
  параллельных запроса не могут оба увидеть одну и ту же единицу.
- **Идемпотентность**: уникальный индекс `(kind, ref)` на ledger. Повтор того же `ref` возвращает
  сохранённый состав списания с флагом `replay: true` и ничего не двигает.
- **Возврат**: `release_ai_units` возвращает ровно тот состав, который был списан, отдельной
  строкой `kind='refund'` с тем же `ref`. Вернуть дважды нельзя (уникальный индекс). Возврат
  вызывается только когда наружу не вышло ни одного кадра, ровно как сейчас в
  `app/actions/promo.ts:68,97,191`.
- **Частичный успех** (провайдер отдал 2 кадра из 4) сейчас не различается и в этой волне не
  меняется: резерв берётся целиком, возврат идёт только при полном провале. Это осознанный долг,
  записать его в `docs/tech-debt.md`.

### 5.7 Тексты счётчика

```ts
// ru
'ai.quota': 'Осталось {remaining} кадров: {free} бесплатных и {credits} купленных',
'ai.quota.freeOnly': 'Осталось {remaining} из {limit} бесплатных кадров в этом месяце',
'ai.quota.creditsOnly': 'Осталось {credits} купленных кадров',
'ai.gate.noCredits': 'Кадры закончились. Купите пакет, и генерация снова включится.',
'ai.gate.buyFrames': 'Купить кадры',

// en
'ai.quota': '{remaining} frames left: {free} free and {credits} purchased',
'ai.quota.freeOnly': '{remaining} of {limit} free frames left this month',
'ai.quota.creditsOnly': '{credits} purchased frames left',
'ai.gate.noCredits': 'Out of frames. Grab a pack and generation switches back on.',
'ai.gate.buyFrames': 'Buy frames',
```

`AiGateNote` при `noteKey === 'ai.gate.noCredits'` и при `remaining <= 3` показывает ссылку
`href="/account/billing"` с testid `${testId}-frames` и текстом `ai.gate.buyFrames`.

---

## 6. Где живёт баланс и покупка

### 6.1 Решение

Новая страница **`/account/billing`** плюс два указателя на неё.

Обоснование: `/pricing` это витрина приобретения, она публичная и переиспользуется лендингом через
`mode="link"`, поэтому личные цифры (баланс, история транзакций) там неуместны. Вкладка «Мои
проекты» в студии тоже не место: кошелёк там оказался случайно
(`components/ProjectsPanel.tsx:128`), человек ищет деньги в аккаунте, а не в списке досок. Раздел
аккаунта уже существует и уже имеет подстраницу (`/account/api`), значит `/account/billing` это
продолжение сложившейся структуры, а не новая сущность.

Три точки входа:

1. **Меню аккаунта** (`components/AccountMenu.tsx`): пункт `account-menu-billing` ведёт на
   `/account/billing`, а не на `/pricing` (сейчас строка 100 ведёт на `/pricing` для Pro).
   Пункт показывается всем вошедшим при `billingEnabled`. Пункт «Перейти на Pro» для не-Pro
   остаётся и продолжает вести на `/pricing`. В шапке меню строка `account-menu-quota` меняет
   текст на `ai.quota` с новыми параметрами и показывается при `ai.state !== 'mock'`.
2. **Промо-панель**: компактный счётчик рядом с кнопкой генерации уже есть
   (`AiGateNote`), к нему добавляется ссылка «Купить кадры» (см. 5.7). Отдельной покупки прямо в
   панели не делаем: увод на Stripe из середины работы над доской теряет несохранённое состояние
   студии.
3. **Вкладка «Мои проекты»**: `WalletPanel` оттуда **убирается**
   (`components/ProjectsPanel.tsx:15,128`), вместо неё одна строка-ссылка
   `projects-billing-link` -> `/account/billing`.

### 6.2 Состав страницы `/account/billing`

`app/account/billing/page.tsx`, серверный компонент, гейт как у `/account`
(`if (!user) redirect(`${LOGIN_PATH}?next=%2Faccount%2Fbilling`)`).

Сверху вниз:

1. Заголовок `billing.title` + подзаголовок `billing.subtitle`.
2. **Текущий план**: `PlanBadge` (уже есть, `components/account/PlanBadge.tsx`), дата окончания,
   ссылка на портал Stripe, ссылка «Сменить тариф» на `/pricing`. testid `billing-plan`.
3. **Кадры**: большой счётчик `осталось N кадров` с разбивкой (бесплатные + купленные), карточки
   пакетов (раздел 7), краткая история. testid `billing-frames`.
4. **Кошелёк для видео**: существующий `WalletPanel` без изменений. testid `wallet-panel`.
5. **История**: последние 20 движений кадров (`TransactionList` по образцу
   `components/wallet/TransactionList.tsx`, новый компонент `components/credits/CreditsHistory.tsx`).

---

## 7. Экран покупки пакета

### 7.1 Компоненты

`components/credits/CreditsPanel.tsx` (клиентский), состав:

```tsx
<section data-testid="credits-panel">
  <header>
    счётчик: data-testid="credits-total" (число кадров)
    подпись:  data-testid="credits-split" (ai.quota)
  </header>
  <div data-testid="credits-packs">
    {AI_PACKS.map(pack => <PackCard key={pack.id} .../>)}
  </div>
  {error ? <p role="alert" data-testid="credits-error"> : null}
</section>
```

`components/credits/PackCard.tsx`: название («10 кадров»), цена (`formatCents(pack.priceCents)`),
подпись цены за кадр (`perFrameCents`), кнопка `data-testid={"credits-buy-" + pack.id}`.
Средний пакет помечается бейджем «Выгоднее» (`credits.popular`), testid `credits-pack-popular`.

### 7.2 Серверные действия

Новый файл `app/actions/credits.ts`:

```ts
'use server'

export type PackCheckoutError = 'invalid' | 'disabled' | 'unauthenticated' | 'failed'
export type PackCheckoutResult =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly error: PackCheckoutError }

/** Пакет кадров. Отдельный Product в Stripe не нужен: price_data инлайном, как в createTopUpCheckoutAction. */
export async function createPackCheckoutAction(packId: unknown): Promise<PackCheckoutResult>

export interface CreditsView {
  readonly credits: number
  readonly freeRemaining: number
  readonly freeLimit: number
  readonly totalRemaining: number
  readonly transactions: readonly CreditTransactionRow[]
}

export async function readCreditsAction(): Promise<CreditsView>
```

Тело `createPackCheckoutAction` повторяет `app/actions/wallet.ts:21` с отличиями:

```ts
const body = new URLSearchParams({
  mode: 'payment',
  'line_items[0][quantity]': '1',
  'line_items[0][price_data][currency]': 'usd',
  'line_items[0][price_data][unit_amount]': String(pack.priceCents),
  'line_items[0][price_data][product_data][name]': `Endgrain App: ${pack.frames} кадров AI`,
  success_url: `${origin}/account/billing?pack=success`,
  cancel_url: `${origin}/account/billing?pack=cancel`,
  client_reference_id: user.id,
  customer_email: user.email,
  'metadata[supabase_user_id]': user.id,
  'metadata[kind]': 'ai_pack',
  'metadata[pack_id]': pack.id,
})
```

Число кадров при начислении берётся **не из metadata и не из суммы**, а по `pack_id` через
`aiPack()` на сервере: metadata может быть подделана только владельцем ключа, но привычка не
доверять телу события должна быть общей.

### 7.3 Вебхук

`lib/stripe/oneTime.ts`:
- `OneTimeKind` пополняется значением `'ai_pack'`, `kindSchema` тоже.
- `sessionSchema.metadata` пополняется полем `pack_id: z.string().optional()`.
- `OneTimePayment` пополняется полем `readonly packId: string | null`.

`app/api/stripe/webhook/route.ts`, в `handleOneTime` новая ветка перед веткой кошелька:

```ts
if (payment.kind === 'ai_pack') {
  const pack = isAiPackId(payment.packId) ? aiPack(payment.packId) : null
  if (pack === null) {
    console.error('stripe webhook: ai_pack с неизвестным pack_id', { sessionId: payment.sessionId })
    return text('ok', 200)   // ретрай не поможет, чинить нечего
  }
  const { error } = await sb.rpc('ai_credits_grant', {
    p_user_id: payment.userId,
    p_frames: pack.frames,
    p_ref: payment.sessionId,
    p_kind: 'purchase',
    p_revenue_cents: payment.amountCents,
    p_meta: { pack_id: pack.id },
  })
  if (error) { console.error('stripe webhook: ai_credits_grant failed', error); return text('write failed', 500) }
  return text('ok', 200)
}
```

**Важно**: вся разовая ветка вебхука (кошелёк, галерея, пакеты) работает только если в Stripe
Dashboard у эндпойнта включено событие `checkout.session.completed`. Сейчас в проде ноль строк в
кошельке при полностью написанном коде, и это самая вероятная причина. См. раздел 10, шаг 4.

### 7.4 Возврат с оплаты и отставание вебхука

`?pack=success` обрабатывает `components/credits/CreditsPanel.tsx`:

1. Перед уходом на Stripe панель кладёт текущий баланс в `sessionStorage` под ключом
   `egs_frames_before` (строкой).
2. На возврате при `pack=success` панель показывает тост «Оплата прошла, начисляем кадры»
   (testid `credits-toast-pending`) и запускает опрос `readCreditsAction()`:
   до 8 попыток, интервал 1500 мс, останов при `credits > Number(sessionStorage.egs_frames_before)`.
3. Успех: тост меняется на `credits.toast.done` с числом начисленных кадров
   (testid `credits-toast-done`), `sessionStorage.egs_frames_before` удаляется, счётчик
   перерисовывается.
4. Все 8 попыток прошли без изменения: тост `credits.toast.slow` (testid `credits-toast-slow`)
   с текстом «Оплата прошла, кадры появятся в течение минуты. Обновите страницу» и кнопкой
   «Обновить» (testid `credits-refresh`). Никаких ошибок: деньги уже взяты, пугать нельзя.
5. `?pack=cancel`: тост `credits.toast.cancel`, ничего не опрашиваем.
6. Параметр из URL после обработки убирается через `router.replace('/account/billing')`, чтобы
   перезагрузка не повторяла тост.

Заодно чинится сегодняшняя дыра: `?wallet=success` из `app/actions/wallet.ts:41-42` сейчас не
обрабатывает никто. Меняем `success_url`/`cancel_url` кошелька на
`${origin}/account/billing?wallet=success` / `?wallet=cancel` и обрабатываем тем же механизмом в
`WalletPanel` (ключ `sessionStorage` `egs_wallet_before`, сравнение по `balanceCents`).

### 7.5 Тексты

```ts
// ru
'billing.title': 'Оплата и кадры',
'billing.subtitle': 'Тариф, счётчик кадров и кошелёк для видео.',
'credits.title': 'Кадры AI',
'credits.total': 'Осталось {remaining} кадров',
'credits.popular': 'Выгоднее',
'credits.pack': '{frames} кадров',
'credits.perFrame': '{price} за кадр',
'credits.buy': 'Купить',
'credits.busy': 'Открываем оплату',
'credits.error': 'Не получилось открыть оплату. Попробуйте ещё раз через минуту.',
'credits.disabled': 'Оплата пока не подключена.',
'credits.toast.pending': 'Оплата прошла, начисляем кадры',
'credits.toast.done': 'Начислили {frames} кадров',
'credits.toast.slow': 'Оплата прошла, кадры появятся в течение минуты. Обновите страницу.',
'credits.toast.cancel': 'Оплата отменена, деньги не списаны.',
'credits.refresh': 'Обновить',
'credits.history': 'История кадров',
'credits.tx.purchase': 'Покупка пакета',
'credits.tx.grant': 'Начисление',
'credits.tx.spend': 'Генерация',
'credits.tx.refund': 'Возврат',

// en
'billing.title': 'Billing and frames',
'billing.subtitle': 'Your plan, the frame counter and the video wallet.',
'credits.title': 'AI frames',
'credits.total': '{remaining} frames left',
'credits.popular': 'Best value',
'credits.pack': '{frames} frames',
'credits.perFrame': '{price} per frame',
'credits.buy': 'Buy',
'credits.busy': 'Opening checkout',
'credits.error': 'Could not open checkout. Try again in a minute.',
'credits.disabled': 'Payments are not connected yet.',
'credits.toast.pending': 'Payment went through, adding frames',
'credits.toast.done': 'Added {frames} frames',
'credits.toast.slow': 'Payment went through. Frames land within a minute, refresh the page.',
'credits.toast.cancel': 'Checkout cancelled, nothing was charged.',
'credits.refresh': 'Refresh',
'credits.history': 'Frame history',
'credits.tx.purchase': 'Pack purchase',
'credits.tx.grant': 'Granted',
'credits.tx.spend': 'Generation',
'credits.tx.refund': 'Refund',
```

---

## 8. Учёт себестоимости и маржи

### 8.1 Где хранится цена провайдера

Новый серверный файл `lib/ai/cost.ts`:

```ts
import 'server-only'

/**
 * Себестоимость одного кадра у провайдера в центах. Число живёт в env, чтобы
 * смена модели или тарифа fal не требовала деплоя. Дефолт 8 центов - текущая
 * цена, от которой посчитаны пакеты (наценка x2.5).
 */
export const AI_FRAME_COST_CENTS: number = Number(process.env['AI_FRAME_COST_CENTS'] ?? 8)

/** Себестоимость обращения: цена кадра умножить на списанные единицы квоты. */
export function providerCostCents(units: number): number {
  return Math.max(0, Math.round(units * AI_FRAME_COST_CENTS))
}
```

`AI_FRAME_COST_CENTS` не `NEXT_PUBLIC_`: себестоимость не показывается покупателю никогда.

Значение прокидывается в `consume_ai_units` параметром `p_provider_cost_cents` и оседает в столбце
`ai_credit_transactions.provider_cost_cents`. Выручка (`revenue_cents`) пишется в строке покупки
пакета. Таким образом обе половины маржи лежат в одной таблице, и цифра не зависит от того, что
считает JS сегодня.

### 8.2 Как считать маржу

```sql
-- Выручка, себестоимость и маржа за календарный месяц
select
  date_trunc('month', created_at) as month,
  sum(revenue_cents) filter (where kind = 'purchase')        as revenue_cents,
  sum(provider_cost_cents) filter (where kind = 'spend')     as cost_cents,
  sum(revenue_cents) filter (where kind = 'purchase')
    - sum(provider_cost_cents) filter (where kind = 'spend') as margin_cents,
  sum(free_units) filter (where kind = 'spend')              as free_frames,
  sum(credit_units) filter (where kind = 'spend')            as paid_frames
from public.ai_credit_transactions
group by 1 order by 1 desc;
```

Бесплатные кадры Pro тоже стоят денег: их себестоимость попадает в `cost_cents` через строки
`kind='spend'` с `credit_units = 0` и ненулевым `provider_cost_cents`, поэтому запрос честно
показывает, сколько съедает щедрость подписки.

Записать в `docs/tech-debt.md` пункт: раз в квартал сверять `AI_FRAME_COST_CENTS` со счетами fal.

---

## 9. Чеклист проверки на проде (тестовая карта)

Порядок: сперва test mode целиком, потом live с настоящей картой на минимальном пакете.

1. `/pricing` анонимом: три карточки, у Pro «от $7.50 в месяц», у Developer «от $16.67 в месяц».
   Карточки Пропуска нет. Ни в одной карточке нет слов «в подарок», «при оплате за год»,
   «на следующем шаге».
2. `/pricing` вошедшим без подписки: у Free бейдж «Ваш план», у Pro и Developer кнопки покупки.
3. Нажать «Оформить Pro»: на странице Stripe виден тумблер месяц/год, при выборе года подпись
   «$7.50 per month». Оплатить картой `4242 4242 4242 4242`, любая будущая дата, любой CVC.
4. После возврата: `/pricing` показывает у Pro бейдж «Ваш план», дату и ссылку на портал; у Free
   бейджа больше нет. В `subscriptions` строка с нужным `plan` и `product='pro'`.
5. Тот же прогон для Developer: бейдж, дата и портал в карточке Developer.
6. `/account/billing`: счётчик кадров, три пакета, кошелёк.
7. Купить пакет 10 кадров той же тестовой картой. После возврата тост «начисляем кадры», через
   несколько секунд счётчик вырос ровно на 10. В `ai_credit_transactions` одна строка
   `kind='purchase'`, `amount=10`, `revenue_cents=200`.
8. Переотправить то же событие из Stripe Dashboard (Events -> Resend): баланс **не** изменился,
   второй строки в ledger нет.
9. Сгенерировать серию кадров Pro-аккаунтом: счётчик тратит сперва бесплатные, строка
   `kind='spend'` с `free_units>0`, `credit_units=0`, `provider_cost_cents = units * 8`.
10. Выбрать месячную квоту до нуля и сгенерировать ещё: списываются купленные кадры,
    `credit_units>0`, счётчик на фронте уменьшается.
11. Не-Pro аккаунт: пробные кадры кончились, куплен пакет, генерация промо-кадров работает,
    разбор референса по-прежнему требует Pro.
12. Кадры кончились совсем: гейт показывает `ai.gate.noCredits` и ссылку «Купить кадры».
13. Аккаунт с живым пропуском в `pro_passes`: Pro по-прежнему доступен, на витрине строка
    `pricing-legacy-pass` с датой, кнопка покупки Pro активна.
14. Аккаунт из allowlist: карточка Pro с бейджем «Доступ открыт», кнопки покупки нет.
15. Кошелёк: пополнение на $5, тост, баланс вырос, генерация видео списывает центы.
16. `pnpm test` и `pnpm build` зелёные, e2e Playwright по `/pricing` и `/account/billing` зелёные.

---

## 10. Что нужно от владельца руками

Всё, кроме кода. Пункты 1-6 в **test mode**, затем те же в **live mode**.

1. **Stripe -> Products**: убедиться, что у Pro обе цены ($9/month и $90/year) принадлежат одному
   Product. То же для Developer ($20/month и $200/year). Если нет, создать недостающий Price
   внутри правильного Product и архивировать чужой.
2. **Stripe -> Settings -> Payments -> Checkout and Payment Links -> Pricing display**: включить
   показ годовых цен помесячно (per month).
3. **Stripe -> Products -> Pro -> Price $9/month -> «...» -> Upsells -> Upsells to**: выбрать
   $90/year. Повторить для Developer: $20/month -> $200/year.
4. **Stripe -> Developers -> Webhooks -> ваш эндпойнт `/api/stripe/webhook` -> Update details ->
   Select events**: убедиться, что включены четыре типа:
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, **`checkout.session.completed`**.
   Последний почти наверняка сейчас выключен, и именно поэтому в кошельке ноль строк при рабочем
   коде. Без него не заработают ни пополнение кошелька, ни покупка пакетов кадров, ни продажи в
   галерее.
5. **Stripe -> Products -> Пропуск**: архивировать сперва Price ($19 one-time), затем сам Product.
   Деактивировать Payment Link Пропуска, если он был.
6. **Stripe -> Settings -> Billing -> Customer portal**: проверить, что портал включён и ссылка в
   `NEXT_PUBLIC_STRIPE_PORTAL_URL` живая (её теперь видят и Pro, и Developer).
7. **Vercel -> Settings -> Environment Variables** (Production, Preview, Development):
   - удалить `NEXT_PUBLIC_STRIPE_PRICE_PASS`;
   - удалить `STRIPE_PRO_DEFAULT_PRICE`;
   - добавить `AI_FRAME_COST_CENTS=8` (обычная, не публичная переменная).
   После правки переменных обязателен redeploy: инлайненные `NEXT_PUBLIC_*` подхватываются только
   на сборке.
8. **Supabase**: применить миграцию `20260815100000_ai_credits.sql` на прод-проект
   (через `supabase db push` или Dashboard -> SQL Editor). Проверить, что `ai_credits` и
   `ai_credit_transactions` появились и RLS включён.
9. Прогнать чеклист раздела 9 своими руками на проде и подтвердить результат.

---

## 11. Сводка файлов

Новые:

```
supabase/migrations/20260815100000_ai_credits.sql
lib/ai/packs.ts
lib/ai/cost.ts
lib/ai/credits.ts                    (server-only чтение баланса)
app/actions/credits.ts
app/account/billing/page.tsx
components/credits/CreditsPanel.tsx
components/credits/PackCard.tsx
components/credits/CreditsHistory.tsx
lib/supabase/migrations.aiCredits.test.ts
components/credits/CreditsPanel.test.tsx
app/actions/credits.test.ts
```

Изменяемые:

```
lib/stripe/config.ts        (минус STRIPE_PRICE_PASS, hasPassPrice, STRIPE_PRO_DEFAULT_PRICE)
lib/stripe/plans.ts         (checkoutPriceFor всегда monthly)
lib/stripe/oneTime.ts       (kind 'ai_pack', packId)
lib/stripe/pro.ts           (без изменений логики, только комментарии про снятый с продажи пропуск)
app/actions/billing.ts      (две ветки вместо трёх)
app/actions/wallet.ts       (success_url на /account/billing)
app/api/stripe/webhook/route.ts (ветка ai_pack)
app/pricing/page.tsx        (новые props)
components/pricing/PricingPlans.tsx (минус Пропуск, плюс бейджи текущего плана)
components/landing/PricingSection.tsx
components/AccountMenu.tsx  (пункт billing, новый текст квоты)
components/ProjectsPanel.tsx (минус WalletPanel, плюс ссылка)
components/promo/AiGate.tsx (счётчик кадров, ссылка «Купить кадры»)
components/ProProvider.tsx  (тип AiAccess расширен, значение из layout)
app/layout.tsx              (getAiAccess теперь возвращает и кадры)
lib/ai/quota.ts             (AiAccess, AI_CREDIT_FEATURES, состояние 'credits')
lib/ai/entitlements.ts      (consume_ai_units, release_ai_units, tier 'credits', ref)
app/actions/promo.ts        (проброс ref из панелей, новые поля ответа)
lib/analytics/events.ts     (checkout_started без 'pass', новое событие pack_purchase_started)
lib/seo/jsonld.ts           (минус offer Pass)
lib/i18n/ru.ts, lib/i18n/en.ts
docs/tech-debt.md
```

Тесты к правке: `components/pricing/PricingPlans.test.tsx`, `app/actions/billing.test.ts`,
`components/promo/PromoPanel.test.tsx`, `app/api/stripe/webhook/route.test.ts` (плюс кейсы
`ai_pack`), `lib/ai/*.test.ts`.
