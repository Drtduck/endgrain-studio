# Agent-ready: API-ключи, REST v1, MCP-сервер и тариф Developer

Дата: 13 августа 2026. Статус: принят к реализации. Исполнитель: Sonnet-агент, задача разбивается на четыре последовательных коммита (раздел 12).
Этот документ - единственный источник требований по пункту техдолга 10. Всё, чего в нём нет, делать не надо.

## 0. Зачем и главное решение

Ресерч (`docs/research/agent-ready-saas.md`) зафиксировал тренд: в 2026 нормальный SaaS доступен не только человеку в браузере, но и агенту. У нас для этого уже всё есть, кроме двери: движок `lib/engine` чистый, `buildCutPlan` и `calcProject` не трогают DOM, проекты лежат в Supabase под RLS. Не хватает трёх вещей: способа аутентифицировать не-браузерного клиента, HTTP-поверхности над готовыми функциями и MCP-обёртки над ней же.

**Главное решение: вся логика живёт в сервисном слое `lib/api/service.ts`, а REST, MCP и server actions это три тонких адаптера над ним.** Никакого «MCP вызывает свой REST по HTTP» и никакого копирования тела server action в route handler. Server actions при этом остаются как есть и не переписываются: они работают от cookie-сессии, сервис работает от `user_id`, полученного любым способом. Общая часть выносится в сервис, action становится обёрткой в один вызов.

Второе решение по объёму: **сервер не рисует PDF**. `lib/export/pdf.ts` собран на jsPDF плюс svg2pdf.js и требует DOM, а тащить headless-браузер в serverless ради одного эндпоинта не окупается за оставшиеся до сдачи дни. Вместо этого API отдаёт машиночитаемый распил (JSON и CSV, обе формы считаются на сервере честно) и ссылку на студию с зашитым в hash документом, по которой PDF скачивается одним нажатием. Это описано в разделе 6.4 и вынесено в ограничения открытым текстом, чтобы никто не считал это багом.

Третье: **тариф Developer выкатывается без кассы**. Страница тарифов получает третью колонку со статусом «скоро», кнопки оплаты у неё нет, а различие free и developer живёт в коде и в колонке `tier` таблицы `api_keys`. Ставить тариф в Stripe до того, как хоть кто-то попросил ключ, значит потратить полдня на прайс, который никто не нажмёт.

## 1. Точные версии зависимостей

Ресерч честно предупредил о расхождении 1.1.0 против 2.x. Проверено 13 августа 2026 через `npm view`:

| Пакет | Версия | Обоснование |
|---|---|---|
| `mcp-handler` | **2.1.0** | latest, опубликована 30 июля 2026. Ставится точной версией без каретки |
| `@modelcontextprotocol/server` | **2.0.0** | обязательный peer-зависимость `mcp-handler@2.1.0`, `peerDependenciesMeta.optional: false`. latest, опубликован 30 июля 2026 |

Проверенные факты, на которых держится выбор:

- `mcp-handler@2.1.0` объявляет `peerDependencies: { "@modelcontextprotocol/server": "^2.0.0", "next": ">=13.0.0" }`. Пакет `next` помечен `optional: true`, то есть хендлер framework-agnostic и работает с web-стандартным `(request: Request) => Promise<Response>`.
- `@modelcontextprotocol/server@2.0.0` тянет `zod: ^4.2.0`. У нас в `package.json` уже `zod: ^4.4.3`, конфликта нет. Это и есть главная причина не брать 1.1.0: та требует `@modelcontextprotocol/sdk` ровно `1.26.0`, который сидит на zod 3, и мы получили бы два zod в дереве и две несовместимые схемы инструментов.
- В 2.1.0 нет зависимости от `redis` (в 1.1.0 она была ради SSE-стейта). Streamable HTTP без внешнего стейта, никакого Redis заводить не надо.
- Экспорты `mcp-handler@2.1.0`: `createMcpHandler` (внутреннее имя `createMcpRouteHandler`), `withMcpAuth` (плюс алиас `experimental_withMcpAuth`), `protectedResourceHandler`, `generateProtectedResourceMetadata`, `metadataCorsOptionsRequestHandler`, `getPublicOrigin`, `getPublicUrl`. Проверено по `dist/index.d.ts` из tarball, а не по документации.
- `engines.node: >=20`, у нас `>=22.18`. Проходит.

Команда установки ровно одна:

```
pnpm add mcp-handler@2.1.0 @modelcontextprotocol/server@2.0.0
```

Обе версии пиновать точно, без `^`. Причина: `@modelcontextprotocol/server` в мажоре 2 живёт две недели, минорные релизы там пока меняют поведение чаще, чем хотелось бы в проекте с дедлайном.

Сигнатуры, на которые опирается код (выписаны из типов, менять по памяти нельзя):

```ts
createMcpHandler(
  initializeServer: (server: McpServer) => void | Promise<void>,
  options?: ServerOptions & {
    serverInfo?: { name: string; version: string }
    verboseLogs?: boolean
    onEvent?: (event: McpEvent) => void
  },
): (request: Request) => Promise<Response>

withMcpAuth(
  handler: (req: Request) => Response | Promise<Response>,
  verifyToken: (req: Request, bearerToken?: string) => AuthInfo | undefined | Promise<AuthInfo | undefined>,
  opts?: { required?: boolean; resourceMetadataPath?: string; requiredScopes?: string[]; resourceUrl?: string },
): (req: Request) => Promise<Response>
```

`withMcpAuth` расширяет глобальный `Request` полем `auth?: AuthInfo`, и внутри инструментов авторизация достаётся именно оттуда, а не из повторного разбора заголовка.

## 2. Схема данных

Одна миграция: `supabase/migrations/20260813120000_agent_api_keys.sql`. Стиль ровно как в `20260812130000_phase9_subscriptions.sql` и `20260812140000_ai_usage_quota.sql`: комментарии по-русски объясняют не «что», а «почему», политики пишутся явно, отсутствие политики на запись это требование, а не забывчивость.

### 2.1 Таблица `api_keys`

```sql
create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  -- Метка, которую человек сам пишет в форме: "мой ноут", "n8n", "Claude Desktop".
  name         text not null,
  -- Видимая часть ключа. По ней и только по ней ищется строка при проверке
  -- запроса: искать по хешу означало бы полный скан при каждом обращении.
  prefix       text not null,
  -- sha256 полного ключа в hex. Ключ показывается человеку ровно один раз,
  -- в момент выдачи, и восстановить его из базы невозможно by design.
  key_hash     text not null,
  scopes       text[] not null default array['projects:read','projects:write','cutlist:read'],
  tier         text not null default 'free',
  last_used_at timestamptz,
  -- Ключ можно отозвать, не удаляя: история в api_usage ссылается на строку.
  revoked_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint api_keys_name_len   check (char_length(name) between 1 and 60),
  constraint api_keys_prefix_fmt check (prefix ~ '^egs_(live|test)_[0-9a-z]{8}$'),
  constraint api_keys_hash_fmt   check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint api_keys_tier_allowed check (tier in ('free', 'developer')),
  constraint api_keys_scopes_nonempty check (array_length(scopes, 1) >= 1)
);

create unique index if not exists api_keys_prefix_idx on public.api_keys (prefix);
create index if not exists api_keys_user_idx on public.api_keys (user_id, created_at desc);
```

`prefix` уникален глобально, поэтому проверка ключа это ровно один индексный поиск. Коллизия при генерации ловится ошибкой уникальности и обрабатывается повтором (максимум три попытки, дальше `failed`).

RLS:

```sql
alter table public.api_keys enable row level security;

-- Свои ключи человек видит в аккаунте: список, метка, дата, последнее использование.
create policy api_keys_select_own on public.api_keys
  for select to authenticated using (user_id = (select auth.uid()));

-- Отзыв ключа это единственная запись, доступная из браузера, и она безопасна:
-- ничего не включает, только выключает.
create policy api_keys_delete_own on public.api_keys
  for delete to authenticated using (user_id = (select auth.uid()));
```

Политик `insert` и `update` нет сознательно: строку заводит сервер под service-role ключом, потому что только он умеет посчитать sha256 и проверить лимит на количество ключей. Вставка из браузера означала бы, что человек сам себе пишет `tier: 'developer'`.

Дополнительно закрывается колонка с хешем на уровне привилегий:

```sql
revoke select (key_hash) on public.api_keys from authenticated;
```

Хеш без соли от 32 байт энтропии не брутфорсится, но отдавать его в браузер незачем ни при какой выборке, а `select *` из клиентского кода однажды напишут. Все выборки в коде и так перечисляют колонки явно.

Триггер `updated_at` переиспользует существующую `public.touch_updated_at()` (создана в `20260812090000`, `search_path` зафиксирован в `20260812091000`).

### 2.2 Таблица `api_usage`

Метеринг агрегированный, по ключу и календарному дню UTC. Строка на запрос не нужна: она стоит записи в базу на каждый вызов и даёт данные, которыми мы в MVP не пользуемся.

```sql
create table if not exists public.api_usage (
  key_id     uuid not null references public.api_keys (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- День в UTC, формат YYYY-MM-DD. Текстом, а не датой: ключ периода считается
  -- на сервере одной строкой и в таком же виде читается глазами в базе.
  -- Ровно тот же приём, что period в ai_usage.
  day        text not null,
  used       integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (key_id, day),
  constraint api_usage_day_format check (day ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  constraint api_usage_used_range check (used >= 0)
);

create index if not exists api_usage_user_day_idx on public.api_usage (user_id, day desc);

alter table public.api_usage enable row level security;

create policy api_usage_select_own on public.api_usage
  for select to authenticated using (user_id = (select auth.uid()));
```

Политик записи нет: пишет только функция ниже под service-role.

### 2.3 Атомарное списание лимита

Копия проверенного приёма из `consume_ai_quota`: проверка лимита и инкремент под одной блокировкой строки, поэтому два параллельных запроса не могут оба увидеть `used = 49` и уйти на 51.

```sql
create or replace function public.consume_api_quota(
  p_key_id  uuid,
  p_user_id uuid,
  p_day     text,
  p_limit   integer,
  p_cost    integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_cost is null or p_cost <= 0 or p_limit is null or p_cost > p_limit then
    return null;
  end if;

  insert into public.api_usage as u (key_id, user_id, day, used)
  values (p_key_id, p_user_id, p_day, p_cost)
  on conflict (key_id, day) do update
    set used = u.used + p_cost
    where u.used + p_cost <= p_limit
  returning u.used into v_used;

  return v_used;
end;
$$;

revoke all on function public.consume_api_quota(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_quota(uuid, uuid, text, integer, integer) to service_role;
```

Возврат `null` значит «лимит выбран», ровно как в `consume_ai_quota`. Отдельной `release_api_quota` нет: HTTP-запрос уже сделан, возвращать нечего.

`last_used_at` двигается второй функцией `public.touch_api_key(p_key_id uuid)`, тоже `security definer`, тоже только для service_role. Отдельно от квоты, потому что она обновляет `api_keys`, а не `api_usage`, и не должна попадать под транзакцию списания.

## 3. Формат ключа и его проверка

Файл `lib/api/keys.ts`, чистые функции без Supabase, поэтому целиком покрываются vitest.

Формат: `egs_live_<8 символов префикса>_<43 символа секрета>`. Пример: `egs_live_a3f9c204_7Kq2mZ...`. Кодировка обеих частей: base32-подобный алфавит `0123456789abcdefghijklmnopqrstuvwxyz` для префикса (он попадает в SQL-констрейнт и в интерфейс, регистр там только мешает) и base64url для секрета (32 байта из `crypto.getRandomValues`).

- `generateApiKey(env: 'live' | 'test'): { plaintext, prefix, hash }`
- `hashApiKey(plaintext: string): string` - sha256 через `crypto.subtle.digest`, hex в нижнем регистре. Web Crypto, а не `node:crypto`, потому что роуты должны уметь жить и на edge, если мы туда переедем.
- `parseApiKey(raw: string): { prefix: string; plaintext: string } | null` - разбирает заголовок, проверяет форму, ничего не бросает.
- `timingSafeEqualHex(a: string, b: string): boolean` - постоянное по времени сравнение xor-накоплением. `crypto.timingSafeEqual` из Node тут не берём ровно по той же причине, что и выше.

Проверка запроса, `lib/api/auth.ts`:

1. Достать `Authorization: Bearer <key>`. Нет заголовка или он не `Bearer` - `401 unauthorized`.
2. `parseApiKey`. Не разобрался - `401 unauthorized` (одинаковый ответ на «нет ключа» и «мусор вместо ключа», чтобы не подсказывать формат перебором).
3. Один запрос под service-role: `select id, user_id, scopes, tier, key_hash, revoked_at from api_keys where prefix = $1`.
4. Строки нет, или `revoked_at` не null - `401 unauthorized`.
5. `timingSafeEqualHex(hashApiKey(plaintext), row.key_hash)`. Не совпало - `401 unauthorized`.
6. Проверить скоуп, который требует эндпоинт. Нет скоупа - `403 forbidden`.
7. `consume_api_quota` с лимитом по `tier`. Вернула null - `429 rate_limited`.
8. `touch_api_key` без ожидания результата (`void`, ошибка глотается: обновление метки времени не повод ронять запрос).

Результат: `type ApiCaller = { keyId: string; userId: string; scopes: readonly ApiScope[]; tier: ApiTier; usage: { used: number; limit: number } }`.

Важно: проверка ключа ходит в Supabase **под service-role** (`lib/supabase/service.ts`), потому что запрос анонимный, сессии нет и RLS не за кого зацепиться. А вот дальше, в сервисном слое, работа с `projects` идёт **тоже под service-role, но с обязательным явным `.eq('user_id', caller.userId)`** в каждом запросе. Это записано в `lib/api/service.ts` первым комментарием: service-role обходит RLS, и забытый фильтр по пользователю здесь означает утечку чужих проектов. Ни один запрос в сервисе не пишется без этого фильтра, тест на это есть (раздел 10).

Если `isSupabaseServiceConfigured()` даёт false, все API-эндпоинты отвечают `503 unavailable` с честным телом. Без service-ключа проверить ключ нечем, и притворяться, что API работает, нельзя.

## 4. Тиры и лимиты

Файл `lib/api/limits.ts`, чистые числа без импортов, ровно как `lib/stripe/limits.ts`:

```ts
export type ApiTier = 'free' | 'developer'

/** Запросов в сутки UTC на один ключ. */
export const API_DAILY_LIMIT: Record<ApiTier, number> = {
  free: 50,
  developer: 2000,
}

/** Сколько активных ключей держит аккаунт. Защита от бесконечного обхода лимита новыми ключами. */
export const API_KEYS_PER_USER: Record<ApiTier, number> = {
  free: 2,
  developer: 10,
}
```

Free 50 в сутки это цифра из ресерча (модель Resend: бесплатного тира хватает отладить интеграцию и не хватает работать на нём постоянно). Developer 2000 в сутки, потому что это порядок, при котором агент реально живёт в продукте, а мы всё ещё умещаемся в бесплатный Supabase.

Лимит считается **на ключ**, а не на пользователя. Обход через выпуск десяти ключей закрыт `API_KEYS_PER_USER`.

Тир берётся из колонки `tier` ключа. Кто ставит `developer`: пока никто автоматически, только руками в базе. Это сознательно, см. раздел 9.

## 5. Сервисный слой

`lib/api/service.ts`. Единственный модуль, где живёт продуктовая логика API. Импортирует `server-only`. Ни один route handler и ни один MCP tool не ходит в Supabase напрямую.

Сигнатуры (все возвращают тот же `ActionResult<T>`, что и `app/actions/projects.ts`, чтобы коды ошибок были одни на весь проект):

```ts
export type ServiceError = ProjectsError | 'forbidden' | 'rateLimited' | 'unavailable'

listProjects(userId: string, opts?: { limit?: number; cursor?: string }): Promise<ActionResult<ProjectListPage>>
createProject(userId: string, name: string, design: unknown): Promise<ActionResult<ProjectSummary>>
getProject(userId: string, id: string): Promise<ActionResult<{ summary: ProjectSummary; design: Design }>>
updateProject(userId: string, id: string, patch: { name?: string; design?: unknown }): Promise<ActionResult<ProjectSummary>>
deleteProject(userId: string, id: string): Promise<ActionResult<null>>
computeCutlist(design: unknown, locale: Locale): Promise<ActionResult<CutlistPayload>>
shareLink(design: unknown): ActionResult<{ url: string }>
```

Что внутри:

- Валидация `design` через существующую `parseDesign` из `lib/persist`. Ничего нового не пишется: схема одна на редактор, на server actions и на API. Документ из прошлой версии схемы прогоняется миграциями автоматически.
- Лимит бесплатных проектов (`FREE_PROJECT_LIMIT`) проверяется тем же способом, что в `saveProjectAction`: `count: 'exact', head: true` плюс `getProStatus`. Но `getProStatus()` читает сессию из cookie, поэтому в сервис добавляется её вариант от `userId`: `proStatusForUser(userId)` в `lib/stripe/pro.ts`. Существующая `getProStatus()` переписывается в обёртку над ней. Это единственная правка вне новых файлов, кроме `proxy.ts`.
- `computeCutlist` это `parseDesign` -> `compile` -> `calcProject` -> `buildCutPlan` -> `buildGlueUpSteps`. Все четыре чистые, DOM не нужен, работает в serverless без оговорок. Возвращает `{ plan, steps, calc, model: { widthMm, lengthMm, thicknessMm } }` плюс, по флагу запроса, готовый CSV через `cutPlanToCsv`.
- `shareLink` это `encodeDesignToHash` плюс `APP_ORIGIN`: `${APP_ORIGIN}/#${hash}`. Функция синхронная и чистая, в базу не ходит.

`updateProject` это новая возможность, которой у server actions пока нет (в `projects.ts` она помечена точкой расширения фазы 8). Реализуется здесь один раз, и `app/actions/projects.ts` получает `updateProjectAction` обёрткой над ней, чтобы студия наконец умела «Сохранить поверх», а не плодить строки. Это не расширение объёма, это устранение причины будущего дублирования.

Пагинация: `listProjects` отдаёт `{ items, nextCursor }`, курсор это `updated_at` последней строки в base64url. Лимит по умолчанию 50, максимум 100. Без курсора агент с сотней проектов не сможет их прочитать, а городить offset на таблице, отсортированной по `updated_at`, значит однажды выдать дубли.

## 6. REST API v1

База: `https://app.endgrain.app/api/v1`. Именно app-поддомен, см. раздел 8 про `proxy.ts`.

Все роуты объявляют `export const runtime = 'nodejs'` и `export const dynamic = 'force-dynamic'`. Кеша быть не должно ни на одном ответе: заголовок `Cache-Control: no-store` ставится общим хелпером.

### 6.1 Эндпоинты

| Метод и путь | Скоуп | Что делает |
|---|---|---|
| `GET /api/v1/me` | любой | Кто я, тир, остаток лимита. Дешёвая проверка ключа, стоит 1 запрос квоты |
| `GET /api/v1/projects` | `projects:read` | Список проектов, `?limit=`, `?cursor=` |
| `POST /api/v1/projects` | `projects:write` | Создать проект: `{ name, design }` |
| `GET /api/v1/projects/{id}` | `projects:read` | Проект целиком: метаданные плюс документ узора |
| `PATCH /api/v1/projects/{id}` | `projects:write` | Обновить имя, документ или оба |
| `DELETE /api/v1/projects/{id}` | `projects:write` | Удалить проект |
| `POST /api/v1/cutlist` | `cutlist:read` | Посчитать распил по присланному `design` либо по `projectId` |
| `GET /api/v1/projects/{id}/export` | `cutlist:read` | Ссылки на выгрузку: `pdfUrl` (см. 6.4), `csv` инлайном |

Файлы:

```
app/api/v1/me/route.ts
app/api/v1/projects/route.ts
app/api/v1/projects/[id]/route.ts
app/api/v1/projects/[id]/export/route.ts
app/api/v1/cutlist/route.ts
lib/api/http.ts        // withApiAuth, ok(), fail(), заголовки лимита
```

`withApiAuth(scope, handler)` из `lib/api/http.ts` это единственный способ объявить эндпоинт. Он делает всю цепочку из раздела 3, ловит исключения и превращает их в `500 failed`, и добавляет к любому ответу заголовки:

```
X-RateLimit-Limit: 50
X-RateLimit-Remaining: 37
X-RateLimit-Reset: 2026-08-14T00:00:00Z
```

`Reset` это всегда полночь UTC следующих суток, потому что период у нас календарный день.

### 6.2 Формат ошибок

Один на все эндпоинты и на MCP:

```json
{ "error": { "code": "rateLimited", "message": "Daily limit of 50 requests reached" } }
```

Коды: `unauthorized` (401), `forbidden` (403), `invalid` (400), `notFound` (404), `limit` (402, лимит проектов бесплатного тарифа), `rateLimited` (429), `unavailable` (503), `failed` (500). Коды совпадают с `ProjectsError` из server actions плюс четыре новых, поэтому таблицы перевода кодов между слоями не существует.

Сообщения в теле API - **по-английски**. Это единственное место в проекте, где не русский, и причина простая: тело ошибки читает не человек, а модель, и половина клиентов покажет его в своём интерфейсе как есть. Правило «тексты пользователю по-русски» относится к интерфейсу, а API это не интерфейс. Человекочитаемые тексты вокруг API (страница ключей, тарифы, документация) - по-русски, как и всё остальное.

### 6.3 Валидация входа

Zod-схемы в `lib/api/schemas.ts`, отдельно от `lib/persist/schema.ts`: там схема документа, тут схема запроса. Тело больше 512 КБ отклоняется до разбора (`Content-Length`, а при его отсутствии счётчик на стриме): узор весит килобайты, и мегабайтный JSON в serverless это только способ купить нам таймаут.

### 6.4 PDF: что именно возвращается

`GET /api/v1/projects/{id}/export` отдаёт:

```json
{
  "csv": "...",
  "pdfUrl": "https://app.endgrain.app/#<lz-string hash документа>",
  "pdfNote": "Open the link and use Export -> PDF. Server-side PDF rendering is not available yet."
}
```

Честно и работает: агент отдаёт человеку ссылку, человек открывает готовый проект в студии и жмёт экспорт. Серверный рендер PDF - отдельная задача с headless-браузером, и она в этот объём не входит.

## 7. MCP-сервер

Один файл: `app/api/mcp/route.ts`. Плюс `lib/api/mcpTools.ts`, где инструменты объявлены отдельно от транспорта, чтобы их можно было прогнать в vitest без HTTP.

```ts
import { createMcpHandler, withMcpAuth } from 'mcp-handler'

const handler = createMcpHandler(registerEndgrainTools, {
  serverInfo: { name: 'endgrain-studio', version: ENGINE_VERSION },
  verboseLogs: false,
})

const authed = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  requiredScopes: [],
})

export { authed as GET, authed as POST, authed as DELETE }
```

`DELETE` экспортируется, потому что Streamable HTTP использует его для закрытия сессии. `runtime = 'nodejs'`, `dynamic = 'force-dynamic'`, `maxDuration = 60`.

`verifyMcpToken(req, bearerToken)` из `lib/api/auth.ts` - та же функция, что в REST, обёрнутая в `AuthInfo`: `{ token, clientId: keyId, scopes, extra: { userId, tier } }`. Если проверка не прошла, возвращается `undefined`, и `withMcpAuth` сам отдаёт 401 с корректным `WWW-Authenticate`. Внутри инструмента вызывающий достаётся из `req.auth`, а не разбирается заново.

Скоупы на уровне `withMcpAuth` не требуем (`requiredScopes: []`), потому что у разных инструментов они разные. Проверка скоупа живёт внутри инструмента, тем же хелпером, что в REST.

Инструменты (ровно пять, каждый в один вызов сервиса):

| Tool | Аргументы | Сервис |
|---|---|---|
| `list_projects` | `limit?`, `cursor?` | `listProjects` |
| `get_project` | `id` | `getProject` |
| `create_project` | `name`, `design` | `createProject` |
| `update_project` | `id`, `name?`, `design?` | `updateProject` |
| `compute_cutlist` | `projectId?` или `design?`, `locale?` | `computeCutlist` плюс `shareLink` в ответе |

Схемы аргументов - zod 4, тот же `zod`, что уже стоит в проекте. Описания инструментов на английском, по той же причине, что и сообщения об ошибках: их читает модель.

Ответы инструментов возвращаются и текстом (краткая человекочитаемая сводка), и структурой (`structuredContent`). Модель без структуры вынуждена парсить прозу, а клиент без текста показывает пользователю пустоту.

Отдельного `delete_project` в MCP **нет** сознательно. Удаление проекта необратимо, а агент, которому дали ключ на чтение и запись, не должен уметь стереть работу одним неверно понятым запросом. Через REST удаление есть, там за запросом стоит явно написанный человеком код.

RFC 9728 и полный OAuth 2.1 не делаем: `protectedResourceHandler` в этот объём не входит, ключ как Bearer это ровно то, что делает Stripe в своём MCP. Место для расширения оставлено тем, что `withMcpAuth` умеет `resourceMetadataPath` из коробки.

## 8. Правка `proxy.ts`

Две строки, обе обязательные.

Первая: на корневом домене (`role === 'site'`) сейчас любой путь кроме `/` и `/landing` уезжает 307-редиректом на app-поддомен. Для браузера это нормально, для MCP-клиента - нет: не все следуют редиректу на POST, и человек, который вобьёт `endgrain.app/api/mcp`, получит невнятную ошибку. Решение: на site-хосте пути `/api/` отдавать `NextResponse.rewrite` на тот же путь, то есть обслуживать их прямо на корневом домене. Роуты одни и те же, приложение одно, разводить их незачем.

Вторая: на app-хосте для `/api/v1/` и `/api/mcp` делать ранний `return NextResponse.next()` до вызова `updateSession`. Сейчас каждый запрос к API тянет поход в Supabase за продлением cookie-сессии, которой у агента нет и быть не может. Это лишние 50-150 мс и лишний запрос к базе на каждый вызов.

Канонический адрес в документации всё равно один: `https://app.endgrain.app/api/v1` и `https://app.endgrain.app/api/mcp`. Корневой домен работает как запасной вход.

## 9. Тариф Developer и интерфейс ключей

### 9.1 Страница тарифов

`app/pricing/page.tsx` получает третью карточку. Тексты в i18n-словари, как всё остальное.

- Заголовок: «Developer».
- Статус: «Скоро». Кнопки оплаты нет, вместо неё строка «Пишите на почту, если нужен доступ к API уже сейчас».
- Содержимое: 2000 запросов к API в сутки, до 10 ключей, MCP-сервер, приоритетная поддержка.
- Цены нет вовсе. Не «$X в месяц, скоро», а именно нет. Названная и потом изменённая цена стоит дороже, чем не названная.

Free-колонка получает строку «API: 50 запросов в сутки, 2 ключа», потому что API доступен всем, и это главный аргумент выкатывать его сейчас.

### 9.2 Страница ключей

Новая страница `app/account/api/page.tsx` (раздел «Аккаунт», которого пока нет; создаётся вместе с ней, минимальный layout). Требует входа, гейт стандартный через `decideAccess`.

Что умеет:

- Список ключей: метка, префикс (`egs_live_a3f9c204...`), тир, дата создания, «использован» (`last_used_at` человекочитаемо), сегодняшний расход из `api_usage`.
- Кнопка «Создать ключ» с полем метки. После создания ключ показывается **один раз**, крупным моноширинным блоком, с кнопкой копирования и явным предупреждением, что второй раз его не покажут. Закрытие блока требует подтверждения.
- Кнопка «Отозвать» с подтверждением. Отзыв это `update revoked_at` через server action под service-role (не `delete`, потому что на строку ссылается `api_usage`).
- Блок «Как подключить» с готовыми кусками: `curl` с Bearer-ключом и JSON-фрагмент конфига MCP-клиента с адресом `https://app.endgrain.app/api/mcp`.

Server actions для этого: `app/actions/apiKeys.ts` - `listApiKeysAction`, `createApiKeyAction(name)`, `revokeApiKeyAction(id)`. Создание идёт через service-role, потому что политики insert у таблицы нет.

### 9.3 Что откладываем и почему

Явный список, чтобы к нему не возвращались:

- **Stripe-цена и оплата Developer.** Тариф выкатывается как «скоро». Апгрейд руками через письмо. Причина: касса под тариф, который никто ещё не просил, это полдня работы с нулевой проверяемой гипотезой.
- **Автоматическая выдача `tier: 'developer'`.** Пока ставится руками в базе. Когда появится оплата, тир будет вычисляться из `subscriptions`, и колонка `tier` в `api_keys` станет кешем. Место для этого есть.
- **Серверный рендер PDF.** Раздел 6.4.
- **OAuth 2.1 и RFC 9728 для MCP.** Bearer-ключа хватает, `withMcpAuth` расширяем без переписывания.
- **Овераж и биллинг по запросам.** Лимит жёсткий, 429 и всё.
- **Постраничный лог запросов.** Агрегата по дням достаточно, чтобы человек видел расход.
- **Вебхуки наружу.** Агент опрашивает, а не подписывается.
- **OpenAPI-спека.** Хорошая идея, но её ценность в автогенерации клиентов, а у нас MCP закрывает тот же сценарий напрямую. Если останется время после сдачи.

## 10. Тест-план

### Vitest, включается существующим `include: ['lib/**/*.test.ts', 'app/**/*.test.ts']`

`lib/api/keys.test.ts`
- Сгенерированный ключ разбирается своей же `parseApiKey`, префикс совпадает, форма проходит регулярку из SQL-констрейнта (та же строка регулярки продублирована в тесте константой, и это осознанный дубль: он ловит расхождение кода и миграции).
- `hashApiKey` даёт 64 hex-символа в нижнем регистре и стабилен между вызовами.
- `timingSafeEqualHex` даёт false на разной длине и на отличии в последнем символе.
- Мусорные входы (`''`, `'Bearer '`, `'egs_live_короткий'`, ключ с юникодом) возвращают `null`, а не бросают.

`lib/api/auth.test.ts` (Supabase замокан)
- Нет заголовка, не-Bearer, неизвестный префикс, отозванный ключ, верный префикс с неверным секретом - все пять дают `unauthorized` и **одинаковое** тело ответа.
- Нехватка скоупа даёт `forbidden`, и квота при этом **не списывается** (проверка порядка вызовов).
- `consume_api_quota` вернула `null` - результат `rateLimited`.
- `isSupabaseServiceConfigured() === false` - результат `unavailable`, и в базу не ходили вовсе.
- Успешный путь дёргает `touch_api_key`, и упавший `touch_api_key` не ломает ответ.

`lib/api/limits.test.ts`
- Free строго меньше developer по обоим лимитам, все значения положительные целые (property-тест через fast-check тут излишен, хватает таблицы).

`lib/api/service.test.ts` (Supabase замокан)
- **Каждый** запрос к `projects` содержит фильтр по `user_id`. Тест перебирает все экспортируемые функции сервиса и проверяет вызовы мока. Это главный тест безопасности всей задачи: service-role обходит RLS.
- `createProject` при исчерпанном `FREE_PROJECT_LIMIT` и `pro: false` даёт `limit`, при `pro: true` проходит.
- `getProject` чужого id даёт `notFound`, а не чужой документ.
- `computeCutlist` на фикстуре `baseDesign` даёт непустой план и совпадает с прямым вызовом `buildCutPlan` (сервис ничего не пересчитывает по-своему).
- `updateProject` с пустым патчем даёт `invalid`.
- Курсор пагинации: кодируется и декодируется в себя, битый курсор даёт `invalid`.

`lib/api/mcpTools.test.ts`
- Все пять инструментов зарегистрированы, имена и схемы аргументов совпадают со спекой.
- `delete_project` **отсутствует** (тест на сознательное решение, а не на опечатку).
- Ошибка сервиса превращается в MCP-ошибку с тем же кодом, а не в успешный ответ с текстом ошибки внутри.

### Playwright, `e2e/api.spec.ts`, через `request` context без браузера

Поднимается тем же `webServer`, что остальные e2e. Живого Supabase в CI нет, поэтому сценарии делятся на две группы.

Без Supabase (гоняется всегда):
- `GET /api/v1/me` без заголовка - 401, тело содержит `error.code === 'unauthorized'`.
- `GET /api/v1/me` с мусорным ключом - 401, тело **байт в байт** совпадает с предыдущим.
- `POST /api/v1/projects` с ключом, но без Supabase - 503 `unavailable`.
- `POST /api/v1/cutlist` с валидным `design` и без ключа - 401 (расчёт не бесплатный вход).
- `GET /api/v1/projects` отдаёт `Cache-Control: no-store`.
- `POST /api/mcp` без ключа - 401 и заголовок `WWW-Authenticate` присутствует.
- `POST /api/mcp` с `initialize` и валидным ключом на ненастроенном Supabase - корректный JSON-RPC-ответ с ошибкой, а не 500 и не HTML.
- Тело больше лимита - 413 до разбора JSON.
- Корневой домен: запрос на `/api/v1/me` с заголовком `Host: endgrain.app` не редиректится (проверка правки `proxy.ts`).

С Supabase (гоняется, когда переменные заданы, иначе `test.skip`):
- Полный цикл: создать ключ через server action, создать проект по API, прочитать список, получить проект, обновить имя, посчитать cutlist, удалить проект.
- Чужой проект по прямому id - 404.
- Отозванный ключ - 401.

## 11. Секция для llms.txt

SEO-кластер делает файл, мы даём готовый кусок. Вставляется как есть, ссылки абсолютные.

```
## Для агентов и разработчиков

- [REST API v1](https://app.endgrain.app/api/v1): HTTP API поверх студии. Аутентификация Bearer-ключом из раздела «Аккаунт - API». Проекты, узоры, расчёт распила, ссылка на выгрузку. Бесплатно 50 запросов в сутки.
- [MCP-сервер](https://app.endgrain.app/api/mcp): Model Context Protocol поверх Streamable HTTP. Инструменты list_projects, get_project, create_project, update_project, compute_cutlist. Тот же Bearer-ключ. Подключается к Claude Desktop, Cursor и любому MCP-клиенту.
- [Документация API](https://endgrain.app/docs/api): форматы запросов, коды ошибок, лимиты тарифов.
- [Тарифы](https://endgrain.app/pricing): Free даёт 50 запросов в сутки и 2 ключа, Developer даёт 2000 запросов и 10 ключей.
```

Требование к кластеру: раздел ставится **после** продуктовых разделов, но **до** `## Optional`. Агент, который читает файл сверху вниз, должен наткнуться на MCP раньше, чем на второстепенное.

Страницы `/docs/api` пока нет. Либо кластер делает её заглушкой из этого документа, либо ссылка на неё из llms.txt убирается до появления страницы. Ссылки на 404 в llms.txt быть не должно: это ровно тот файл, который читает машина, не умеющая пожать плечами.

## 12. Порядок работ

Четыре коммита, каждый оставляет репозиторий зелёным (`pnpm lint && pnpm typecheck && pnpm test`).

1. **Миграция и ключи.** `20260813120000_agent_api_keys.sql`, `lib/api/keys.ts`, `lib/api/limits.ts`, `lib/api/auth.ts`, их тесты. Наружу ничего не торчит.
2. **Сервисный слой.** `lib/api/service.ts`, `proStatusForUser` в `lib/stripe/pro.ts`, `updateProjectAction` в `app/actions/projects.ts` как обёртка, тесты сервиса.
3. **REST v1 и proxy.** `app/api/v1/**`, `lib/api/http.ts`, `lib/api/schemas.ts`, правка `proxy.ts`, `e2e/api.spec.ts`.
4. **MCP, интерфейс, тарифы.** `pnpm add mcp-handler@2.1.0 @modelcontextprotocol/server@2.0.0`, `app/api/mcp/route.ts`, `lib/api/mcpTools.ts`, `app/actions/apiKeys.ts`, `app/account/api/page.tsx`, колонка Developer на странице тарифов, тексты в i18n.

Ручная проверка перед закрытием задачи: выпустить ключ на проде, дёрнуть `curl` по всем восьми REST-эндпоинтам, подключить прод-MCP к живому клиенту и попросить его создать проект и посчитать распил, убедиться, что созданный проект виден в студии под тем же аккаунтом.

## 13. Риски

- **Забытый фильтр `user_id` при service-role.** Единственный способ утечь чужими данными. Закрыт тестом, который перебирает все функции сервиса, и комментарием первой строкой в модуле.
- **`@modelcontextprotocol/server` в мажоре 2 живёт две недели.** Версия пинуется точно. Если в ней всплывёт баг, откат это возврат к 1.1.0 плюс `@modelcontextprotocol/sdk@1.26.0`, и тогда придётся разбираться с двумя zod в дереве. Поэтому сначала MCP, потом всё остальное в этом коммите, чтобы проблема всплыла до того, как вокруг неё построится интерфейс.
- **Serverless-таймаут на `compute_cutlist` для большого узора.** `buildCutPlan` линеен по числу элементов, но лимит на размер тела (512 КБ) стоит и по этой причине тоже.
- **Ключ в логах.** `verboseLogs: false` у `createMcpHandler` не случайно. Ни одна наша строка лога не пишет заголовок `Authorization` и не пишет plaintext ключа: в логи уезжает только `keyId`.
