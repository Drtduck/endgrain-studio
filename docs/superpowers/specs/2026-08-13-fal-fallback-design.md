# Дешёвый fallback через fal.ai и бесплатный тир

Дата: 13 августа 2026. Пункт 3 техдолга (`docs/tech-debt.md`), ресерч: `docs/research/fal-ai-fallback.md`.

Область: только генерация изображений. Видео и внутренний кошелёк (пункт 5 техдолга) сюда
сознательно не входят: другая модель монетизации, другая таблица, другой рубеж.

## 1. Задача одним абзацем

Сегодня любая генерация это Gemini, и она открыта только Pro. Три следствия. Первое: человек,
который не платил, не видит, что вообще умеет вкладка «Промо», и покупать ему нечего.
Второе: у Gemini нет запасного пути, отказ ключа означает пустую вкладку. Третье: у Gemini
дорогая цена кадра, и пускать на неё бесплатных нельзя. Правка закрывает все три:
провайдерская абстракция с двумя реализациями, бесплатный тир на дешёвой модели fal.ai
(3 пробные генерации), fallback Pro-пути на fal при отказе Gemini.

## 2. Провайдерская абстракция

### 2.1 Структура каталога

```
lib/ai/providers/
  types.ts        типы запроса, исхода, интерфейс ImageProvider (чистый, без импортов сети)
  gemini.ts       реализация на текущем коде из app/actions/promo.ts
  fal.ts          @fal-ai/client, endpoint fal-ai/flux/schnell
  mock.ts         детерминированные заглушки, ни одного запроса наружу
  index.ts        resolveImageProvider(tier) и withFallback
  types.test.ts, gemini.test.ts, fal.test.ts, index.test.ts
```

`types.ts` держим чистым по образцу `lib/ai/quota.ts`: его типы читает и клиент (панель
показывает, какой моделью нарисован кадр), а рядом с секретами клиенту делать нечего.
`gemini.ts`, `fal.ts`, `index.ts` помечены `import 'server-only'`.

### 2.2 Интерфейс

```ts
export type ProviderId = 'gemini' | 'fal' | 'mock'

/** good - хорошая модель за деньги (Pro), cheap - грошовая для пробных генераций. */
export type ImageTier = 'good' | 'cheap'

export interface ImageRequest {
  readonly prompt: string
  /** Рендер доски в base64 без префикса data:. Для text-to-image моделей игнорируется. */
  readonly referencePngBase64?: string
  readonly timeoutMs?: number
}

export type ImageOutcome =
  | { readonly kind: 'image'; readonly dataUrl: string; readonly provider: ProviderId }
  | { readonly kind: 'blocked'; readonly provider: ProviderId }
  | { readonly kind: 'failed'; readonly provider: ProviderId; readonly retryable: boolean }

export interface ImageProvider {
  readonly id: ProviderId
  readonly tier: ImageTier
  generate(req: ImageRequest): Promise<ImageOutcome>
}
```

Три исхода вместо двух сохраняют различие, которое уже есть в `app/actions/promo.ts`:
`blocked` это отказ модели по своим правилам (200 без кандидатов), `failed` это сбой связи,
таймаут или HTTP-ошибка. Флаг `retryable` отделяет 429 и 5xx от 401: на протухшем ключе
второй провайдер имеет смысл, на 401 у первого имеет смысл тоже, а вот повтор в тот же
провайдер бесполезен. Само поле нужно логам и будущему ретраю, решение о fallback ниже
принимается только по `kind`.

### 2.3 Реализации

**gemini.ts.** Переезд существующего `requestShot` без изменения поведения: тот же
`gemini-2.5-flash-image`, тот же `REQUEST_TIMEOUT_MS = 30_000`, та же схема разбора
`inlineData`/`inline_data`, тот же лог без тела ответа и без ключа. Это чистый вынос
функции, а не переписывание: любое изменение промпта или модели тут запрещено, иначе
регрессию не отличить от рефакторинга.

**fal.ts.** Пакет `@fal-ai/client`, вызов `fal.subscribe('fal-ai/flux/schnell', { input })`.
Вход: `prompt`, `image_size: 'square_hd'` (1024x1024, ровно 1 мегапиксель, ровно $0.003),
`num_images: 1`, `enable_safety_checker: true`. Ключ читается только из `process.env.FAL_KEY`
на сервере, клиентский прокси `@fal-ai/server-proxy` не заводим: генерация идёт из server
action, браузеру ходить в fal незачем.

Важное ограничение: `flux/schnell` это text-to-image, референсной картинки он не принимает.
Значит рендер доски во free-тире в модель не уезжает, а описывается словами: у нас уже есть
`lib/promo/describe.ts`, который собирает текстовое описание доски, и его результат
дописывается в промпт. Кадр выйдет не фотографией именно этой доски, а фотографией доски
такого узора и породы. Для пробной генерации это честный компромисс, и ровно он же
становится аргументом пейвола: Pro рисует по вашему рендеру, пробный тир по описанию.

Ответ fal приходит ссылкой (`data.images[0].url`), а не base64. Тянем её `fetch` с таймаутом
и превращаем в data-url, чтобы наружу из провайдера всегда выходил один и тот же формат:
панель не должна знать, кто рисовал.

**mock.ts.** Возвращает `blocked` никогда, `image` всегда, картинка это существующая локальная
заглушка (`components/promo/PromoMockShot.tsx` рисует её в браузере, провайдер отдаёт
детерминированный однотонный PNG с подписью). Мок включается, когда нет ни одного ключа,
и это ровно текущее поведение `isAiDemoMode()`.

### 2.4 Выбор провайдера и fallback

```ts
export function resolveImageProvider(tier: ImageTier): ImageProvider
```

Правила:

| Ключи | tier: good (Pro) | tier: cheap (пробный) |
|---|---|---|
| нет ни одного | mock | mock |
| только GEMINI_API_KEY | gemini | free-тир выключен целиком |
| только FAL_KEY | fal | fal |
| оба | gemini с fallback на fal | fal |

Строка «только Gemini, free-тир выключен» принципиальна: пускать бесплатных на дорогую
модель ради красивого продуктового обещания значит платить за трафик из ниоткуда. Нет
дешёвого провайдера, нет и пробных генераций, интерфейс возвращается к сегодняшнему замку.

`withFallback(primary, secondary)` уходит во второй провайдер **только на `failed`**.
На `blocked` не уходит: это отказ по содержанию запроса, второй провайдер, скорее всего,
нарисует то, что первый счёл неуместным, и мы заплатим дважды за проблему, которую не решали.
Fallback не бесплатный, поэтому он логируется отдельной строкой (`ai fallback: gemini -> fal`):
частый fallback это сигнал, что с ключом Gemini что-то не так, а не фоновый шум.

Квота при fallback не пересчитывается: единица списана за кадр, а не за поставщика.

### 2.5 Разбор референса остаётся у Gemini

`analyzeReferenceAction` это vision-задача со структурированным JSON-ответом
(`ANALYSIS_RESPONSE_SCHEMA`). `flux/schnell` этого не умеет вовсе, а kontext-модели стоят
$0.035 за мегапиксель, то есть на порядок дороже и в бесплатный тир не годятся. Решение:
разбор референса и мокапы мерча в пробный тир не входят и остаются Pro-фичами. Fallback у
разбора тоже нет: подменять vision-разбор нечем.

## 3. Бесплатный тир

### 3.1 Что именно даём

Три пробные генерации, **по одному кадру за нажатие**. Cap в один кадр сознательный: серия
по умолчанию это четыре кадра, и без cap первая же кнопка отказалась бы целиком по нехватке
остатка. Три отдельные попытки это три впечатления и три момента, где видно ограничение
модели, а один залп это одно впечатление и мгновенный пейвол.

Себестоимость: 3 x $0.003 = $0.009 на гостя. Тысяча гостей стоит $9. Верхняя граница злоупотребления
держится лимитом по IP (ниже), а не доверием.

Пробный тир распространяется на `promoShots` и `referenceShots`, не распространяется на
`referenceAnalysis` и `merchMockups`.

### 3.2 Кого считаем: субъекты

Счётчик привязывается не к одному признаку, а к списку субъектов, и списывается **со всех
сразу**. Отказ, если исчерпан хотя бы один.

| Субъект | kind | Значение | Лимит |
|---|---|---|---|
| Аккаунт | `user` | `user.id` | 3 |
| Браузер гостя | `guest` | uuid из подписанной cookie | 3 |
| Адрес | `ip` | `sha256(FREE_TRIAL_SECRET + ':' + ip)` | 10 |

Залогиненный без Pro: субъекты `[user, ip]`. Гость: `[guest, ip]`.

Почему так. Инкогнито обнуляет cookie, но не адрес, поэтому `ip` закрывает ровно тот дефект,
ради которого пункт и написан. Одновременно за одним NAT сидит целый офис или мобильный
оператор, поэтому лимит адреса втрое выше персонального: обычный человек в него не упрётся
никогда, а скрипт с чисткой cookie упирается на четвёртой попытке. Залогиненному `ip` тоже
считается: регистрация бесплатна, и без второго рубежа десять аккаунтов дают тридцать
генераций.

Хеш адреса, а не сам адрес: в базе не должно лежать персональных данных, а сравнение по
хешу работает ровно так же. Секрет в хеше нужен, чтобы по таблице нельзя было перебрать
диапазон адресов offline.

Cookie: имя `egs_ft`, значение `<uuid>.<hmac-sha256 base64url>`, подпись на `FREE_TRIAL_SECRET`,
`httpOnly`, `sameSite: 'lax'`, `secure` по тому же правилу, что в `lib/supabase/cookies.ts`,
срок год. Подписанная, а не голая, потому что голую cookie подделывают новым uuid на каждый
запрос, и субъект `guest` перестаёт что-либо значить. Ставится лениво, в server action, при
первом обращении к AI: посетителю лендинга cookie не нужна.

Без `FREE_TRIAL_SECRET` подписать нечего: гостевой тир выключается, залогиненные без Pro
считаются по `[user, ip]`, интерфейс для гостя показывает сегодняшний замок `anonymous`.

Чистая арифметика и подпись живут в `lib/ai/freeSubjects.ts` (без сети, без Supabase,
покрывается юнит-тестом целиком), запись в базу в `lib/ai/entitlements.ts`.

### 3.3 Схема таблицы

Отдельная таблица, а не расширение `ai_usage`. Причины три: у `ai_usage` первичный ключ
`(user_id uuid references auth.users, period)`, и гостю uuid взять неоткуда; пробные попытки
не сбрасываются помесячно, а живут вечно, поэтому колонка `period` там была бы враньём;
смешивать месячную квоту Pro и пожизненные пробные в одной строке значит однажды обнулить
не то.

Миграция `supabase/migrations/20260813120000_ai_free_trials.sql`:

```sql
create table if not exists public.ai_free_trials (
  subject_kind text    not null,
  subject      text    not null,
  used         integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (subject_kind, subject),
  constraint ai_free_trials_kind check (subject_kind in ('user', 'guest', 'ip')),
  constraint ai_free_trials_used_range check (used >= 0),
  constraint ai_free_trials_subject_len check (length(subject) between 1 and 128)
);
```

Внешнего ключа на `auth.users` нет намеренно: в одной таблице лежат три вида субъекта, и
двое из трёх пользователями не являются. Цена решения: удаление аккаунта не уносит его
строку каскадом, но в строке нет ничего, кроме счётчика, а её сохранение как раз мешает
получить новые пробные удалением и повторной регистрацией.

Триггер `touch_updated_at` тот же, что у `ai_usage` (создан в `20260812090000`).

RLS включаем, политик не заводим ни одной, даже на `select`. У `ai_usage` политика чтения
есть, потому что человек имеет право видеть свой месячный счёт; здесь читать нечего:
остаток пробных приезжает в интерфейс пропсом из серверного layout, а гостевые строки не
принадлежат никому. Включённый RLS без политик это полный запрет для `anon` и `authenticated`,
то есть ровно то, что нужно.

### 3.4 Атомарное списание

```sql
create or replace function public.consume_free_trial(p_subjects jsonb, p_cost integer)
returns jsonb
language plpgsql security definer set search_path = public
```

Вход: массив объектов `{"kind": "...", "id": "...", "limit": n}`. Выход:
`{"ok": true, "remaining": n}` либо `{"ok": false, "blocked": "ip"}`.

Механика повторяет `consume_ai_quota`, но по нескольким строкам сразу и обязана быть
всё-или-ничего: списать гостю и не списать по адресу означало бы сжечь попытку впустую.

1. Субъекты сортируются по `(kind, id)` перед циклом. Детерминированный порядок блокировок
   это единственная защита от дедлока, когда два параллельных запроса делят субъект `ip`.
2. Внутри вложенного блока `begin ... exception`: на каждый субъект
   `insert ... on conflict (subject_kind, subject) do update set used = t.used + p_cost
   where t.used + p_cost <= v_limit returning used`. Пустой `returning` значит, что потолок
   выбран: запоминаем `v_blocked := kind` и `raise exception` с кодом `P0001`.
3. Обработчик `exception when sqlstate 'P0001'` откатывает подтранзакцию (все уже сделанные
   инкременты этого вызова исчезают, переменные plpgsql переживают откат) и возвращает
   `{"ok": false, "blocked": v_blocked}`.
4. `remaining` в успешном ответе это минимум остатка по всем субъектам: показываем человеку
   самое строгое из ограничений, а не самое приятное.

Симметричная `release_free_trial(p_subjects jsonb, p_cost integer)` с `greatest(used - cost, 0)`,
как у `release_ai_quota`: зовётся, когда наружу не вышло ни одного кадра.

Права: `revoke all` у `public`, `anon`, `authenticated`, `grant execute` только `service_role`.
Функции принимают лимит аргументом, поэтому их вызов из браузера означал бы бесконечный
бесплатный тир.

## 4. Точки интеграции

### 4.1 lib/promo/config.ts

Добавляются `FAL_KEY`, `isFalConfigured()`, `FREE_TRIAL_SECRET`, `isFreeTrialConfigured()`
(секрет есть и есть дешёвый провайдер). Обе переменные серверные, без `NEXT_PUBLIC_`.

### 4.2 lib/ai/quota.ts

Чистая часть, растёт на константы и типы:

```ts
export const FREE_TRIAL_LIMIT = 3
export const FREE_TRIAL_IP_LIMIT = 10
/** Сколько кадров можно взять за одно нажатие в пробном тире. */
export const FREE_TRIAL_MAX_UNITS = 1

/** Фичи, доступные в пробном тире: остальные требуют Pro. */
export const AI_TRIAL_FEATURES: readonly AiFeature[] = ['promoShots', 'referenceShots']

export type AiDenyReason = 'anonymous' | 'notPro' | 'quota' | 'trialSpent' | 'unavailable'
export type AiAccessState = 'mock' | 'unavailable' | 'anonymous' | 'free' | 'trial' | 'trialSpent' | 'pro'
```

`AiAccess` получает поле `tier: 'pro' | 'trial' | null`, чтобы панель знала, какой моделью
будет нарисован кадр, и могла это честно написать.

Состояния `anonymous` и `free` не удаляются: они остаются ровно для конфигурации без
дешёвого провайдера или без секрета.

### 4.3 lib/ai/entitlements.ts

`AiGrant` становится дискриминированным юнионом, потому что возвращать `userId` для гостя
нечестно, а разветвлять возврат резерва надо:

```ts
export type AiGrant =
  | { ok: true; tier: 'pro';   userId: string; period: string; cost: number; used: number; remaining: number }
  | { ok: true; tier: 'trial'; subjects: readonly FreeSubject[]; cost: number; remaining: number }
```

`assertAiAllowed(feature, units)` в новом порядке:

1. `!isSupabaseConfigured()` -> `unavailable` (как сейчас).
2. `user = await getCurrentUser()`.
3. Если `user !== null` и `pro` -> текущая ветка целиком без изменений: `consume_ai_quota`,
   grant с `tier: 'pro'`. Pro в таблицу пробных не заглядывает никогда.
4. Не Pro. Если `!isFreeTrialConfigured()` или фича не входит в `AI_TRIAL_FEATURES` ->
   `deny(user === null ? 'anonymous' : 'notPro')`, то есть сегодняшнее поведение.
5. Пробный путь: `units > FREE_TRIAL_MAX_UNITS` -> `deny('trialSpent')` (клиент такого не
   пришлёт, но сервер обязан не верить клиенту). Собираем субъекты через
   `freeSubjects(user, cookieHeader, ipHeader)`, зовём `consume_free_trial`. Ответ
   `ok: false` -> `deny('trialSpent')`, ошибка RPC -> `deny('unavailable')`, успех ->
   grant с `tier: 'trial'`.

`releaseAiQuota(grant)` разветвляется по `grant.tier` и зовёт соответствующий RPC.

`isAiDemoMode()` становится `!isGeminiConfigured() && !isFalConfigured()`: демо-режим это
отсутствие любого способа что-то нарисовать, а не отсутствие Gemini.

`getAiAccess()` дополняется чтением пробного остатка (без списания) и возвращает
`trial`/`trialSpent`. Читается тем же service-ключом, минимум по субъектам.

Cookie нельзя поставить из `getAiAccess()`: серверный layout не имеет права писать cookie.
Поэтому для гостя без cookie `getAiAccess()` возвращает полный остаток (3 из 3), а cookie
создаётся уже в server action при первом списании. Расхождение возможно ровно один раз и
только в большую сторону для человека, который ещё ничего не потратил.

### 4.4 app/actions/promo.ts

- Из файла уезжают `requestShot`, `firstImage`, `GEMINI_URL`, `GeminiResponse`: их место в
  `lib/ai/providers/gemini.ts`. В действии остаётся оркестрация.
- `runSeries` принимает провайдера аргументом: `resolveImageProvider(grant.tier === 'pro' ? 'good' : 'cheap')`.
- В `PromoResult` добавляется `provider?: ProviderId`, чтобы панель могла подписать кадр.
- Проверка `isGeminiConfigured()` в начале действий заменяется на `isAiDemoMode()`: сегодня
  при наличии только `FAL_KEY` действие ушло бы в мок при живом платном провайдере.
- Во free-тире `kinds` обрезается до `FREE_TRIAL_MAX_UNITS` кадров.
- `PER_IP_PER_HOUR_ANON` в `lib/promo/rateLimit.ts` поднимается с 2 до 5. Сейчас это число
  означало «анониму сюда всё равно нельзя», а теперь оно режет легальный сценарий из трёх
  попыток. Настоящий потолок гостя теперь в базе, а счётчик в памяти остаётся тем, чем был:
  дешёвым фильтром флуда.

## 5. UX пейвола

Три экрана вместо сегодняшних двух (замок и работа).

**До первой генерации.** Кнопка активна, замка нет. Под ней строка: «3 пробные генерации,
регистрация не нужна». Рядом честная приписка о разнице: «Пробный кадр рисует быстрая модель
по описанию доски. В Pro кадры рисует Gemini по вашему рендеру, и их 30 в месяц». Обманывать
про качество нельзя: человек всё равно увидит разницу, и увидит её как поломку, а не как
границу тарифа.

**Между попытками.** Строка счётчика «Осталось 2 из 3 пробных генераций». Набор пресетов во
free-тире позволяет отметить ровно один кадр, остальные чипы неактивны с подсказкой «в
пробном режиме один кадр за раз».

**После третьей.** Вместо строки-замка карточка `components/promo/TrialPaywall.tsx` на месте
панели генерации: заголовок «Пробные генерации закончились», три пункта что даёт Pro (кадры
по вашему рендеру на Gemini, 30 генераций в месяц, разбор референса и мокапы мерча), основная
кнопка «Смотреть тарифы» на `/pricing`. Для гостя вторая, вторичная кнопка «Войти» с явной
подписью, что вход не добавляет пробных: аккаунт нужен для покупки, а не для обхода счётчика.
Сгенерированные кадры с экрана не исчезают: отбирать у человека то, что он уже получил, ради
давления на покупку недопустимо.

Реализация: `useAiGate` в `components/promo/AiGate.tsx` получает ветки `trial` (не заперто,
`noteKey: 'ai.trial.left'`) и `trialSpent` (заперто, `showPaywall: true`). Поле `showPricing`
у состояния `free` сохраняется как есть.

Ключи i18n (ru + en, оба файла обязаны совпадать по набору, это проверяет `lib/i18n/purity.test.ts`):
`ai.trial.left`, `ai.trial.note`, `ai.trial.oneShot`, `ai.gate.trialSpent`, `ai.paywall.title`,
`ai.paywall.point1..3`, `ai.paywall.signin`, `ai.paywall.signinNote`.

testid: `promo-trial-note`, `promo-paywall`, `promo-paywall-pricing`, `promo-paywall-signin`.

## 6. Тест-план

### vitest

- `lib/ai/quota.test.ts`: новые константы, `AI_TRIAL_FEATURES`, ограничение `FREE_TRIAL_MAX_UNITS`.
- `lib/ai/freeSubjects.test.ts`: подпись cookie сходится, подделанная подпись отвергается,
  uuid без подписи отвергается, хеш адреса стабилен и не содержит самого адреса, набор
  субъектов для гостя и для залогиненного разный.
- `lib/ai/providers/gemini.test.ts`: переносим существующие кейсы из `app/actions/promo.test.ts`
  (200 без картинки -> `blocked`, HTTP 429 -> `failed` retryable, таймаут -> `failed`, ключ
  и тело ответа не попадают в лог).
- `lib/ai/providers/fal.test.ts`: `@fal-ai/client` замокан; успешный ответ со ссылкой
  превращается в data-url; недоступная картинка по ссылке -> `failed`; 401 -> `failed`
  нерепитабельный; safety checker -> `blocked`; пустой `FAL_KEY` -> провайдер не создаётся.
- `lib/ai/providers/index.test.ts`: таблица выбора провайдера из 2.4 целиком; `withFallback`
  зовёт второй провайдер на `failed` и не зовёт на `blocked`; при отсутствии `FAL_KEY`
  fallback не собирается.
- `lib/ai/entitlements.test.ts`: гость с остатком получает grant `tier: 'trial'`; исчерпанный
  `guest` при живом `ip` -> `trialSpent`; исчерпанный `ip` при живом `guest` -> `trialSpent`;
  Pro не трогает `consume_free_trial`; `units > 1` в пробном тире -> отказ; без
  `FREE_TRIAL_SECRET` гость получает `anonymous`; `releaseAiQuota` зовёт RPC по `tier`;
  ошибка RPC даёт `unavailable`, а не `trialSpent`.
- `app/actions/promo.test.ts`: free-путь уходит в дешёвый провайдер, набор кадров обрезан до
  одного, провал всех кадров возвращает резерв, `provider` есть в ответе.
- Структурный тест по образцу `lib/ai/freeFeatures.test.ts`: ни один файл в `app/actions`
  и `components` не обращается к `generativelanguage.googleapis.com` или `fal.run` напрямую,
  весь сетевой ход к моделям идёт через `lib/ai/providers`.

Логику SQL-функций юнит-тестами не проверить: мокается RPC, как сейчас. Отдельным пунктом
ручной проверки на ветке Supabase: два параллельных `consume_free_trial` с общим субъектом `ip`
не проскакивают лимит, и частичного списания при отказе не остаётся.

### Playwright

`e2e/trial.spec.ts`:

- без ключей (демо-режим) пейвола нет вовсе, панель работает на заглушках, как сегодня;
- с `FAL_KEY` (иначе `test.skip`, приём из `e2e/promo.spec.ts`): гость жмёт генерацию три
  раза, счётчик показывает 2, 1, 0, на четвёртой видна карточка `promo-paywall` со ссылкой
  на `/pricing`;
- `context.clearCookies()` после исчерпания не возвращает попытки: тот же адрес, пейвол на месте;
- уже сгенерированные кадры остаются на экране после появления пейвола.

Существующие `e2e/promo.spec.ts` и `components/promo/PromoPanel.test.tsx` обязаны пройти без
правок логики: изменение состояний гейта не должно ломать сценарии без ключей.

## 7. Что заводится в окружении

| Переменная | Где | Обязательна |
|---|---|---|
| `FAL_KEY` | Vercel Production + Preview, серверная | нет, без неё free-тир выключен |
| `FREE_TRIAL_SECRET` | Vercel Production + Preview, серверная, случайные 32 байта | нет, без неё гостевой тир выключен |

Получение ключа fal.ai описано в `docs/research/fal-ai-fallback.md`, раздел 5. Пополнение
prepaid, $5 хватает на тысячи пробных кадров.

## 8. Порядок работ

1. Миграция `20260813120000_ai_free_trials.sql` плюс ручная проверка параллельного списания.
2. `lib/ai/providers/*`: типы, вынос Gemini один в один, mock, тесты на вынос до fal.
3. `lib/ai/providers/fal.ts` и `index.ts` с таблицей выбора и fallback.
4. `lib/promo/config.ts`, `lib/ai/quota.ts`, `lib/ai/freeSubjects.ts`.
5. `lib/ai/entitlements.ts`: ветка пробного тира и разветвлённый возврат резерва.
6. `app/actions/promo.ts`: провайдер аргументом, cap кадров, cookie, лимит анонимов.
7. Интерфейс: `AiGate`, `TrialPaywall`, ключи i18n, testid.
8. e2e и прогон полного набора тестов.

Шаги 2 и 3 отделены от 1 и 5 сознательно: провайдерская абстракция полезна сама по себе
(она снимает единственную точку отказа у Pro), и её можно выкатить раньше бесплатного тира,
если ключ fal появится позже секрета или наоборот.
