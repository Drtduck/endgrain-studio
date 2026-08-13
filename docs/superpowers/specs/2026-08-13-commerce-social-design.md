# Кластер «Commerce + Social»: галерея, продажа проектов, sale-prep и кошелёк

Дата: 13.08.2026. Закрывает пункты техдолга 5 (Pro sale-prep, кошелёк, видео) и 6 (публичная галерея).

Документ проектный: решения приняты, спорные развилки разобраны, всё лишнее вынесено в раздел
«Отложено на финальный этап». Порядок изложения: сквозные решения, потом пункт 6, потом пункт 5,
потом файловый план, тест-план и отложенное.

## 0. Что уже есть и на что опираемся

Существующие вещи, которые не переписываются, а переиспользуются буквально:

- `public.projects` (RLS владельца, `design jsonb`, лимит размера 512 КБ, триггер `touch_updated_at`).
- `public.subscriptions` (пишет только вебхук под service-role, у клиента только select).
- `public.ai_usage` плюс SQL-функции `consume_ai_quota` и `release_ai_quota`: образец атомарного
  списания под блокировкой строки. Кошелёк строится по этому же шаблону, ничего изобретать не надо.
- `lib/ai/entitlements.ts` (`assertAiAllowed` / `releaseAiQuota` / `isAiDemoMode`) плюс чистый
  `lib/ai/quota.ts`. Единственная точка входа в платные AI-фичи, sale-prep обязан пройти там же.
- `app/api/stripe/webhook/route.ts` плюс чистый парсер `lib/stripe/events.ts`.
- `lib/export/svg.ts` -> `renderBoardSvg(model, options)`: чистая функция без DOM, отдаёт строку SVG.
  Плюс `compile` из `lib/engine` и `parseDesign` из `lib/persist`. Значит SSR-превью из `design jsonb`
  делается на сервере целиком, без Storage, без картинок и без клиентского canvas.
- `lib/auth/access.ts` -> `PUBLIC_PREFIXES`: список публичных путей студии.
- `proxy.ts`: `role === 'site'` (корневой домен) отдаёт лендинг, всё остальное уводит на app-поддомен.

## 1. Сквозные решения

### 1.1. Деньги считаем в центах целыми числами

Ни одного `numeric`, ни одного `float`. `price_cents integer`, `balance_cents integer`,
`amount_cents integer`. Валюта пока одна, `usd`, и зафиксирована check-констрейнтом: мультивалютность
без выплат авторам бессмысленна, а поле `currency` оставлено, чтобы не переделывать схему потом.

### 1.2. Все деньги и все счётчики пишет только сервер

Никаких политик insert/update на клиентские роли для `wallets`, `wallet_transactions`,
`project_purchases` и для счётчиков `likes_count` / `saves_count`. Это ровно тот же принцип, что уже
записан в миграции подписок: любая запись из браузера означала бы, что баланс пополняется подделкой
запроса. Пишут SQL-функции `security definer` и вебхук под service-role.

Для `published_projects` часть колонок редактируется владельцем (название, цена, статус), а часть
не редактируется никогда (`design`, счётчики). RLS столбцы не различает, поэтому применяется
column-level grant: `revoke update on ... from authenticated` и точечный
`grant update (title, price_cents, status) ...`. Это единственный честный способ сделать снапшот
неизменяемым: купленный проект не должен подменяться после покупки.

### 1.3. One-time Checkout делается один раз и обслуживает два сценария

Кошельку нужен разовый платёж, покупке проекта из галереи нужен разовый платёж. Механизм один:
Stripe Checkout `mode=payment` плюс событие `checkout.session.completed` в уже существующем роуте
вебхука. Различает сценарии `metadata.kind`.

Расширение вебхука спроектировано так, чтобы не задеть ветку подписок:

```
parseOneTimeEvent(raw)   // checkout.session.completed, mode=payment, payment_status=paid
  -> не null -> ветка разового платежа, роутинг по metadata.kind
  -> null    -> parseSubscriptionEvent(raw), существующая ветка, без изменений
```

Инварианты подписочной ветки (проверка `last_event_at`, защита от чужой подписки поверх живой) к
разовым платежам неприменимы вовсе: там нет состояния, которое можно откатить. Идемпотентность
разового платежа даёт уникальный индекс по `stripe_session_id` в ledger-таблице, а не сравнение дат.

Сумму берём из `amount_total` события, а не из metadata: сумма, пришедшая с клиента, это подпись
человека под собственным чеком, ей верить нельзя. Валюта проверяется там же.

### 1.4. Что входит в MVP, а что становится фазой 2

Пополнение кошелька разовым платежом входит в MVP: без него пункт 5 не имеет смысла вовсе, а
проверяется он тестовой картой Stripe за один прогон.

Покупка платного проекта из галереи в MVP не включается. Довод не в сложности Checkout (он тот же
самый), а в том, что за деньгами покупателя немедленно встаёт вопрос выплаты автору, возвратов и
налогов, а это Stripe Connect и юридическая часть, которых в конкурсных сроках нет. Поэтому:

- поле `price_cents` в схеме есть с первого дня, автор его выставляет, галерея цену показывает;
- бесплатный проект (`price_cents = 0`) копируется себе сразу, это и есть работающая соцмеханика;
- у платного кнопка покупки нарисована и подписана «скоро», сама она задизейблена;
- таблица `project_purchases` создаётся сразу, потому что от неё зависит правило «копировать себе
  можно бесплатный или купленный», и вводить её потом значило бы переписывать это правило;
- `metadata.kind = 'gallery_purchase'` заведён в разборе события, ветка возвращает «не поддержано»
  и пишет в лог. Включение фазы 2 это один action создания сессии плюс один обработчик, без миграций.

## 2. Пункт 6: публичная галерея

### 2.1. Схема

```sql
-- Публикация: неизменяемый снапшот документа плюс редактируемая витрина.
create table if not exists public.published_projects (
  id                uuid primary key default gen_random_uuid(),
  author_id         uuid not null references auth.users (id) on delete cascade,
  -- Ссылка на исходный проект нужна только автору («этот уже опубликован»).
  -- set null, а не cascade: удаление своего проекта не должно стирать публикацию,
  -- на которую уже сослались и которую могли скопировать себе.
  source_project_id uuid references public.projects (id) on delete set null,
  title             text not null,
  -- Снапшот. Меняться не может никогда: см. column-level grant ниже.
  design            jsonb not null,
  -- Денормализованная сводка (габарит, число клеток, породы), считается один раз
  -- при публикации серверным compile. Список галереи иначе компилировал бы движок
  -- на каждую карточку при каждом рендере страницы.
  summary           jsonb not null,
  price_cents       integer not null default 0,
  currency          text    not null default 'usd',
  likes_count       integer not null default 0,
  saves_count       integer not null default 0,
  -- public видно всем, unlisted только по прямой ссылке, removed скрыто везде.
  -- Модерации нет, но рубильник «убрать со стены» должен существовать с первого дня.
  status            text    not null default 'public',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint published_title_len check (char_length(title) between 1 and 120),
  constraint published_design_size check (pg_column_size(design) <= 524288),
  constraint published_summary_size check (pg_column_size(summary) <= 8192),
  -- Потолок 500 долларов: цена выше это опечатка или витрина не для нас.
  constraint published_price_range check (price_cents between 0 and 50000),
  constraint published_currency check (currency = 'usd'),
  constraint published_status_allowed check (status in ('public', 'unlisted', 'removed')),
  constraint published_counts_nonneg check (likes_count >= 0 and saves_count >= 0)
);

comment on table public.published_projects is 'Витрина галереи: неизменяемый снапшот design плюс редактируемые название, цена и статус';
comment on column public.published_projects.summary is 'Сводка для карточки: {widthMm,lengthMm,thicknessMm,cellCount,species[]}';

-- Лента «новое»: ровно этот порядок, с id как хвостовым разделителем ничьих.
create index if not exists published_new_idx
  on public.published_projects (status, created_at desc, id desc);

-- Лента «популярное».
create index if not exists published_popular_idx
  on public.published_projects (status, likes_count desc, created_at desc, id desc);

-- «Мои публикации» в панели проектов.
create index if not exists published_author_idx
  on public.published_projects (author_id, created_at desc);

drop trigger if exists published_touch_updated_at on public.published_projects;
create trigger published_touch_updated_at
  before update on public.published_projects
  for each row execute function public.touch_updated_at();

alter table public.published_projects enable row level security;

-- Галерея публична и открывается без входа: anon тоже читает.
-- removed не видит никто, кроме автора (вторая политика).
drop policy if exists published_select_visible on public.published_projects;
create policy published_select_visible on public.published_projects
  for select to anon, authenticated
  using (status in ('public', 'unlisted'));

drop policy if exists published_select_own on public.published_projects;
create policy published_select_own on public.published_projects
  for select to authenticated
  using (author_id = (select auth.uid()));

drop policy if exists published_insert_own on public.published_projects;
create policy published_insert_own on public.published_projects
  for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists published_update_own on public.published_projects;
create policy published_update_own on public.published_projects
  for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

drop policy if exists published_delete_own on public.published_projects;
create policy published_delete_own on public.published_projects
  for delete to authenticated
  using (author_id = (select auth.uid()));

-- Главная защита снапшота. RLS не различает колонки, поэтому без этих двух строк
-- автор мог бы после продажи подменить design, а любой владелец строки накрутить
-- себе likes_count обычным update из браузера с валидным JWT.
revoke update on public.published_projects from authenticated;
grant update (title, price_cents, status) on public.published_projects to authenticated;
```

```sql
-- Лайки. Составной первичный ключ и есть защита от двойного лайка: повторный
-- insert падает на конфликте, а не удваивает счётчик.
create table if not exists public.project_likes (
  published_id uuid not null references public.published_projects (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (published_id, user_id)
);

create index if not exists project_likes_user_idx on public.project_likes (user_id);

alter table public.project_likes enable row level security;

-- Читает человек только свои лайки: интерфейсу нужен ровно ответ «я лайкнул или нет»,
-- а общее число берётся из денормализованного счётчика. Список лайкнувших наружу не отдаём.
drop policy if exists project_likes_select_own on public.project_likes;
create policy project_likes_select_own on public.project_likes
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists project_likes_insert_own on public.project_likes;
create policy project_likes_insert_own on public.project_likes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists project_likes_delete_own on public.project_likes;
create policy project_likes_delete_own on public.project_likes
  for delete to authenticated
  using (user_id = (select auth.uid()));

/*
 * Счётчик двигает база, а не приложение: иначе лайк и инкремент это два запроса
 * из разных мест, и рано или поздно один из них не доедет.
 *
 * security definer обязателен и это не перестраховка: сам update прилетает от
 * authenticated, у которого право update на published_projects отобрано column-grant'ом
 * выше, и обычная триггерная функция здесь молча упала бы на правах.
 */
create or replace function public.bump_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.published_projects
       set likes_count = likes_count + 1
     where id = new.published_id;
    return new;
  end if;
  update public.published_projects
     set likes_count = greatest(likes_count - 1, 0)
   where id = old.published_id;
  return old;
end;
$$;

drop trigger if exists project_likes_count on public.project_likes;
create trigger project_likes_count
  after insert or delete on public.project_likes
  for each row execute function public.bump_like_count();
```

```sql
-- Покупки. Таблица заводится сразу, наполняется в фазе 2: от неё зависит правило
-- «копировать себе можно бесплатное или купленное», и вводить её потом означало бы
-- переписывать это правило в уже работающем действии.
create table if not exists public.project_purchases (
  id                 uuid primary key default gen_random_uuid(),
  published_id       uuid not null references public.published_projects (id) on delete cascade,
  buyer_id           uuid not null references auth.users (id) on delete cascade,
  -- Автор фиксируется на момент покупки: строка чека не должна зависеть от того,
  -- что произошло с публикацией потом.
  author_id          uuid not null references auth.users (id) on delete set null,
  price_cents        integer not null,
  currency           text    not null default 'usd',
  stripe_session_id  text    not null,
  status             text    not null default 'paid',
  created_at         timestamptz not null default now(),
  constraint purchases_price_range check (price_cents between 0 and 50000),
  constraint purchases_currency check (currency = 'usd'),
  constraint purchases_status_allowed check (status in ('paid', 'refunded'))
);

-- Идемпотентность вебхука: повторная доставка того же события не создаст второй чек.
create unique index if not exists purchases_session_idx
  on public.project_purchases (stripe_session_id);

-- Один человек покупает одну публикацию один раз.
create unique index if not exists purchases_buyer_published_idx
  on public.project_purchases (buyer_id, published_id);

alter table public.project_purchases enable row level security;

-- Покупатель видит свои чеки, автор видит продажи своих работ.
drop policy if exists purchases_select_buyer on public.project_purchases;
create policy purchases_select_buyer on public.project_purchases
  for select to authenticated
  using (buyer_id = (select auth.uid()));

drop policy if exists purchases_select_author on public.project_purchases;
create policy purchases_select_author on public.project_purchases
  for select to authenticated
  using (author_id = (select auth.uid()));

-- Политик записи нет сознательно: единственный писатель это вебхук под service-role.
```

### 2.2. Превью: SSR из `design jsonb`, без картинок и без Storage

Решение: карточка галереи это серверный компонент, который делает
`renderBoardSvg(compile(parseDesign(row.design)), { maxPx: 320 })` и вставляет строку через
`dangerouslySetInnerHTML`. `renderBoardSvg` уже чистая, без DOM, и её же результат уходит в PDF и PNG,
то есть превью в галерее гарантированно совпадает с тем, что человек получит в экспорте.

Почему не PNG в Storage: это отдельный bucket, отдельная политика, отдельная уборка мусора и
рассинхрон превью с документом при любой правке рендера. Ради галереи на десятки записей это не окупается.

Смягчение веса страницы (SVG это один `rect` на ячейку, дробный узор даёт тысячи узлов):

- 12 карточек на страницу, `maxPx: 320` для карточки и `maxPx: 720` для страницы проекта;
- `summary.cellCount` уже лежит в строке, поэтому решение о плейсхолдере принимается без компиляции:
  выше 2000 ячеек карточка рисует упрощённый превью-блок с габаритом и породами, а полный узор
  показывается только на странице проекта;
- страница галереи для анонима кэшируется (`export const revalidate = 60`), лайк и публикация зовут
  `revalidatePath('/gallery')`.

### 2.3. Пагинация и сортировка

Два порядка: `new` (по умолчанию) и `popular`. Пагинация offset-овая, `limit 12 offset n*12`, с
жёстким потолком в 10 страниц. Keyset честнее, но по `likes_count` он ломается при изменении значения
между страницами, а объём галереи в конкурсном проекте это десятки строк: сложность не окупается.
Индексы под оба порядка заданы выше и покрывают `order by` целиком.

Параметры приезжают из `searchParams` (`?sort=popular&page=2`), значения валидируются zod-ом на
сервере, ссылки обычные `<Link>`: галерея должна работать и индексироваться без JavaScript.

### 2.4. Действия

`app/actions/gallery.ts`, все с кодами ошибок, а не готовыми фразами (как в `app/actions/projects.ts`):

- `publishProjectAction(projectId, title, priceCents)`: читает свой проект под RLS, прогоняет
  `parseDesign` (в витрину не должно попасть то, что редактор не откроет), считает `summary`,
  вставляет строку. Лимит 20 публикаций на аккаунт, считается `head: true` под RLS: это защита от
  превращения галереи в свалку, а не монетизация.
- `updatePublishedAction(id, { title, priceCents, status })`: правит только те три колонки, на которые
  выдан grant. Попытка тронуть что-то ещё упадёт на правах, и это ровно то поведение, которое нужно.
- `unpublishAction(id)`: `delete`. Публикация уходит вместе с лайками (cascade); чеки покупок в фазе 2
  тоже уйдут cascade, и это осознанно: без выплат авторам история покупок ничего не гарантирует.
- `likeAction(id)` / `unlikeAction(id)`: insert и delete в `project_likes`, счётчик двигает триггер.
  Insert с `ignoreDuplicates`, чтобы двойной клик не давал ошибку в интерфейсе.
- `copyPublishedAction(id)`: копия в свои проекты. Разрешена, если `price_cents = 0` или в
  `project_purchases` есть строка `paid` для этой пары (в MVP второе всегда ложно). Проходит тот же
  `FREE_PROJECT_LIMIT`, что и `saveProjectAction`: копия из галереи это обычный проект в облаке, и
  обходить им лимит бесплатного тарифа нельзя. Увеличивает `saves_count` через `security definer`
  функцию `bump_save_count(p_id uuid)` (по той же причине, что и лайки: у клиента прав на счётчик нет).

### 2.5. Маршруты и доступ

- `/gallery` и `/gallery/[id]` добавляются в `PUBLIC_PREFIXES` в `lib/auth/access.ts`: галерея это
  единственная страница студии, которая обязана открываться анониму, иначе делиться ссылкой незачем.
- Действия (лайк, копия, публикация) требуют входа и отдают код `unauthenticated`, интерфейс поднимает
  уже существующую всплывающую форму входа.
- `app/sitemap.ts` получает `/gallery`.
- На корневом домене (`role === 'site'`) `/gallery` уводится на app-поддомен существующим правилом
  `proxy.ts`, менять его не нужно.

## 3. Пункт 5: sale-prep, кошелёк, видео

### 3.1. Карточка товара для Amazon и Etsy

Text-only генерация через тот же пайплайн, что уже стоит в `app/actions/promo.ts`: модель
`gemini-2.5-flash`, эндпойнт `GEMINI_VISION_URL` (он же обычный generateContent), `responseSchema` для
строгого JSON. Картинки на вход не идут вовсе, значит запрос дешёвый и быстрый.

Вход строится из реальных чисел проекта, а не из пожеланий: `describeBoard(design, model)` уже отдаёт
породы по доле, габарит в миллиметрах и дробность узора; к этому добавляются дюймовое представление
габарита (для Amazon и Etsy это обязательный формат) и вес пород списком.

Выход (zod-схема плюс `responseSchema` Gemini, оба в `lib/promo/listing.ts`):

| Поле | Ограничение | Зачем |
| --- | --- | --- |
| `title` | 1..140 символов | потолок Etsy, Amazon короче, режется в интерфейсе |
| `bullets` | ровно 5, каждый 1..200 | буллеты Amazon |
| `keywords` | 13 штук, каждое 1..20 символов | теги Etsy, там ровно 13 и ровно 20 |
| `description` | 1..2000 | описание карточки |
| `materials` | 1..5 строк | обязательное поле Etsy |
| `care` | 1..600 | уход за торцевой доской, продающий блок |

Гейт: `assertAiAllowed('saleListing', 1)`, новая фича добавляется в `AiFeature` и `AI_FEATURE_COST`
со стоимостью 1 (одно текстовое обращение). Никакой второй проверки Pro в действии быть не должно,
это правило уже записано в `lib/ai/entitlements.ts`. При провале модели квота возвращается
`releaseAiQuota`, как в промо-кадрах.

Демо-мок: `isAiDemoMode()` (ключа Gemini нет) отдаёт детерминированную карточку, собранную чистой
функцией `demoListing(description)` из реальных размеров и пород, без единого запроса наружу и без
списания квоты. Ровно как во вкладке «Промо»: закрывать замком демонстрацию, которая ничего не стоит,
смысла нет.

Интерфейс: блок во вкладке «Промо» плюс кнопка «Скопировать» на каждое поле по отдельности (человек
переносит их в разные поля чужой админки, одна общая кнопка тут бесполезна).

### 3.2. Кошелёк

```sql
-- Баланс. Одна строка на пользователя, у клиента только чтение.
create table if not exists public.wallets (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  balance_cents integer not null default 0,
  currency      text    not null default 'usd',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Уйти в минус нельзя даже по ошибке в коде: это последняя линия обороны
  -- под списанием, а не украшение.
  constraint wallets_balance_nonneg check (balance_cents >= 0),
  constraint wallets_currency check (currency = 'usd')
);

drop trigger if exists wallets_touch_updated_at on public.wallets;
create trigger wallets_touch_updated_at
  before update on public.wallets
  for each row execute function public.touch_updated_at();

alter table public.wallets enable row level security;

drop policy if exists wallets_select_own on public.wallets;
create policy wallets_select_own on public.wallets
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Политик записи нет: пишут только функции ниже под service-role.

-- Ledger. Баланс это кэш суммы этих строк, а не самостоятельная истина:
-- при любом расхождении правы транзакции.
create table if not exists public.wallet_transactions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  kind          text not null,
  -- Со знаком: пополнение положительное, списание отрицательное. Так сумма
  -- столбца по пользователю обязана сойтись с balance_cents, и это проверяемо одним запросом.
  amount_cents  integer not null,
  balance_after integer not null,
  -- Внешний ключ идемпотентности: id сессии Stripe для пополнения,
  -- id задания генерации для списания и возврата.
  ref           text not null,
  meta          jsonb,
  created_at    timestamptz not null default now(),
  constraint wallet_tx_kind_allowed check (kind in ('topup', 'spend', 'refund')),
  constraint wallet_tx_amount_sign check (
    (kind = 'topup'  and amount_cents > 0) or
    (kind = 'spend'  and amount_cents < 0) or
    (kind = 'refund' and amount_cents > 0)
  ),
  constraint wallet_tx_balance_nonneg check (balance_after >= 0),
  constraint wallet_tx_ref_len check (char_length(ref) between 1 and 255),
  constraint wallet_tx_meta_size check (meta is null or pg_column_size(meta) <= 4096)
);

-- Вся идемпотентность держится здесь. Повторная доставка вебхука, двойной клик
-- по кнопке генерации и ретрай возврата ловятся одним уникальным индексом.
create unique index if not exists wallet_tx_kind_ref_idx
  on public.wallet_transactions (kind, ref);

create index if not exists wallet_tx_user_idx
  on public.wallet_transactions (user_id, created_at desc);

alter table public.wallet_transactions enable row level security;

drop policy if exists wallet_tx_select_own on public.wallet_transactions;
create policy wallet_tx_select_own on public.wallet_transactions
  for select to authenticated
  using (user_id = (select auth.uid()));
-- Политик записи нет: см. выше.
```

Три функции, устроенные по образцу `consume_ai_quota`. Смысл тот же: проверка и изменение под одной
блокировкой строки, а не «прочитали, подумали, записали».

```sql
/*
 * Пополнение. Первым идёт insert в ledger: если ref уже был (Stripe переотправил
 * событие), конфликт срабатывает, баланс не двигается, функция возвращает текущий.
 * Порядок операций тут и есть вся идемпотентность.
 */
create or replace function public.wallet_topup(
  p_user_id uuid,
  p_amount  integer,
  p_ref     text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  insert into public.wallets as w (user_id, balance_cents)
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  -- Пометка идемпотентности ставится до движения денег.
  begin
    insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after, ref)
    values (p_user_id, 'topup', p_amount, 0, p_ref);
  exception when unique_violation then
    select balance_cents into v_balance from public.wallets where user_id = p_user_id;
    return v_balance;
  end;

  update public.wallets
     set balance_cents = balance_cents + p_amount
   where user_id = p_user_id
  returning balance_cents into v_balance;

  update public.wallet_transactions
     set balance_after = v_balance
   where kind = 'topup' and ref = p_ref;

  return v_balance;
end;
$$;

/*
 * Списание. Условие where balance_cents >= p_amount внутри update и есть весь смысл:
 * два параллельных запроса не могут оба увидеть 200 центов и оба уйти в генерацию.
 * Пустой returning значит «не хватило денег», и это не то же самое, что ошибка базы.
 */
create or replace function public.wallet_spend(
  p_user_id uuid,
  p_amount  integer,
  p_ref     text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  update public.wallets
     set balance_cents = balance_cents - p_amount
   where user_id = p_user_id and balance_cents >= p_amount
  returning balance_cents into v_balance;

  if v_balance is null then
    return null;
  end if;

  insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after, ref)
  values (p_user_id, 'spend', -p_amount, v_balance, p_ref)
  on conflict (kind, ref) do nothing;

  return v_balance;
end;
$$;

/*
 * Возврат. Зовётся, только когда ролик не вышел вовсе. Уникальный индекс
 * по (kind, ref) не даёт вернуть деньги дважды за одно задание.
 */
create or replace function public.wallet_refund(
  p_user_id uuid,
  p_amount  integer,
  p_ref     text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return null;
  end if;

  begin
    insert into public.wallet_transactions (user_id, kind, amount_cents, balance_after, ref)
    values (p_user_id, 'refund', p_amount, 0, p_ref);
  exception when unique_violation then
    select balance_cents into v_balance from public.wallets where user_id = p_user_id;
    return v_balance;
  end;

  update public.wallets
     set balance_cents = balance_cents + p_amount
   where user_id = p_user_id
  returning balance_cents into v_balance;

  update public.wallet_transactions
     set balance_after = v_balance
   where kind = 'refund' and ref = p_ref;

  return v_balance;
end;
$$;

-- Как и у квоты AI: вызов этих функций из браузера означал бы бесконечный баланс.
revoke all on function public.wallet_topup(uuid, integer, text)  from public, anon, authenticated;
revoke all on function public.wallet_spend(uuid, integer, text)  from public, anon, authenticated;
revoke all on function public.wallet_refund(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.wallet_topup(uuid, integer, text)  to service_role;
grant execute on function public.wallet_spend(uuid, integer, text)  to service_role;
grant execute on function public.wallet_refund(uuid, integer, text) to service_role;

-- Функция для галереи (пункт 6): счётчик копий, тот же довод про права.
create or replace function public.bump_save_count(p_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.published_projects
     set saves_count = saves_count + 1
   where id = p_id
  returning saves_count into v_count;
  return v_count;
end;
$$;

revoke all on function public.bump_save_count(uuid) from public, anon;
grant execute on function public.bump_save_count(uuid) to authenticated, service_role;
```

### 3.3. Пополнение через вебхук: да, расширяем существующий роут

Отдельный роут завёл бы второй секрет вебхука, вторую точку в панели Stripe и второй набор проверки
подписи. Событие приходит на тот же эндпойнт, проверка подписи уже написана и покрыта тестами,
поэтому расширяется разбор, а не транспорт.

`lib/stripe/oneTime.ts` (чистый, без сети, тестируется напрямую как `events.ts`):

```
parseOneTimeEvent(raw): OneTimePayment | null
  type === 'checkout.session.completed'
  mode === 'payment'
  payment_status === 'paid'
  metadata.supabase_user_id непустой
  metadata.kind in ('wallet_topup', 'gallery_purchase')
  amount_total число, currency === 'usd'
  -> { kind, userId, sessionId, amountCents, currency, eventAt, publishedId? }
```

В роуте новая ветка идёт первой и не трогает существующую:

- `kind === 'wallet_topup'`: `rpc('wallet_topup', { p_ref: sessionId })`. Ошибка базы это 500 и ретрай
  Stripe, успех это 200. Никакой проверки `last_event_at` тут нет и не нужно.
- `kind === 'gallery_purchase'`: в MVP пишет предупреждение в лог и отвечает 200. Ветка существует,
  чтобы в фазе 2 добавить туда insert в `project_purchases` и ничего больше не трогать.
- `parseOneTimeEvent` вернул null: дальше всё как сейчас, `parseSubscriptionEvent`.

Пополнение только пресетами: 5, 10 и 25 долларов, `price` заранее заведён в Stripe. Произвольная сумма
означала бы приём числа с клиента, его валидацию и `price_data` в теле сессии, то есть новую
поверхность для ошибки ради удобства, которого в MVP никто не просил.

### 3.4. Видео: цена, гейт и мок

- `lib/video/pricing.ts`: `videoCostCents(seconds) = ceil(seconds / 5) * 200`. Чистая функция,
  разрешённые длительности 5 и 10 секунд, всё остальное отсекается zod-ом на сервере.
- Гейт видео это баланс, а не Pro. Довод: за ролик уже уплачено живыми деньгами, требовать сверху
  подписку значит брать двойную плату за одно действие. Требуется только вход в аккаунт (без него нет
  кошелька) и положительный баланс.
- Порядок ровно как у квоты AI: `wallet_spend` до обращения к модели (иначе десяток параллельных
  запросов увидят один и тот же баланс), потом вызов, и `wallet_refund` при полном провале.
  `ref` это `crypto.randomUUID()` задания, он же ключ идемпотентности обоих движений.
- Ключа fal.ai нет, поэтому `isVideoDemoMode()` (по образцу `isAiDemoMode()`) отдаёт заглушку:
  карточку с параметрами задания и подписью «демо-режим», кошелёк при этом не трогается вовсе.
  Живой вызов включается появлением `FAL_API_KEY`, и это единственное изменение.
- `lib/video/fal.ts` пишется сразу, но за гвардом `isFalConfigured()`: контракт запроса и разбор
  ответа фиксируются, чтобы включение ключа не потребовало проектирования заново.

## 4. Файловый план

Миграции (две, а не одна: галерея и кошелёк независимы и могут накатываться порознь):

- `supabase/migrations/20260813100000_gallery.sql` - `published_projects`, `project_likes`,
  `project_purchases`, триггер `bump_like_count`, функция `bump_save_count`, индексы, RLS, column-grant.
- `supabase/migrations/20260813110000_wallet.sql` - `wallets`, `wallet_transactions`,
  `wallet_topup`, `wallet_spend`, `wallet_refund`, индексы, RLS, гранты.

Чистая логика (unit-тесты без единого мока):

- `lib/gallery/types.ts` - `GalleryCard`, `GallerySort`, `GalleryError`, константы страницы.
- `lib/gallery/summary.ts` - `buildSummary(design, model)`, `parseSummary(raw)`.
- `lib/gallery/price.ts` - `PRICE_MAX_CENTS`, `parsePriceInput`, `formatPrice(cents, locale)`.
- `lib/gallery/query.ts` - `parseGalleryParams(searchParams)`, расчёт offset и потолка страниц.
- `lib/promo/listing.ts` - промпт, `LISTING_RESPONSE_SCHEMA`, zod-схема, `parseListing`, `demoListing`.
- `lib/video/pricing.ts` - `videoCostCents`, разрешённые длительности.
- `lib/wallet/format.ts` - `formatCents(cents, locale)`, пресеты пополнения.
- `lib/stripe/oneTime.ts` - `parseOneTimeEvent`, типы разового платежа.

Сервер:

- `app/actions/gallery.ts` - публикация, правка, снятие, лайк, копия.
- `app/actions/wallet.ts` - `createTopUpCheckoutAction(preset)`, `readWalletAction`.
- `app/actions/listing.ts` - `generateListingAction` (отдельно от `promo.ts`: тот уже 19 КБ).
- `app/actions/video.ts` - `generateVideoAction` (мок плюс списание).
- `lib/wallet/server.ts` - чтение баланса и последних транзакций, `import 'server-only'`.
- `lib/video/fal.ts` - клиент fal.ai за гвардом, `import 'server-only'`.

Правки существующих файлов:

- `app/api/stripe/webhook/route.ts` - ветка разового платежа перед разбором подписки.
- `lib/ai/quota.ts` - `'saleListing'` в `AiFeature` и `AI_FEATURE_COST`.
- `lib/auth/access.ts` - `/gallery` в `PUBLIC_PREFIXES`.
- `app/sitemap.ts` - `/gallery`.
- `lib/supabase/types.ts` - строки новых таблиц.
- `lib/i18n/ru.ts` и `lib/i18n/en.ts` - ключи галереи, кошелька, карточки товара, видео.

Страницы и компоненты:

- `app/gallery/page.tsx` (SSR, `revalidate = 60`), `app/gallery/[id]/page.tsx`.
- `components/gallery/GalleryCard.tsx` (server, inline SVG), `GalleryGrid.tsx`,
  `GalleryPager.tsx`, `LikeButton.tsx` (client), `PublishDialog.tsx` (client),
  `CopyToMyProjects.tsx` (client), `PriceBadge.tsx`.
- `components/promo/ListingPanel.tsx` плюс `CopyField.tsx`.
- `components/wallet/WalletPanel.tsx`, `TopUpButtons.tsx`, `TransactionList.tsx`.
- `components/promo/VideoPanel.tsx`.

## 5. Тест-план

Unit (vitest, без моков) - обязательны до любого интерфейса:

- `summary.test.ts`: сводка совпадает с `compile` на фикстуре `baseDesign`, битый design отбивается.
- `price.test.ts`: ноль, потолок, отрицательное, дробное, строка с запятой, форматирование ru и en.
- `query.test.ts`: дефолт `new`, чужой `sort`, страница 0, страница выше потолка, отрицательная.
- `listing.test.ts`: `parseListing` на валидном и на урезанном ответе модели, ровно 13 тегов, тег
  длиннее 20 символов отбивается, `demoListing` детерминирован и упоминает реальный габарит и породы.
- `pricing.test.ts`: 5 секунд = 200 центов, 10 = 400, 0 и 7 отбиваются.
- `oneTime.test.ts`: валидное событие пополнения; `mode=subscription` -> null (чтобы подписки не
  утекли в кошелёк); `payment_status=unpaid` -> null; чужой `kind` -> null; отсутствие
  `supabase_user_id` -> null; чужая валюта -> null.

Действия (по образцу `app/actions/promo.test.ts`, с моками Supabase и fetch):

- публикация: аноним получает `unauthenticated`, чужой проект `notFound`, 21-я публикация `limit`;
- лайк дважды подряд не даёт ошибки и не удваивает счётчик;
- копия платного без покупки отбивается, копия бесплатного при исчерпанном `FREE_PROJECT_LIMIT` даёт
  `limit`;
- sale-prep: без Pro `notPro`, при исчерпанной квоте `quota`, в демо-режиме карточка без списания,
  падение Gemini возвращает квоту (проверить вызов `release_ai_quota`);
- видео: при нехватке баланса `insufficient` и `wallet_spend` не зовётся дважды, при провале
  генерации зовётся `wallet_refund` с тем же `ref`.

Вебхук (`app/api/stripe/webhook/route.test.ts`, расширение существующего файла):

- пополнение с валидной подписью зовёт `wallet_topup` с `p_ref = session.id`;
- повторная доставка того же события зовёт функцию повторно и получает тот же баланс (идемпотентность
  проверяется на уровне SQL, тест фиксирует, что роут отвечает 200, а не 500);
- событие подписки после появления новой ветки обрабатывается ровно как раньше (регрессия);
- `gallery_purchase` отвечает 200 и ничего не пишет.

SQL-инварианты (через Supabase MCP на ветке или на проде под service-ключом, зафиксировать в PR):

- `authenticated` не может изменить `design` и `likes_count` (ожидается ошибка прав);
- `anon` читает `published_projects` со статусом `public` и не читает `removed`;
- `anon` и `authenticated` не могут выполнить `wallet_topup` (ошибка прав);
- параллельные `wallet_spend` на балансе 200 центов: ровно один успех;
- сумма `amount_cents` по пользователю равна `balance_cents`.

Playwright e2e:

- галерея открывается анонимом на `/gallery`, карточки видны, превью отрисовано (проверять наличие
  `svg` внутри карточки), переход на страницу проекта работает;
- вошедший публикует проект, видит его первым в `new`, ставит лайк, счётчик растёт после перезагрузки;
- второй аккаунт копирует бесплатный проект и находит его в своих проектах;
- у платного проекта кнопка покупки задизейблена и подписана «скоро»;
- sale-prep в демо-режиме отдаёт карточку и кнопка «Скопировать» кладёт текст в буфер;
- пополнение кошелька тестовой картой `4242 4242 4242 4242` в тестовом ключе Stripe: баланс вырос
  после возврата с Checkout (единственный тест, требующий живого Stripe, гоняется вручную один раз).

## 6. Порядок работ

1. Миграция кошелька плюс `lib/stripe/oneTime.ts` плюс ветка вебхука. Это фундамент: от него зависит
   и видео, и покупка проекта в фазе 2. Проверяется тестовой картой сразу.
2. Sale-prep: чистый `listing.ts` с тестами, действие, панель. Работает без ключей в демо-режиме.
3. Видео: цена, панель, списание и возврат на моке.
4. Миграция галереи, действия, страницы, компоненты.
5. Прогон Playwright, ручная проверка на проде.

Пункты 2 и 4 независимы и могут идти параллельно разными агентами. Пункт 3 зависит от 1.

## 7. Отложено на финальный этап

Осознанно не входит в MVP. Каждый пункт либо требует юридической части, либо ключей, которых нет,
либо не влияет на демонстрацию продукта.

- **Выплаты авторам.** Stripe Connect, аккаунты продавцов, налоги, отчётность. Без этого платная
  публикация остаётся витриной цены, и именно поэтому покупка выключена, а не сделана наполовину.
- **Реальная покупка проекта.** Схема, ветка вебхука и правило доступа к копии готовы, включается
  одним action плюс одним обработчиком. Кнопка в MVP подписана «скоро».
- **Модерация, жалобы, блокировка авторов.** Есть только рубильник `status = 'removed'`, который
  ставится руками из панели Supabase.
- **Возврат денег и вывод остатка кошелька.** `refund` в ledger заведён для внутреннего возврата за
  упавшую генерацию, а не для возврата на карту.
- **Живой fal.ai.** Контракт клиента написан, включается появлением `FAL_API_KEY`.
- **Произвольная сумма пополнения** (в MVP три пресета).
- **OG-картинки карточек галереи** через `ImageResponse`: красиво в соцсетях, ничего не добавляет к
  работе продукта.
- **Keyset-пагинация, поиск и фильтры** по породам, габариту и сложности. Offset и две сортировки
  закрывают галерею объёмом в сотни записей.
- **Комментарии, подписки на авторов, лента подписок, счётчик просмотров.**
- **Дерево ремиксов** (кто из кого скопировал): поле `source_project_id` есть, публичной механики нет.
- **Мультивалютность.** Поля `currency` заведены и зафиксированы на `usd`.
- **История покупок как отдельная страница.** В MVP чеки читаются только запросом в базу.
