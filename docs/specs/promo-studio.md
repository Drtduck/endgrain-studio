# Промо-студия: спека переработки вкладки «Промо»

Статус: черновик к реализации. Автор: архитектурный проход 14.08.2026.
Целевой исполнитель: агент-кодер. Всё, что ниже, писать по этому документу, не додумывая.

Содержание: [0 дефекты](#0-зачем-это-вообще-и-что-сломано-сегодня) · [1 user stories](#1-user-stories) · [2 модель данных и SQL](#2-модель-данных) · [3 текущий проект](#3-текущий-проект-на-клиенте) · [4 экономика](#4-экономика) · [5 прогресс](#5-прогресс-и-честный-фронт) · [6 редактор промта](#6-редактор-промта) · [7 паки под маркетплейсы](#7-паки-под-маркетплейсы) · [8 SEO-описание](#8-seo-описание-под-площадку) · [9 мерч](#9-мерч-что-чинить) · [10 этапы](#10-этапы-работ) · [11 тесты](#11-тесты) · [12 что нужно от владельца](#12-что-нужно-от-владельца-руками)

---

## 0. Зачем это вообще и что сломано сегодня

Вкладка «Промо» сейчас устроена так, что человек тратит деньги и получает исчезающий результат. Это не список пожеланий, это перечень подтверждённых дефектов из аудита кода:

| # | Дефект | Где | Последствие |
|---|--------|-----|-------------|
| D1 | Результат генерации живёт в `useState` компонента, который размонтируется при уходе с вкладки | `components/promo/PhotoSeries.tsx:27`, `components/StudioShell.tsx:68` | Ушёл в «Редактор» - оплаченные кадры исчезли навсегда |
| D2 | Никакого persistence: ни таблицы, ни bucket. Кадр это base64 data-URL в памяти | `lib/ai/providers/fal.ts:40-52`, `app/actions/promo.ts:61` | Перезагрузка страницы стирает всё |
| D3 | `setResult(null)` в начале новой генерации | `PhotoSeries.tsx:62` | Новая серия стирает прошлую, даже если новая упадёт |
| D4 | Скачать можно только по одному кадру ссылкой `<a download>` | `PhotoSeries.tsx:188` | 12 кадров это 12 кликов и 12 файлов с мусорными именами |
| D5 | Частичный успех оплачивается целиком: `releaseAiQuota` зовётся только если не вышло НИ ОДНОГО кадра | `app/actions/promo.ts:97` | Вышло 3 из 12 - списано 12 |
| D6 | `maxDuration = 60`, таймаут кадра 30 с, 12 кадров через `Promise.all` | `app/page.tsx:14`, `lib/ai/providers/fal.ts:24` | Платформа обрывает ответ, квота уже зарезервирована и не вернётся |
| D7 | Прогресса нет: один boolean `busy` | `PhotoSeries.tsx:26` | Пустой экран на минуту, непонятно живо ли |
| D8 | Отмены нет, повтора упавшего кадра нет | там же | Единственный выход - ждать и надеяться |
| D9 | Промпты зашиты, схема принимает только `kinds` + `description` | `lib/promo/prompts.ts:12`, `lib/promo/schema.ts:27` | Ни поправить кадр, ни задать свою сцену |
| D10 | Мерч: сервер вернул `{denied:'notPro'}`, UI показывает `merch.idle` | `components/promo/MerchMockups.tsx:100-109`, `:175` | Кнопка нажата, ничего не произошло, объяснения нет |
| D11 | Кнопка мерча активна в trial-состоянии, хотя `merchMockups` не в `AI_TRIAL_FEATURES` | `AiGate.tsx:50-52`, `lib/ai/quota.ts:55` | Гарантированный тупик для trial-пользователя |
| D12 | `saveProjectAction` всегда INSERT | `app/actions/projects.ts:43` | Каждое «Сохранить» плодит дубль |
| D13 | В сторе нет понятия «текущий проект», `projectId` нигде | `lib/store/studio.ts` | Промо-панель не знает, к чему привязывать ассеты |
| D14 | Кошелёк реализован полностью, но 0 строк в проде и тратит его только видео-заглушка | `supabase/migrations/20260813110000_wallet.sql`, `app/actions/video.ts:72`, `lib/video/fal.ts:41` | Готовый механизм оплаты простаивает |

Итог: **промо-вкладка сегодня не является продуктом. Она является способом потерять деньги.**

Что строим взамен: промо-студия, где каждый сгенерированный кадр это строка в базе и объект в Storage, привязанные к проекту; где цена видна до нажатия; где прогресс идёт по кадрам; где готовое качается паком под конкретный маркетплейс.

---

## 1. User stories

### 1.1 Основная: столяр продаёт доску на Ozon

**Действующее лицо.** Михаил, столяр из Твери. Сделал 6 досок «шахматка орех/клён» на продажу. Умеет фотографировать плохо, лайтбокса нет, продавать надо сейчас.

1. **Заходит.** Открывает Endgrain App, собирает узор в «Редакторе». Документ живёт в localStorage, аккаунта пока нет.
2. **Логинится.** Хочет сохранить. Жмёт «Сохранить проект» - предложение войти. Входит через Google. Документ уезжает в `projects`, в сторе появляется `projectId`. В шапке студии появляется плашка «Проект: Шахматка орех-клён · сохранён 2 минуты назад».
3. **Идёт в «Промо».** Первое, что видит вверху панели, - **строка контекста проекта**: селектор проекта (текущий выбран), баланс кадров, ссылка «открыть проект». Не список пресетов, не кнопка генерации. Сначала «где я и чем плачу».
4. **Видит счётчик.** «Осталось кадров: 30 бесплатных до 1 сентября · баланс $0.00». Один счётчик, не два. Под кнопкой генерации - «Спишется 6 кадров из 30 бесплатных». Никаких «единиц квоты».
5. **Выбирает площадку.** Селектор «Куда продаём»: Ozon. Интерфейс русский, поэтому в списке есть Ozon, Wildberries, Яндекс.Маркет, плюс Amazon/eBay/Mercado Libre. Выбор площадки меняет две вещи: (а) целевой аспект кадров, (б) шаблон SEO-текста ниже.
6. **Выбирает кадры.** Отмечает 6 пресетов из 12. Счётчик под чипами обновляется мгновенно.
7. **Жмёт «Сгенерировать».** До ухода запроса:
   - проект автосохраняется (create-or-update, без дубля);
   - создаётся `promo_series` со статусом `queued` и 6 строк `promo_shots` со статусом `queued`;
   - панель немедленно рисует 6 карточек-скелетонов с подписями пресетов.
8. **Смотрит прогресс.** Кадры доезжают по одному: скелетон -> картинка. Под ними «Готово 3 из 6». Один кадр упал - на его месте карточка с текстом «Не вышло» и кнопкой «Повторить» (бесплатно, за наш счёт: возврат уже произошёл). Есть кнопка «Отменить» - она отменяет ещё не начатые кадры и возвращает за них деньги.
9. **Правит кадр.** Кадр «На кухне» получился с лишней миской. Жмёт «Изменить кадр», пишет по-русски: «убери миску с лимонами, сделай фон светлее». Появляется **новый кадр рядом**, старый остаётся. Оба в галерее, под ними «вариант 1 / вариант 2», можно выбрать любой или оба.
10. **Отбирает.** Чекбоксами отмечает 5 кадров. Есть «Выбрать все».
11. **Качает пак.** Жмёт «Скачать пак для Ozon». Браузер уходит на `/api/promo/pack/[seriesId]?...`, приходит zip: 5 файлов, каждый уже перекадрирован в требования Ozon, имена вида `01-hero-1200x1600.jpg`.
12. **Берёт текст.** Ниже блок «Описание товара». Площадка уже Ozon, поэтому лимит заголовка и структура полей ozon-овские. Жмёт «Сгенерировать текст» - получает заголовок, описание, буллеты, теги. Правит руками. Жмёт «Сохранить» - текст уезжает в `promo_listings`, привязанный к проекту и площадке.
13. **Возвращается через два дня.** Открывает приложение, выбирает проект «Шахматка орех-клён», идёт в «Промо». **Все кадры на месте**, все варианты на месте, текст на месте. Ничего не пропало.
14. **Делает второй пак.** Для той же доски хочет Amazon. Меняет площадку на Amazon, отмечает те же кадры, жмёт «Скачать пак для Amazon». Новой генерации не происходит: **кроп это чистая операция над уже оплаченными кадрами, она бесплатна**. Приходит zip с квадратами 2000x2000 на белом.

**Точка провала, которой быть не должно ни в одной ветке:** человек не должен потерять кадр, за который заплатил. Ни при уходе с вкладки, ни при перезагрузке, ни при таймауте платформы, ни при падении провайдера.

### 1.2 Отдельная: мерч

**Действующее лицо.** Та же доска, но Михаил хочет футболку с узором для своего инстаграма.

1. В «Промо» есть блок «Мерч». Он **всегда** показывает локальные силуэты с наложенным узором - это компоновка, а не пустое место. Так работает и сегодня, это правильно, не ломать.
2. Ключей Printful у владельца нет. Значит блок показывает честную плашку: «Настоящие мокапы на реальных товарах включатся, когда владелец подключит Printful. Пока показываем компоновку - её можно скачать и использовать как есть». Кнопка «Собрать мокапы» при этом **скрыта, а не активна и молчалива** (это лечение D10).
3. Ключи есть, но Михаил не Pro. Кнопка видна, но заблокирована, под ней замок с текстом «Мокапы мерча входят в Pro» и ссылкой на тарифы. Не тишина (D10), не активная кнопка (D11).
4. Ключи есть, Михаил Pro. Отмечает «Футболка» и «Кружка», жмёт «Собрать мокапы». Печёт 20-40 секунд, приходят настоящие мокапы с CDN Printful.
5. **Мокапы тоже сохраняются.** Сегодня они живут в `useState` и умирают, а URL Printful протухает. Значит: мокап скачивается на сервере и кладётся в наш bucket строкой `promo_shots` с `kind_slug = 'merch:tshirt'`. Он попадает в общую галерею и в общий zip.
6. Квоту мерч не тратит и не должен: у Printful генерация бесплатна. Это уже так (`AI_FEATURE_COST.merchMockups = 0`), не менять.

---

## 2. Модель данных

### 2.1 Обзор сущностей

```
projects (есть)
   └── promo_series          (одно нажатие «Сгенерировать»)
         └── promo_shots     (один кадр; вариант-правка это тоже кадр с parent_shot_id)
projects
   └── promo_listings        (SEO-текст, уникален по (project_id, marketplace))
```

Осознанные решения:

- **Вариант-правка это не отдельная таблица.** Это строка `promo_shots` с заполненным `parent_shot_id`. Иначе пришлось бы дублировать всю логику хранения, статусов, кропа и выгрузки ради того же самого объекта. Дерево вариантов плоское: правка правки тоже указывает на корневой кадр (`parent_shot_id` всегда указывает на корень серии-кадра, не на непосредственного родителя) - так галерея группирует варианты одним `where parent_shot_id = X or id = X` без рекурсии.
- **Площадка и аспект не хранятся у кадра.** Кадр генерируется в 1:1 (nano banana 2 отдаёт `aspect_ratio: '1:1'`) и кропается под площадку на лету при выгрузке. Хранить 6 копий одного кадра под 6 площадок это шестикратный счёт за Storage ради операции, которая занимает 200 мс в sharp. Площадка живёт в `promo_listings` и в параметрах запроса выгрузки.
- **Байты в Storage, метаданные в Postgres.** В таблице только путь к объекту, никаких base64 (это `projects_design_size`-грабли ещё раз).
- **Bucket приватный** с RLS по первому сегменту пути (`user_id`), ровно как `avatars` в `20260814170000_profile_avatars.sql`. Отдача идёт через signed URL на 1 час. Это отличается от `promo-mockups`, который публичный намеренно (туда ходит Printful своим GET), и это разные bucket'ы с разными задачами - не объединять.

### 2.2 SQL миграции

Файл: `supabase/migrations/20260815100000_promo_assets.sql`

```sql
-- Промо-студия: сгенерированные ассеты живут в базе и в Storage, а не в useState.
--
-- Три таблицы и один приватный bucket. Смысл каждой:
--   promo_series   - одно нажатие «Сгенерировать»: что просили, сколько списали, чем кончилось.
--   promo_shots    - один кадр. Вариант-правка это тоже кадр, со ссылкой на корневой.
--   promo_listings - SEO-текст карточки под конкретную площадку.
--
-- Байты в bucket promo-assets, здесь только пути: base64 в jsonb это тот же
-- дефект, от которого лечит эта миграция.

-- 1. Серия --------------------------------------------------------------------

create table if not exists public.promo_series (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- Серия без проекта невозможна: автосохранение перед платной генерацией
  -- обязательно, и это его контрактное следствие. on delete cascade намеренно:
  -- удалил проект - унёс и его промо-материалы, иначе получится сиротский счёт за Storage.
  project_id    uuid not null references public.projects (id) on delete cascade,
  -- Что за серия: пресеты, референс, правка одного кадра, мерч.
  source        text not null,
  status        text not null default 'queued',
  -- Сколько кадров заказано и сколько реально вышло. Расхождение это основание для возврата.
  requested     integer not null,
  succeeded     integer not null default 0,
  failed        integer not null default 0,
  -- Экономика этой серии. Оба поля заполняются в момент резерва, до похода в модель.
  quota_units   integer not null default 0,
  spent_cents   integer not null default 0,
  refunded_cents integer not null default 0,
  -- Ключ идемпотентности кошелька: тот же, что уходит в wallet_spend(p_ref).
  -- Приходит с клиента, генерируется один раз на клик (приём из app/actions/video.ts).
  wallet_ref    uuid not null,
  -- Слепок доски, по которому рисовали: описание и путь к рендеру. Нужен для
  -- «Изменить кадр» через сутки, когда документ в редакторе уже другой.
  board_desc    text,
  board_png_path text,
  -- Свободный промпт от пользователя, если он правил текст сцены. Валидируется
  -- на сервере и склеивается с нашим каркасом, но хранится как есть - для повтора.
  user_prompt   text,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz,
  constraint promo_series_source_allowed check (source in ('presets', 'reference', 'edit', 'merch')),
  constraint promo_series_status_allowed check (status in ('queued', 'running', 'done', 'partial', 'failed', 'cancelled')),
  constraint promo_series_requested_range check (requested between 1 and 24),
  constraint promo_series_counts_nonneg check (succeeded >= 0 and failed >= 0),
  constraint promo_series_money_nonneg check (spent_cents >= 0 and refunded_cents >= 0 and refunded_cents <= spent_cents),
  constraint promo_series_prompt_len check (user_prompt is null or char_length(user_prompt) <= 2000),
  constraint promo_series_desc_len check (board_desc is null or char_length(board_desc) <= 4000),
  constraint promo_series_error_len check (error is null or char_length(error) <= 200)
);

comment on table public.promo_series is 'Одно нажатие «Сгенерировать» в промо-студии: заказ, экономика, исход';
comment on column public.promo_series.wallet_ref is 'Ключ идемпотентности для wallet_spend/wallet_refund, один на всю попытку';

create index if not exists promo_series_project_idx
  on public.promo_series (project_id, created_at desc);
create index if not exists promo_series_user_idx
  on public.promo_series (user_id, created_at desc);
-- Двойной клик по кнопке не должен создать две серии: ref уникален глобально.
create unique index if not exists promo_series_wallet_ref_idx
  on public.promo_series (wallet_ref);
-- Опрос статуса идёт по «моим незакрытым сериям»: частичный индекс дешевле полного.
create index if not exists promo_series_active_idx
  on public.promo_series (user_id, updated_at desc)
  where status in ('queued', 'running');

drop trigger if exists promo_series_touch_updated_at on public.promo_series;
create trigger promo_series_touch_updated_at
  before update on public.promo_series
  for each row execute function public.touch_updated_at();

alter table public.promo_series enable row level security;

-- Читать свои серии может владелец. Пишет только сервер под service-role:
-- статусы и деньги клиент менять не имеет права ни при каких условиях.
drop policy if exists promo_series_select_own on public.promo_series;
create policy promo_series_select_own on public.promo_series
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Удалять свои серии можно: это уборка, деньги она не двигает.
drop policy if exists promo_series_delete_own on public.promo_series;
create policy promo_series_delete_own on public.promo_series
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 2. Кадр ---------------------------------------------------------------------

create table if not exists public.promo_shots (
  id            uuid primary key default gen_random_uuid(),
  series_id     uuid not null references public.promo_series (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  -- Пресет ('hero', 'macroOil', ...) либо 'custom' либо 'merch:tshirt'.
  -- Текстом, а не enum: набор пресетов растёт, а миграция ради нового кадра это дорого.
  kind_slug     text not null,
  -- Порядковый номер в серии: определяет порядок в галерее и префикс имени файла в zip.
  ordinal       integer not null,
  status        text not null default 'queued',
  -- Корневой кадр, если это вариант-правка. Всегда указывает на КОРЕНЬ, не на
  -- непосредственного родителя: так все варианты собираются одним запросом без рекурсии.
  parent_shot_id uuid references public.promo_shots (id) on delete cascade,
  -- Номер варианта внутри группы: 1 у оригинала, дальше по порядку правок.
  variant_no    integer not null default 1,
  -- Что именно попросили изменить. Для оригинала null.
  edit_prompt   text,
  -- Путь в bucket promo-assets. null пока кадр не готов.
  storage_path  text,
  width         integer,
  height        integer,
  bytes         integer,
  mime          text not null default 'image/png',
  -- Кто нарисовал: 'fal' | 'gemini' | 'printful' | 'mock'. Подпись под кадром честная.
  provider      text,
  -- Итоговый промпт целиком, ровно тот, что ушёл в модель. Нужен и для «повторить»,
  -- и для показа человеку в редакторе промта.
  prompt        text,
  error         text,
  -- Сколько раз кадр перезапускали кнопкой «Повторить». Потолок нужен, чтобы
  -- сцена, которую модель принципиально не рисует, не превратилась в бесконечный
  -- насос по кошельку человека, который жмёт кнопку в надежде.
  retries       integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint promo_shots_retries_max check (retries between 0 and 3),
  constraint promo_shots_status_allowed check (status in ('queued', 'running', 'done', 'failed', 'blocked', 'cancelled')),
  constraint promo_shots_kind_len check (char_length(kind_slug) between 1 and 64),
  constraint promo_shots_ordinal_range check (ordinal between 0 and 63),
  constraint promo_shots_variant_range check (variant_no between 1 and 32),
  constraint promo_shots_mime_allowed check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  constraint promo_shots_provider_allowed check (provider is null or provider in ('fal', 'gemini', 'printful', 'mock')),
  constraint promo_shots_prompt_len check (prompt is null or char_length(prompt) <= 8000),
  constraint promo_shots_edit_len check (edit_prompt is null or char_length(edit_prompt) <= 1000),
  constraint promo_shots_error_len check (error is null or char_length(error) <= 200),
  -- Готовый кадр обязан иметь файл. Это ловит ровно тот дефект, ради которого
  -- всё затевалось: «status done, а картинки нет».
  constraint promo_shots_done_has_file check (status <> 'done' or storage_path is not null),
  -- Вариант не может быть сам себе корнем.
  constraint promo_shots_parent_not_self check (parent_shot_id is null or parent_shot_id <> id)
);

comment on table public.promo_shots is 'Один сгенерированный кадр. Вариант-правка это тоже кадр, со ссылкой parent_shot_id на корневой';
comment on column public.promo_shots.parent_shot_id is 'Всегда корень группы вариантов, не непосредственный родитель: галерея собирает группу без рекурсии';

create index if not exists promo_shots_series_idx
  on public.promo_shots (series_id, ordinal, variant_no);
create index if not exists promo_shots_project_idx
  on public.promo_shots (project_id, created_at desc);
create index if not exists promo_shots_parent_idx
  on public.promo_shots (parent_shot_id) where parent_shot_id is not null;

drop trigger if exists promo_shots_touch_updated_at on public.promo_shots;
create trigger promo_shots_touch_updated_at
  before update on public.promo_shots
  for each row execute function public.touch_updated_at();

alter table public.promo_shots enable row level security;

drop policy if exists promo_shots_select_own on public.promo_shots;
create policy promo_shots_select_own on public.promo_shots
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists promo_shots_delete_own on public.promo_shots;
create policy promo_shots_delete_own on public.promo_shots
  for delete to authenticated
  using (user_id = (select auth.uid()));
-- Политик insert/update нет: пишет только server action под service-role.

-- 3. Карточка товара ----------------------------------------------------------

create table if not exists public.promo_listings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  project_id    uuid not null references public.projects (id) on delete cascade,
  marketplace   text not null,
  locale        text not null default 'en',
  title         text not null default '',
  description   text not null default '',
  -- Буллеты и теги массивами текста, а не jsonb: они плоские, и так их
  -- проверяет constraint по длине каждого элемента, а не по весу всего блоба.
  bullets       text[] not null default '{}',
  tags          text[] not null default '{}',
  -- Отмеченные кадры для выгрузки в пак под эту площадку: сохраняем выбор,
  -- чтобы «Скачать пак» через два дня дал тот же набор.
  selected_shot_ids uuid[] not null default '{}',
  -- Правил ли человек текст руками. Если да, повторная генерация спрашивает подтверждение.
  edited_by_user boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint promo_listings_marketplace_allowed check (
    marketplace in ('amazon', 'ebay', 'etsy', 'wildberries', 'mercadolibre', 'ozon', 'yandexmarket')
  ),
  constraint promo_listings_locale_allowed check (locale in ('ru', 'en')),
  constraint promo_listings_title_len check (char_length(title) <= 500),
  constraint promo_listings_description_len check (char_length(description) <= 20000),
  constraint promo_listings_bullets_size check (array_length(bullets, 1) is null or array_length(bullets, 1) <= 20),
  constraint promo_listings_tags_size check (array_length(tags, 1) is null or array_length(tags, 1) <= 60),
  constraint promo_listings_selected_size check (array_length(selected_shot_ids, 1) is null or array_length(selected_shot_ids, 1) <= 64)
);

comment on table public.promo_listings is 'SEO-текст карточки товара под конкретную площадку. Одна строка на пару (проект, площадка)';

-- Одна карточка на пару (проект, площадка): вторая генерация переписывает первую,
-- а не плодит дубли (это ровно тот дефект, что у saveProjectAction).
create unique index if not exists promo_listings_project_marketplace_idx
  on public.promo_listings (project_id, marketplace);

drop trigger if exists promo_listings_touch_updated_at on public.promo_listings;
create trigger promo_listings_touch_updated_at
  before update on public.promo_listings
  for each row execute function public.touch_updated_at();

alter table public.promo_listings enable row level security;

-- Карточку человек правит руками прямо в форме, поэтому здесь, в отличие от
-- кадров, политики записи есть: деньги эта таблица не двигает, а гонять каждое
-- нажатие в клавиатуру через service-role было бы лишним кругом.
drop policy if exists promo_listings_select_own on public.promo_listings;
create policy promo_listings_select_own on public.promo_listings
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists promo_listings_insert_own on public.promo_listings;
create policy promo_listings_insert_own on public.promo_listings
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists promo_listings_update_own on public.promo_listings;
create policy promo_listings_update_own on public.promo_listings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists promo_listings_delete_own on public.promo_listings;
create policy promo_listings_delete_own on public.promo_listings
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- 4. Bucket -------------------------------------------------------------------

-- Приватный, в отличие от promo-mockups. Туда ходит Printful своим GET и файл
-- живёт секунды, а здесь лежат оплаченные кадры пользователя месяцами: публичный
-- на чтение bucket означал бы, что чужой узор скачивает любой, кто угадал путь.
-- Отдаём через signed URL на час (createSignedUrl), как feedback-attachments.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promo-assets',
  'promo-assets',
  false,
  -- 8 МБ: кадр 2К в PNG весит до 6 МБ, запас на будущее повышение разрешения.
  8388608,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Путь строится как {user_id}/{series_id}/{shot_id}.png. Первый сегмент это
-- user_id, и вся политика держится на нём - тот же приём, что в avatars.
drop policy if exists promo_assets_select_own on storage.objects;
create policy promo_assets_select_own
  on storage.objects for select
  to authenticated
  using (bucket_id = 'promo-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Удалять свои файлы можно: за уборкой проекта идёт уборка его картинок.
drop policy if exists promo_assets_delete_own on storage.objects;
create policy promo_assets_delete_own
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'promo-assets' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Политик insert/update нет: кладёт только server action под service-ключом.
-- Иначе получился бы бесплатный файлохостинг на нашем домене (та же логика,
-- что в 20260812150000_promo_mockups_bucket.sql).
drop policy if exists promo_assets_insert_own on storage.objects;
drop policy if exists promo_assets_update_own on storage.objects;
```

### 2.3 Вторая миграция: атомарная бухгалтерия серии

Файл: `supabase/migrations/20260815110000_promo_series_settle.sql`

```sql
-- Расчёт по серии одним вызовом: пересчитать исходы кадров, поставить статус
-- серии и вернуть, сколько денег и квоты подлежит возврату.
--
-- Функция, а не три запроса из JS, ровно по той же причине, что consume_ai_quota:
-- кадры доезжают параллельно, и «прочитать счётчик, посчитать в ноде, записать»
-- это гарантированная гонка на частичном успехе.
--
-- Возвращает jsonb: { status, succeeded, failed, refund_units, refund_cents }.
-- Само движение денег функция НЕ делает: возврат идёт через wallet_refund с тем
-- же ref, что и списание, и вызывается из кода один раз по итогу расчёта.
create or replace function public.settle_promo_series(p_series_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested integer;
  v_succeeded integer;
  v_failed    integer;
  v_pending   integer;
  v_status    text;
  v_units     integer;
  v_spent     integer;
  v_refunded  integer;
  v_refund_units integer;
  v_refund_cents integer;
begin
  select requested, quota_units, spent_cents, refunded_cents
    into v_requested, v_units, v_spent, v_refunded
    from public.promo_series
   where id = p_series_id
   for update;

  if v_requested is null then
    return null;
  end if;

  select
    count(*) filter (where status = 'done'),
    count(*) filter (where status in ('failed', 'blocked', 'cancelled')),
    count(*) filter (where status in ('queued', 'running'))
    into v_succeeded, v_failed, v_pending
    from public.promo_shots
   where series_id = p_series_id and parent_shot_id is null;

  -- Серия ещё в работе: считаем счётчики, но статус не закрываем и денег не трогаем.
  if v_pending > 0 then
    update public.promo_series
       set succeeded = v_succeeded, failed = v_failed, status = 'running'
     where id = p_series_id;
    return jsonb_build_object(
      'status', 'running', 'succeeded', v_succeeded, 'failed', v_failed,
      'refund_units', 0, 'refund_cents', 0
    );
  end if;

  v_status := case
    when v_succeeded = 0 then 'failed'
    when v_failed = 0 then 'done'
    else 'partial'
  end;

  -- Вот оно, лечение дефекта D5. Возврат пропорционален НЕ вышедшим кадрам,
  -- а не «всё или ничего»: вышло 3 из 12 - возвращаем за 9.
  -- div сознательно целочисленный и в пользу пользователя (round вверх),
  -- чтобы копеечный остаток от деления не оседал у нас.
  v_refund_units := case when v_requested = 0 then 0 else (v_units * v_failed) / v_requested end;
  v_refund_cents := case when v_requested = 0 then 0
                    else ((v_spent * v_failed) + v_requested - 1) / v_requested end;
  -- Дважды не возвращаем: если refunded_cents уже стоит, остаток нулевой.
  v_refund_cents := greatest(0, least(v_refund_cents, v_spent - v_refunded));

  update public.promo_series
     set succeeded = v_succeeded,
         failed = v_failed,
         status = v_status,
         refunded_cents = v_refunded + v_refund_cents,
         finished_at = now()
   where id = p_series_id;

  return jsonb_build_object(
    'status', v_status, 'succeeded', v_succeeded, 'failed', v_failed,
    'refund_units', v_refund_units, 'refund_cents', v_refund_cents
  );
end;
$$;

revoke all on function public.settle_promo_series(uuid) from public, anon, authenticated;
grant execute on function public.settle_promo_series(uuid) to service_role;
```

### 2.4 Третья миграция: пресеты пакетов кадров

Файл: `supabase/migrations/20260815120000_frame_packs.sql`

Пакеты кадров не заводятся отдельной таблицей: это константы в коде (`lib/promo/packs.ts`), а факт покупки это обычное пополнение кошелька + отдельная таблица баланса кадров. Решение владельца - «Pro сохраняет 30 бесплатных кадров в месяц, сверх лимита тратит баланс». То есть **баланс кадров это производная от долларового баланса, а не отдельная валюта**. Отдельную таблицу заводить не надо, и это упрощение стоит зафиксировать явно:

- один кадр стоит **20 центов** (себестоимость 8 центов x 2.5);
- пакет это просто пополнение кошелька на $2 / $5 / $15 с бонусом в виде скидки на кадр;
- «осталось кадров» = `free_remaining + floor(balance_cents / 20)`.

Проверка арифметики пакетов:

| Пакет | Цена | Кадров | Цена кадра | Что кладём в кошелёк |
|-------|------|--------|-----------|----------------------|
| 10 кадров | $2.00 | 10 | 20 центов | 200 центов |
| 30 кадров | $5.00 | 30 | 16.7 цента | 600 центов (бонус 100) |
| 100 кадров | $15.00 | 100 | 15 центов | 2000 центов (бонус 500) |

То есть скидка реализуется бонусными центами при пополнении, а списание всегда идёт по единой цене 20 центов за кадр. Так не нужно ни второй валюты, ни второго ledger'а: `wallet_transactions` уже атомарен и идемпотентен по `(kind, ref)`, и его достаточно.

Поэтому третья миграция нужна только под расширение пресетов кошелька:

```sql
-- Пресеты пополнения кошелька были 500/1000/2500 центов и жили только в коде
-- (lib/wallet/format.ts). Пакеты кадров это те же пополнения с бонусом, и
-- сумма зачисления теперь не равна сумме платежа. Поэтому вебхуку нужен
-- явный маппинг, а не «зачислить, сколько заплатили».
--
-- Таблица, а не константа в коде, по одной причине: вебхук Stripe может
-- прийти после деплоя, поменявшего цены, и зачислить не то, что купили.
-- Строка в базе фиксирует условия на момент покупки.
create table if not exists public.frame_packs (
  id            text primary key,
  price_cents   integer not null,
  credit_cents  integer not null,
  frames        integer not null,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint frame_packs_price_pos check (price_cents > 0),
  constraint frame_packs_credit_ge_price check (credit_cents >= price_cents),
  constraint frame_packs_frames_pos check (frames > 0)
);

comment on table public.frame_packs is 'Пакеты кадров: цена платежа и сумма зачисления в кошелёк. Бонус это разница';

insert into public.frame_packs (id, price_cents, credit_cents, frames) values
  ('frames10',  200,  200,  10),
  ('frames30',  500,  600,  30),
  ('frames100', 1500, 2000, 100)
on conflict (id) do update
  set price_cents = excluded.price_cents,
      credit_cents = excluded.credit_cents,
      frames = excluded.frames,
      active = true;

alter table public.frame_packs enable row level security;

-- Прайс публичный: его показывает страница тарифов и промо-панель.
drop policy if exists frame_packs_read_all on public.frame_packs;
create policy frame_packs_read_all on public.frame_packs
  for select to anon, authenticated
  using (active);
-- Политик записи нет: прайс правит владелец миграцией.
```

---

## 3. «Текущий проект» на клиенте

### 3.1 Где живёт projectId

Новое поле в `lib/store/studio.ts`, в `StudioState`:

```ts
/**
 * Id проекта в облаке, если текущий документ уже сохранён. null значит
 * «черновик, живёт только в localStorage». Это не часть Design и не уезжает
 * в хэш-ссылку: ссылка это снимок документа, а не указатель на чужую строку в базе.
 */
readonly projectId: string | null
/** Имя проекта в облаке. Может отличаться от имени документа, если человек переименовал в панели. */
readonly projectName: string | null
/** Когда последний раз успешно синхронизировали документ с облаком. */
readonly projectSyncedAt: number | null
```

Плюс действия:

```ts
setCurrentProject(id: string | null, name: string | null): void
markProjectSynced(atMs: number): void
```

Правила сброса, каждое неочевидное:

- `loadDesign(design)` из `loadProjectAction` **ставит** `projectId`. Отдельный вызов `setCurrentProject` сразу после - не изящно, но честнее, чем протаскивать id через `loadDesign` и путать «загрузка документа» с «привязка к облаку».
- `loadDesign` из хэш-ссылки, из шаблона, из генератора, из фото **сбрасывает** `projectId` в null. Пришедший по ссылке чужой узор не имеет права перезаписать мой проект.
- `resetStudio()` сбрасывает `projectId` в null.
- Правки документа `projectId` **не сбрасывают**, но двигают «есть несохранённые изменения»: это вычисляется как `history.present !== lastSyncedDesign`, отдельный флаг заводить не надо, достаточно хранить ссылку на последний синхронизированный документ.

### 3.2 Персистентность projectId

`projectId` пишется в localStorage **отдельным ключом**, не внутри документа. Файл: `lib/persist/codec.ts` трогать не надо, `lib/store/persist.ts` дополнить.

```ts
// lib/store/persist.ts
export const PROJECT_ID_KEY = 'eg-current-project'

interface StoredProjectRef {
  readonly id: string
  readonly name: string
  readonly savedAt: number
}
```

Почему отдельным ключом, а не полем Design: `Design` уезжает в хэш-ссылку и в `projects.design`. Id строки внутри самой строки это (а) циклическая ссылка, (б) утечка чужого id в публичную ссылку, (в) миграция схемы документа ради поля, которое к геометрии доски отношения не имеет.

При старте `useStudioPersistence` восстанавливает пару (документ, projectId) **только если документ пришёл из localStorage**, а не из хэша. Пришёл из хэша - `projectId` не восстанавливается.

### 3.3 Автосохранение: create-or-update

Новое серверное действие вместо латания двух существующих.

Файл: `app/actions/projects.ts`

```ts
/**
 * Сохранить документ в облако: создать новый проект или перезаписать
 * существующий. Единая точка вместо пары saveProjectAction/updateProjectAction,
 * из-за которой каждое «Сохранить» плодило дубль (см. дефект D12).
 *
 * projectId приходит с клиента, но НЕ является доверенным: сервер проверяет,
 * что строка принадлежит текущему пользователю, и при несовпадении создаёт
 * новую вместо того, чтобы отказать. Отказ здесь означал бы потерянную работу.
 */
export async function upsertProjectAction(input: {
  readonly projectId: string | null
  readonly name: string
  readonly design: unknown
}): Promise<ActionResult<ProjectSummary>>
```

Логика:

1. `requireUser()`, иначе `unauthenticated`.
2. Валидация имени и `parseDesign(design)`, иначе `invalid`.
3. `projectId === null` -> проверка `FREE_PROJECT_LIMIT` для не-Pro -> INSERT.
4. `projectId !== null` -> `select id from projects where id = ? and user_id = ?`. Нашли - UPDATE. Не нашли - падаем в ветку 3 (INSERT), потому что проект могли удалить с другого устройства, и терять документ из-за этого нельзя.
5. Возврат `ProjectSummary`.

`saveProjectAction` и `updateProjectAction` остаются как есть - ими пользуется REST API (`app/api/v1/projects/`) и их трогать незачем. `ProjectsPanel.tsx` переводится на `upsertProjectAction`.

### 3.4 Автосохранение перед платной генерацией

Отдельный клиентский хук: `lib/promo/useProjectGuard.ts`

```ts
export type ProjectGuardState =
  | { readonly kind: 'ready'; readonly projectId: string; readonly projectName: string }
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'saving' }
  | { readonly kind: 'failed'; readonly error: ProjectsError }

export interface ProjectGuard {
  readonly state: ProjectGuardState
  /**
   * Гарантирует, что перед платным действием документ лежит в облаке.
   * Возвращает projectId или null, если сохранить не вышло. Платное действие
   * при null НЕ запускается: генерировать в никуда мы больше не будем.
   */
  ensureSaved(): Promise<string | null>
}
```

Правило железное: **`generatePromoSeriesAction` не вызывается без `projectId`**. Схема на сервере требует `projectId: z.uuid()`, отсутствие это `invalid`. Это не UX-удобство, это структурная гарантия того, что оплаченный кадр всегда есть куда положить.

### 3.5 Выбор проекта в промо-панели

Новый компонент: `components/promo/ProjectContextBar.tsx`, `data-testid="promo-project-bar"`.

Что показывает:

- Селектор проекта (`<select>` со списком из `listProjectsAction`), `data-testid="promo-project-select"`. Выбор загружает документ через `loadProjectAction` и ставит `projectId`.
- Пункт «Текущий черновик (не сохранён)» первым, если `projectId === null`.
- Плашка после успешного сохранения: «Всё сохранено в проекте «Шахматка орех-клён»» плюс ссылка «Открыть», `data-testid="promo-project-saved"`. Ссылка ведёт на `/?tab=projects` с подсветкой строки.
- Счётчик кадров справа, `data-testid="promo-frames-left"`.
- Для анонима: «Войдите, чтобы сохранять кадры», `data-testid="promo-project-anon"`, кнопка входа.

Панель рисуется **первой** в `PromoPanel.tsx`, до `PhotoSeries`.

---

## 4. Экономика

### 4.1 Единица учёта

Единица одна: **кадр**. Не «единица квоты», не «генерация», не «обращение». Один кадр это один вызов модели, отдающий одну картинку.

Себестоимость кадра ~8 центов (nano banana 2 на fal). Цена для пользователя **20 центов** (наценка x2.5).

Константы: `lib/promo/pricing.ts`

```ts
/** Себестоимость кадра у провайдера, центы. Справочно, для расчёта наценки. */
export const FRAME_COST_CENTS = 8
/** Цена кадра для пользователя, центы. Наценка x2.5 к себестоимости. */
export const FRAME_PRICE_CENTS = 20

export interface FramePack {
  readonly id: 'frames10' | 'frames30' | 'frames100'
  readonly priceCents: number
  readonly creditCents: number
  readonly frames: number
}

export const FRAME_PACKS: readonly FramePack[] = [
  { id: 'frames10',  priceCents: 200,  creditCents: 200,  frames: 10 },
  { id: 'frames30',  priceCents: 500,  creditCents: 600,  frames: 30 },
  { id: 'frames100', priceCents: 1500, creditCents: 2000, frames: 100 },
]

/** Сколько кадров можно купить на баланс. Чистая функция: цифру показывает UI до нажатия. */
export function framesFromBalance(balanceCents: number): number {
  return Math.max(0, Math.floor(balanceCents / FRAME_PRICE_CENTS))
}

/** Сколько центов спишется за N кадров сверх бесплатного остатка. */
export function frameChargeCents(frames: number, freeRemaining: number): number {
  return Math.max(0, frames - Math.max(0, freeRemaining)) * FRAME_PRICE_CENTS
}
```

### 4.2 Один прозрачный счётчик

Тип: `lib/promo/pricing.ts`

```ts
export interface FrameBudget {
  /** Бесплатных кадров осталось в этом месяце (Pro: из 30; trial: из 3; иначе 0). */
  readonly freeRemaining: number
  /** Когда обновятся бесплатные: ISO-строка первого числа следующего месяца. null для trial. */
  readonly freeResetsAt: string | null
  /** Баланс кошелька, центы. */
  readonly balanceCents: number
  /** Кадров можно взять за баланс. */
  readonly paidRemaining: number
  /** Итого кадров доступно. Ровно эту цифру показываем одной строкой. */
  readonly totalRemaining: number
}
```

Одна строка в UI: **«Осталось кадров: 47»**, и мелким серым под ней: «30 бесплатных до 1 сентября + 17 за баланс $3.40». Не два счётчика, не «квота» и «кошелёк» отдельно.

Серверное чтение: `app/actions/promo.ts` -> `readFrameBudgetAction(): Promise<FrameBudget>`. Считается из `getAiAccess()` (бесплатный остаток) и `readWallet()` (баланс). Приезжает пропсом из серверного layout, как `AiAccess` сегодня, чтобы не мигало.

### 4.3 Расчёт до нажатия

Под кнопкой генерации, `data-testid="promo-cost"`, три варианта текста:

| Ситуация | Текст |
|----------|-------|
| Хватает бесплатных | «Спишется 6 кадров из 30 бесплатных» |
| Частично платно | «Спишется 6 кадров: 2 бесплатных и 4 за $0.80» |
| Только платно | «Спишется 6 кадров за $1.20» |
| Не хватает | «Не хватает 4 кадров. Пополните на $0.80» + кнопка пополнения |

Кнопка «Сгенерировать» блокируется, только когда `totalRemaining < selected.length`. Это единственное условие блокировки по деньгам.

### 4.4 Списание: порядок операций

Порядок жёсткий и обсуждению не подлежит:

1. **Клиент** генерирует `walletRef = crypto.randomUUID()` **один раз на клик** (приём уже есть в `components/promo/VideoPanel.tsx`, копировать оттуда). Ретрай того же клика шлёт тот же ref.
2. **Клиент** зовёт `ensureSaved()` - проект в облаке.
3. **Сервер** (`createPromoSeriesAction`):
   a. rate limit по IP (`passRateLimit`, уже есть);
   b. валидация схемы, включая `projectId`;
   c. проверка владения проектом;
   d. расчёт: сколько кадров бесплатных, сколько платных;
   e. **резерв бесплатных** через `assertAiAllowed('promoShots', freeUnits)` - если `freeUnits > 0`;
   f. **списание платных** через `wallet_spend(user_id, paidCents, walletRef)` - если `paidCents > 0`. Пустой returning значит «не хватило», и тогда **бесплатный резерв немедленно возвращается** через `releaseAiQuota` и действие отдаёт `insufficient`;
   g. INSERT `promo_series` (status `queued`, `quota_units = freeUnits`, `spent_cents = paidCents`, `wallet_ref = walletRef`) и N строк `promo_shots` (status `queued`);
   h. возврат `{ ok: true, seriesId, shots: [...] }` клиенту **немедленно**, не дожидаясь картинок.

Пункт (h) это ключевой поворот: server action больше не генерирует. Он только заводит задание.

### 4.5 maxDuration 60 с: выбранное решение

Три варианта рассматривались:

| Вариант | Плюс | Минус | Вердикт |
|---------|------|-------|---------|
| Батчи по 2 кадра в одном action | минимальная правка | 12 кадров это 6 круговых запросов, каждый может упасть; прогресс всё равно кривой; при обрыве середины непонятно, что списано | нет |
| Внешняя очередь (QStash, Inngest) | правильно по-взрослому | новый внешний сервис, новый ключ, новый счёт, новая точка отказа перед дедлайном конкурса | нет |
| **Job-таблица + route handler на кадр + polling с клиента** | нет внешних зависимостей; каждый кадр это отдельный запрос со своим таймаутом; статус в базе переживает и обрыв, и деплой; прогресс честный по построению | больше кода, чем у батчей | **да** |

**Выбран третий.** Обоснование по пунктам:

- `promo_shots` уже есть в модели данных по другой причине (сохранение результата). Job-таблица получается бесплатно: строка со статусом `queued` это и есть задание.
- Один кадр это один HTTP-запрос к `POST /api/promo/shot`. Таймаут кадра 30 с помещается в `maxDuration = 60` с двукратным запасом. Обрыва платформы не будет никогда.
- Обрыв соединения, закрытая вкладка, деплой посреди работы: строка в базе осталась в `queued`/`running`, и её подберёт либо повторный заход, либо reaper (см. 4.7).
- Прогресс не надо изображать: он выводится из `select status from promo_shots where series_id = ?`.

### 4.6 Механика исполнения

**Route handler:** `app/api/promo/shot/route.ts`

```ts
export const maxDuration = 60
export const runtime = 'nodejs'

/**
 * Рисует ОДИН кадр. Вызывается клиентом по одному разу на каждый queued-кадр
 * серии, параллельно с ограничением на количество одновременных запросов.
 *
 * Route handler, а не server action, по двум причинам: (1) свой maxDuration,
 * не унаследованный от страницы; (2) действие идемпотентно по shotId, и
 * повторный вызов на уже готовый кадр обязан вернуть тот же результат, не
 * потратив ни цента - у route handler это выражается честным 200 с телом.
 *
 * Тело: { shotId: string }. Всё остальное (промпт, рендер доски, провайдер)
 * сервер достаёт сам из promo_series/promo_shots: клиент не имеет права
 * прислать промпт в обход валидации и не имеет права выбрать провайдера.
 */
export async function POST(req: Request): Promise<Response>
```

Алгоритм внутри:

1. Сессия. Нет - 401.
2. `shotId` из тела, `z.uuid()`.
3. Атомарный захват кадра: `update promo_shots set status='running' where id=? and user_id=? and status='queued' returning *`. Пустой returning значит: кадр уже кем-то взят, уже готов или чужой. Тогда читаем текущее состояние и отдаём его как есть - без второго вызова модели. **Это и есть защита от двойного списания при двойном клике.**
4. Читаем `promo_series` (промпт, рендер доски, source).
5. Рендер доски достаём из Storage по `board_png_path`, а не просим у клиента: клиент мог за это время изменить документ, и кадр 4 нарисовался бы по другой доске, чем кадр 1.
6. `resolveImageProvider(tier)` -> `provider.generate({ prompt, referencePngBase64 })`.
7. Успех: заливаем PNG в `promo-assets` по пути `{userId}/{seriesId}/{shotId}.png`, `update promo_shots set status='done', storage_path=..., provider=..., width=..., height=..., bytes=...`.
8. Провал: `status='failed'` (или `'blocked'`), `error=<код>`.
9. `settle_promo_series(seriesId)` - пересчёт. Если вернул `refund_cents > 0`, зовём `wallet_refund(user_id, refund_cents, series.wallet_ref || ':refund')`. Если `refund_units > 0`, зовём `release_ai_quota`.
10. Ответ: `{ shot: PromoShotView, series: PromoSeriesView }`.

Важно про ref возврата: `wallet_refund` идемпотентен по `(kind, ref)`. Возврат может происходить **несколько раз** по мере доезда кадров (упал кадр 2, потом кадр 5). Поэтому ref возврата должен быть уникален на каждый акт возврата, но идемпотентен при ретрае. Решение: `ref = `${series.wallet_ref}:r${refundedCentsBefore}``. Сумма уже возвращённого монотонно растёт и служит номером транша, а повторный вызов с тем же состоянием даст тот же ref и упрётся в уникальный индекс. `settle_promo_series` уже обновляет `refunded_cents` под `for update`, так что гонки нет.

**Клиентский исполнитель:** `lib/promo/runner.ts`

```ts
/** Сколько кадров рисуем одновременно. Больше четырёх это 429 у fal и ничего больше. */
export const SHOT_CONCURRENCY = 4

export interface RunnerHandle {
  cancel(): void
}

/**
 * Гоняет очередь кадров серии: не больше SHOT_CONCURRENCY одновременно,
 * каждый готовый кадр немедленно уезжает в onShot. Отмена не убивает уже
 * начатые кадры (они оплачены и доедут), а перестаёт запускать новые и
 * помечает оставшиеся queued как cancelled через cancelPromoSeriesAction.
 */
export function runSeries(
  shotIds: readonly string[],
  onShot: (shot: PromoShotView) => void,
  onSeries: (series: PromoSeriesView) => void,
): RunnerHandle
```

### 4.7 Подбор брошенных серий (reaper)

Человек закрыл вкладку посреди генерации. Кадры остались в `queued`, деньги списаны. Два механизма:

1. **При открытии вкладки «Промо»** клиент зовёт `listActiveSeriesAction()` - серии текущего пользователя со статусом `queued`/`running` за последний час. Есть такие - показываем их в галерее и **дорисовываем** через тот же runner. Человек ничего не теряет.
2. **Route handler `GET /api/promo/reap`** (защищён `CRON_SECRET`, вызывается Vercel Cron раз в 15 минут): находит `promo_shots` в статусе `running` старше 5 минут и `queued` старше 30 минут, помечает их `failed` с `error='abandoned'` и прогоняет `settle_promo_series` - **деньги возвращаются**. Это не украшение: без reaper любая закрытая вкладка это оплаченный ноль.

Конфиг: `vercel.json`, `{ "crons": [{ "path": "/api/promo/reap", "schedule": "*/15 * * * *" }] }`.

### 4.8 Что делать с существующим `generatePromoShotsAction`

Оставить как есть на время миграции нельзя: он списывает и не сохраняет. Удалить сразу тоже нельзя: на нём висят тесты `e2e/promo.spec.ts` и `components/promo/PromoPanel.test.tsx`.

План: `generatePromoShotsAction` и `generateReferenceShotsAction` **удаляются** в том же PR, что вводит новый путь, вместе с их вызовами и тестами. Половинчатых состояний в платном коде быть не должно. `runSeries` из `app/actions/promo.ts:61` удаляется целиком.

---

## 5. Прогресс и честный фронт

### 5.1 Состояния кадра в UI

`lib/promo/types.ts`, новый тип:

```ts
export type PromoShotStatus = 'queued' | 'running' | 'done' | 'failed' | 'blocked' | 'cancelled'

export interface PromoShotView {
  readonly id: string
  readonly seriesId: string
  readonly kindSlug: string
  readonly ordinal: number
  readonly status: PromoShotStatus
  readonly parentShotId: string | null
  readonly variantNo: number
  readonly editPrompt: string | null
  /** Signed URL на час. null пока кадр не готов. */
  readonly url: string | null
  readonly width: number | null
  readonly height: number | null
  readonly provider: string | null
  readonly prompt: string | null
  readonly error: string | null
}
```

Карточка кадра, `data-testid="promo-shot-card-{shotId}"`, рисует ровно одно из шести:

| status | Что видно | testid внутри |
|--------|-----------|---------------|
| `queued` | Скелетон с пульсацией, подпись пресета, серая метка «В очереди» | `promo-shot-queued` |
| `running` | Тот же скелетон, но метка «Рисуется» и индикатор | `promo-shot-running` |
| `done` | Картинка, чекбокс выбора, кнопки «Изменить кадр» и «Скачать» | `promo-shot-done` |
| `failed` | Серый прямоугольник, текст причины, кнопка «Повторить» и приписка «бесплатно, деньги вернулись» | `promo-shot-failed` |
| `blocked` | То же, но текст «Модель отказалась рисовать эту сцену» и подсказка сменить пресет; кнопки «Повторить» **нет** (повтор с тем же промптом даст тот же отказ) | `promo-shot-blocked` |
| `cancelled` | Приглушённая карточка, «Отменён, деньги вернулись» | `promo-shot-cancelled` |

Скелетон **сохраняет пропорции будущего кадра** (1:1), чтобы галерея не прыгала при доезде картинок.

### 5.2 Полоса прогресса серии

`data-testid="promo-series-progress"`. Показывает: «Готово 3 из 6 · 1 не вышел». Рядом кнопка «Отменить» (`data-testid="promo-cancel"`), видимая пока `status in ('queued','running')`.

### 5.3 Отмена

`cancelPromoSeriesAction(seriesId: string): Promise<ActionResult<PromoSeriesView>>`

Что делает: `update promo_shots set status='cancelled' where series_id=? and status='queued'`. Кадры в `running` **не трогает** - они уже оплачены провайдеру и доедут. Затем `settle_promo_series` -> возврат за отменённые.

Что видит человек: «Отменено 3 кадра, вернули $0.60. Два кадра уже рисовались, они доедут.» Это честно и это не бесит.

### 5.4 Повтор упавшего кадра

`retryPromoShotAction(shotId: string): Promise<ActionResult<PromoShotView>>`

Правила:

- Повтор возможен только для `failed`, не для `blocked` и не для `cancelled`.
- Повтор **бесплатен**: деньги за этот кадр уже вернулись при settle. Списание происходит заново по обычным правилам, то есть повтор это новое списание, но человеку показываем «повторить» без цены только если `freeRemaining > 0` или баланса хватает. Если не хватает - кнопка ведёт на пополнение.
- Технически: `update promo_shots set status='queued', error=null where id=? and status='failed'`, потом заново списываем (1 кадр, ref `${series.wallet_ref}:retry:${shotId}`), потом клиент дёргает `POST /api/promo/shot`.
- Больше трёх повторов одного кадра запрещено: колонка `promo_shots.retries` с `constraint promo_shots_retries_max` (см. DDL в 2.2). Захват на повтор идёт условием `where id=? and status='failed' and retries < 3`, инкремент в том же update. Исчерпан лимит - кнопка «Повторить» пропадает, вместо неё текст «Эта сцена не выходит. Попробуйте другой пресет или правку промта».

### 5.5 Частичный успех

Никаких «всё или ничего». Серия со статусом `partial` это нормальный, показываемый, скачиваемый результат. Плашка: «Вышло 4 кадра из 6. За два не вышедших вернули $0.40.» `data-testid="promo-partial-note"`.

### 5.6 Пропадание вкладки

`PromoPanel` больше **не теряет** состояние при размонтировании, потому что состояние не в нём. Источник истины: база. Клиентский кэш: отдельный zustand-стор `lib/store/promo.ts`, который живёт вне `StudioShell` и не размонтируется вместе с вкладкой.

```ts
// lib/store/promo.ts
export interface PromoState {
  readonly seriesById: Readonly<Record<string, PromoSeriesView>>
  readonly shotsBySeries: Readonly<Record<string, readonly PromoShotView[]>>
  readonly selectedShotIds: readonly string[]
  readonly marketplace: MarketplaceId
  readonly activeSeriesId: string | null
  upsertSeries(series: PromoSeriesView): void
  upsertShot(shot: PromoShotView): void
  toggleSelected(shotId: string): void
  selectAll(seriesId: string): void
  clearSelection(): void
  setMarketplace(id: MarketplaceId): void
}
```

При монтировании `PromoPanel` подтягивает состояние из базы (`listPromoSeriesAction(projectId)`), а не полагается только на кэш. Кэш нужен для мгновенной отрисовки без мигания, база - для истины.

---

## 6. Редактор промта

### 6.1 Что показываем

Под каждым выбранным пресетом - раскрывающийся блок «Промпт» (`<details>`, `data-testid="promo-prompt-editor"`). Внутри:

1. **Итоговый промпт целиком**, read-only, моноширинным, `data-testid="promo-prompt-preview"`. Именно то, что уйдёт в модель: сцена + описание доски + общие правила. Это не украшение: человек, который видит промпт, перестаёт думать, что мы жульничаем.
2. **Редактируемая часть**: только описание сцены. `<textarea data-testid="promo-prompt-scene">`, предзаполненный текстом пресета из `SCENES`, лимит 1200 символов.
3. Кнопка «Вернуть как было», `data-testid="promo-prompt-reset"`.
4. Строка «Описание доски и технические правила добавляются автоматически и не редактируются».

### 6.2 Что даём править и что нет

| Часть промпта | Редактируется | Почему |
|---------------|---------------|--------|
| Сцена (`SCENES[kind]`) | **да** | Ровно за этим человек и пришёл: убрать миску, поменять фон |
| Описание доски (`describeBoard().text`) | **нет** | Это машинный слепок геометрии и пород. Правка тут значит «нарисуй не мою доску» |
| Общие правила (`PROMO_COMMON_RULES`) | **нет** | «no text, no watermark, no faces, colours must match reference» - это защита от мусора на выходе и от жалоб |
| Технические параметры (`aspect_ratio`, `resolution`, `output_format`) | **нет** | Не текст вовсе |

### 6.3 Безопасность

Сервер **не доверяет присланному тексту сцены никогда**. Файл: `lib/promo/promptGuard.ts`

```ts
/** Максимум символов пользовательской сцены. Длиннее это не сцена, а попытка забить контекст. */
export const SCENE_MAX_CHARS = 1200

/**
 * Стоп-паттерны. Не «модерация», а защита каркаса: попытки отменить наши
 * правила, попросить текст на картинке, попросить чужой бренд или лицо.
 * Список короткий и конкретный: длинный чёрный список это иллюзия защиты,
 * настоящая защита в том, что правила приклеиваются ПОСЛЕ пользовательского
 * текста и модель видит их последними.
 */
export const SCENE_BLOCKED_PATTERNS: readonly RegExp[] = [
  /ignore (all |the )?(previous|above|prior) (instructions?|rules?|prompts?)/i,
  /disregard (all |the )?(previous|above|prior)/i,
  /\bsystem prompt\b/i,
  /\b(nude|nsfw|explicit|porn)\b/i,
  /\b(nike|adidas|apple|ikea|disney|coca[- ]cola)\b/i,
]

export type SceneVerdict =
  | { readonly ok: true; readonly scene: string }
  | { readonly ok: false; readonly reason: 'tooLong' | 'blocked' | 'empty' }

/** Чистая функция: тестируется без сети, зовётся только на сервере. */
export function checkScene(raw: unknown): SceneVerdict
```

**Склейка всегда на сервере и всегда в одном порядке**, `lib/promo/prompts.ts`:

```ts
/**
 * Итоговый промпт. Пользовательская сцена стоит ПЕРВОЙ, наши правила ПОСЛЕДНИМИ:
 * модель картинок взвешивает хвост промпта сильнее, и «no text, no watermark»
 * в конце переспорит «add a big logo» в начале. Обратный порядок сделал бы
 * редактор промта дырой в правилах.
 */
export function composePrompt(scene: string, description: string): string {
  return `${scene}\n\nSubject: ${description}\n\n${PROMO_COMMON_RULES}`
}
```

Схема (`lib/promo/schema.ts`) получает необязательное поле:

```ts
export const promoSeriesSchema = z.object({
  projectId: z.uuid(),
  walletRef: z.uuid(),
  marketplace: z.enum(MARKETPLACE_IDS),
  boardPng: z.string().max(MAX_PNG_CHARS).regex(PNG_DATA_URL_RE),
  description: z.string().trim().min(1).max(2000),
  shots: z
    .array(
      z.object({
        kind: z.enum(PROMO_SHOTS_AND_CUSTOM),
        /** Правленая сцена. Отсутствует - берём пресетную из SCENES. */
        scene: z.string().trim().max(SCENE_MAX_CHARS).optional(),
      }),
    )
    .min(1)
    .max(PROMO_MAX_SHOTS),
})
```

Ключевое: `description` с клиента **тоже не доверяем**. Сервер пересчитывает его сам через `describeBoard(design, compile(design))`, взяв `design` из строки `projects` по `projectId`. Поле в схеме остаётся только для обратной совместимости мока и игнорируется на платном пути. Так «Subject:» гарантированно описывает реальную доску проекта.

### 6.4 «Изменить кадр»

Кнопка на готовом кадре, `data-testid="promo-shot-edit-{shotId}"`. Открывает поле ввода на русском/английском (по локали): «Что поменять?», `data-testid="promo-edit-input"`.

Серверное действие:

```ts
/**
 * Правка кадра. Создаёт НОВЫЙ кадр рядом, оригинал не трогает никогда:
 * человек заплатил за оба и решать, какой лучше, ему.
 *
 * Технически это серия из одного кадра с source='edit'. Референсом уходит
 * не рендер доски, а сам исправляемый кадр: модель редактирования
 * (nano-banana-2/edit) правит присланную картинку, а не рисует заново.
 */
export async function editPromoShotAction(input: {
  readonly shotId: string
  readonly instruction: string
  readonly walletRef: string
}): Promise<ActionResult<{ readonly seriesId: string; readonly shot: PromoShotView }>>
```

Промпт правки: `lib/promo/prompts.ts`

```ts
/**
 * Инструкция правки пишется человеком на любом языке, а модель понимает
 * английский лучше. Перевода не делаем (это ещё один платный вызов): вместо
 * этого просим модель в самом промпте выполнить инструкцию на любом языке.
 */
export function editPrompt(instruction: string, description: string): string {
  return (
    'Edit the provided product photograph. Apply exactly this change, ' +
    'written by the user in their own language, and change nothing else:\n' +
    `"${instruction}"\n\n` +
    `The subject is: ${description}\n\n` +
    'Keep the same camera angle, lighting scheme and framing unless the change asks otherwise. ' +
    `${PROMO_COMMON_RULES}`
  )
}
```

Инструкция проходит тот же `checkScene` с лимитом 1000 символов.

Новый кадр пишется с `parent_shot_id = <корень группы>` (если правим уже вариант, берём его `parent_shot_id`, а не его `id`) и `variant_no = max(variant_no) + 1`.

Галерея группирует: карточка кадра с несколькими вариантами показывает их горизонтальной лентой, `data-testid="promo-variants-{rootShotId}"`, у каждого свой чекбокс и подпись «Вариант N».

---

## 7. Паки под маркетплейсы

### 7.0 Дисциплина работы с этими цифрами

Требования площадок собраны веб-поиском 14.08.2026 и **разного качества подтверждения**. Это надо знать до того, как кодить, потому что цена ошибки тут - отклонённая карточка у живого продавца.

| Источник | Статус |
|----------|--------|
| Яндекс.Маркет | **подтверждено первоисточником**, страница считана напрямую: https://yandex.ru/support/marketplace/ru/assortment/create/main-fields/images |
| Amazon | оффдок `sellercentral.amazon.com/help/hub/reference/external/G1881` **за логином**, напрямую не считан. Цифры сходятся у нескольких независимых гайдов, ссылающихся на него |
| eBay | `developer.ebay.com/support/kb-article?KBid=1004` отдал таймаут. Цифры из поискового сниппета того же официального домена |
| Ozon | `docs.ozon.ru/global/products/upload/adding-content/image-requirements` отдаёт редирект-луп. Цифры из сниппета той же официальной страницы |
| Mercado Libre | `vendedores.mercadolibre.com` даёт **категорийные**, а не единые требования. Цифры агрегированы из сниппетов официального домена |
| Wildberries | публичной документации без логина **не существует**. Все цифры - агрегация независимых селлер-сервисов (SellerMoon, TrustyOne, Avriro), которые совпадают между собой. **Первоисточником не подтверждено** |

Отсюда два правила для кода:

1. Каждая запись в справочнике несёт поле `sourceUrl` и поле `confirmed: boolean`. Неподтверждённые площадки помечаются в UI сноской «требования уточните в кабинете продавца».
2. Кроп **никогда не увеличивает** картинку выше исходного разрешения. Мы отдаём 1К-кадр; если площадка хочет 2000 px, апскейл интерполяцией это не качество, а мыло с большим весом. Вместо этого поднимаем разрешение генерации (`resolution: '2K'` у nano banana 2) для площадок, где это нужно, и честно пишем, что кадр 1024 px.

### 7.1 Сводная таблица требований

| Площадка | id | Аспект главного | Мин. px | Реком. px | Макс. px | Макс. файл | Форматы | Фон главного | Макс. фото | Зум с |
|----------|-----|----------------|---------|-----------|----------|-----------|---------|--------------|-----------|-------|
| Amazon | `amazon` | 1:1 | 1000 по длинной | 2000-3000 по длинной | не подтв. | ~10 МБ (не подтв.) | JPEG (гл.), TIFF; PNG/GIF доп. | чистый белый RGB 255,255,255 | 1 + до 8 (категорийно) | 1000 px |
| eBay | `ebay` | 1:1 | 500x500 | 1600x1600 | не подтв. | 12 МБ (не подтв.) | JPG, PNG, TIFF, BMP, GIF без анимации | белый/нейтральный, рекомендация | 24 бесплатно | 800 px, полноценно с 1600 |
| Wildberries | `wildberries` | 3:4 | 700x900 | 900x1200+ | 8000 по длинной | 10 МБ | JPG, PNG, WebP, sRGB, сжатие ≥65% | белый или светло-серый нейтральный | 30 | не подтв. |
| Mercado Libre | `mercadolibre` | 1:1 (для packs практикуют 1200x1540) | 500x500 | 1200x1200 | не подтв. | не подтв. | обычно JPG | белый/кремовый/светло-серый, без градиентов | 12 на товар, 10 на вариацию | не подтв. |
| Ozon | `ozon` | 1:1 для непрофильных категорий (доска сюда и попадает); 3:4 для одежды/обуви/аксессуаров | 200x200 (прочее), 700x900 (одежда) | 900x1200+ | 4320x7680 | 10 МБ | JPG, JPEG, PNG (+HEIC/WEBP через приложение) | нейтральный/белый, без водяных знаков, рамок, текста, плашек цены | 30 | не подтв. |
| Яндекс.Маркет | `yandexmarket` | витрина адаптирует под 3:4 | 300x300 | 1000x1000 - 2000x2000 | 8000 по длинной | 10 МБ | jpg, jpeg, png, heic, webp | белый #FFFFFF или прозрачный, товар ≥ 2/3 кадра | 30 (не подтв. оффдоком) | не подтв. |

Отдельно: **аспект витрины и аспект требования это разные вещи.** Ozon требует 1:1 для нашей категории, но карточку в выдаче показывает в 3:4 - квадрат обрежется по бокам или дорисуется полями. Поэтому целевой аспект в справочнике берём **под витрину, а не под минимальное требование**: продаёт то, что видно в выдаче. Для Ozon и WB это 3:4.

### 7.2 Справочник в коде

Файл: `lib/promo/marketplaces.ts`

```ts
/**
 * Требования площадок к фото карточки. Собрано 14.08.2026 веб-поиском.
 * confirmed: false значит «первоисточник не считан напрямую, цифры сходятся
 * у независимых источников». Это не повод не пользоваться, это повод не врать
 * пользователю про гарантию: в UI такая площадка несёт сноску.
 *
 * targetAspect это аспект ВИТРИНЫ, а не минимального требования площадки:
 * Ozon принимает квадрат, но в выдаче показывает 3:4, и квадрат там режется.
 * Продаёт то, что видно в выдаче.
 */
export type MarketplaceId =
  | 'amazon' | 'ebay' | 'etsy' | 'wildberries' | 'mercadolibre' | 'ozon' | 'yandexmarket'

export type MarketplaceLocaleScope = 'global' | 'ru'

export interface MarketplaceImageSpec {
  /** Целевой аспект пака: [w, h]. */
  readonly aspect: readonly [number, number]
  /** Целевой размер пака в пикселях. */
  readonly target: { readonly width: number; readonly height: number }
  readonly minWidth: number
  readonly minHeight: number
  readonly maxLongSide: number | null
  readonly maxBytes: number
  readonly format: 'jpeg' | 'png'
  /** Чем добивать поля, если исходный аспект не совпал. null значит «кропать, не добивать». */
  readonly padColor: string | null
  readonly maxImages: number
}

export interface MarketplaceSpec {
  readonly id: MarketplaceId
  readonly labelKey: MessageKey
  readonly scope: MarketplaceLocaleScope
  readonly image: MarketplaceImageSpec
  readonly listing: MarketplaceListingRules
  readonly sourceUrl: string
  readonly confirmed: boolean
}

export const MARKETPLACES: readonly MarketplaceSpec[] = [
  {
    id: 'amazon',
    labelKey: 'market.amazon',
    scope: 'global',
    image: {
      aspect: [1, 1],
      // 2000 px, а не 1000: порог зума 1000, и кадр ровно на пороге зум не включит.
      target: { width: 2000, height: 2000 },
      minWidth: 1000, minHeight: 1000, maxLongSide: null,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      // Amazon требует именно чистый белый RGB 255,255,255 на главном фото.
      padColor: '#FFFFFF',
      maxImages: 9,
    },
    listing: { titleMax: 200, descriptionMax: 2000, bulletCount: 5, bulletMax: 500, tagCount: 7, tagMax: 50, htmlDescription: false },
    sourceUrl: 'https://sellercentral.amazon.com/help/hub/reference/external/G1881',
    confirmed: false,
  },
  {
    id: 'ebay',
    labelKey: 'market.ebay',
    scope: 'global',
    image: {
      aspect: [1, 1],
      target: { width: 1600, height: 1600 },
      minWidth: 500, minHeight: 500, maxLongSide: null,
      maxBytes: 12 * 1024 * 1024, format: 'jpeg',
      padColor: '#FFFFFF',
      maxImages: 24,
    },
    listing: { titleMax: 80, descriptionMax: 500000, bulletCount: 5, bulletMax: 200, tagCount: 0, tagMax: 0, htmlDescription: true },
    sourceUrl: 'https://developer.ebay.com/support/kb-article?KBid=1004',
    confirmed: false,
  },
  {
    id: 'etsy',
    labelKey: 'market.etsy',
    scope: 'global',
    image: {
      // Etsy оставлен из существующей карточки товара (lib/promo/listing.ts).
      // Цифры не проверялись в этом проходе: помечено confirmed: false.
      aspect: [4, 3],
      target: { width: 2000, height: 1500 },
      minWidth: 1000, minHeight: 750, maxLongSide: null,
      maxBytes: 20 * 1024 * 1024, format: 'jpeg',
      padColor: null,
      maxImages: 10,
    },
    listing: { titleMax: 140, descriptionMax: 5000, bulletCount: 0, bulletMax: 0, tagCount: 13, tagMax: 20, htmlDescription: false },
    sourceUrl: 'https://help.etsy.com/hc/en-us/articles/360000579548',
    confirmed: false,
  },
  {
    id: 'wildberries',
    labelKey: 'market.wildberries',
    scope: 'ru',
    image: {
      aspect: [3, 4],
      target: { width: 1200, height: 1600 },
      minWidth: 700, minHeight: 900, maxLongSide: 8000,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      padColor: '#FFFFFF',
      maxImages: 30,
    },
    listing: { titleMax: 60, descriptionMax: 5000, bulletCount: 0, bulletMax: 0, tagCount: 20, tagMax: 30, htmlDescription: false },
    sourceUrl: 'https://seller.wildberries.ru/',
    // Публичной документации без логина не существует: цифры агрегированы
    // из независимых селлер-сервисов, совпадающих между собой.
    confirmed: false,
  },
  {
    id: 'mercadolibre',
    labelKey: 'market.mercadolibre',
    scope: 'global',
    image: {
      aspect: [1, 1],
      target: { width: 1200, height: 1200 },
      minWidth: 500, minHeight: 500, maxLongSide: null,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      padColor: '#FFFFFF',
      maxImages: 12,
    },
    listing: { titleMax: 60, descriptionMax: 50000, bulletCount: 0, bulletMax: 0, tagCount: 0, tagMax: 0, htmlDescription: false },
    sourceUrl: 'https://vendedores.mercadolibre.com/nota/requisitos-de-fotos-para-vender',
    confirmed: false,
  },
  {
    id: 'ozon',
    labelKey: 'market.ozon',
    scope: 'ru',
    image: {
      // Ozon принимает 1:1 для нашей категории, но выдачу рисует в 3:4.
      aspect: [3, 4],
      target: { width: 1200, height: 1600 },
      minWidth: 700, minHeight: 900, maxLongSide: 7680,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      padColor: '#FFFFFF',
      maxImages: 30,
    },
    listing: { titleMax: 200, descriptionMax: 6000, bulletCount: 0, bulletMax: 0, tagCount: 0, tagMax: 0, htmlDescription: true },
    sourceUrl: 'https://docs.ozon.ru/global/products/upload/adding-content/image-requirements',
    confirmed: false,
  },
  {
    id: 'yandexmarket',
    labelKey: 'market.yandexmarket',
    scope: 'ru',
    image: {
      aspect: [3, 4],
      target: { width: 1200, height: 1600 },
      minWidth: 300, minHeight: 300, maxLongSide: 8000,
      maxBytes: 10 * 1024 * 1024, format: 'jpeg',
      // Товар обязан занимать не менее 2/3 кадра: значит поля не более 1/6 с каждой стороны.
      padColor: '#FFFFFF',
      maxImages: 30,
    },
    listing: { titleMax: 150, descriptionMax: 6000, bulletCount: 0, bulletMax: 0, tagCount: 0, tagMax: 0, htmlDescription: false },
    sourceUrl: 'https://yandex.ru/support/marketplace/ru/assortment/create/main-fields/images',
    confirmed: true,
  },
]

export const MARKETPLACE_IDS = MARKETPLACES.map((m) => m.id) as readonly [MarketplaceId, ...MarketplaceId[]]

/**
 * Что показывать в селекторе. Русские площадки видны только при русском
 * интерфейсе: американскому столяру Ozon в списке не нужен, а длинный список
 * из семи пунктов, половина которых бессмысленна, это шум.
 */
export function marketplacesFor(locale: Locale): readonly MarketplaceSpec[] {
  return locale === 'ru' ? MARKETPLACES : MARKETPLACES.filter((m) => m.scope === 'global')
}

export function marketplaceById(id: MarketplaceId): MarketplaceSpec
```

### 7.3 Как из одного кадра получить нужный кроп

Кадр рождается квадратным (`aspect_ratio: '1:1'` в `lib/ai/providers/fal.ts:proInput`). Из квадрата надо получить 3:4 и 4:3, не отрезав доску.

Файл: `lib/promo/crop.ts`

```ts
import 'server-only'
import sharp from 'sharp'

export type FitMode = 'cover' | 'pad'

/**
 * Две стратегии, и выбор между ними не вкусовщина.
 *
 * cover: кропаем по центру, лишнее отрезаем. Годится, когда целевой аспект
 * близок к исходному (разница до 15%) - обрежется фон, не объект.
 *
 * pad: вписываем целиком и добиваем полями цвета padColor. Обязателен для
 * площадок с требованием белого фона: там поля не портят кадр, а достраивают
 * тот самый белый фон, которого площадка и хочет. И обязателен, когда аспекты
 * расходятся сильно: квадрат в 3:4 через cover отрежет 25% ширины, а вместе
 * с ней и края доски.
 *
 * Порог 0.15 подобран по геометрии: 1:1 -> 3:4 это расхождение 0.33, всегда pad;
 * 1:1 -> 4:3 то же самое; 1:1 -> 1:1 это 0, всегда cover.
 */
export const ASPECT_TOLERANCE = 0.15

export function pickFitMode(
  source: { readonly width: number; readonly height: number },
  spec: MarketplaceImageSpec,
): FitMode {
  const srcRatio = source.width / source.height
  const dstRatio = spec.aspect[0] / spec.aspect[1]
  const drift = Math.abs(srcRatio - dstRatio) / dstRatio
  if (spec.padColor !== null) return 'pad'
  return drift <= ASPECT_TOLERANCE ? 'cover' : 'pad'
}

export interface CropResult {
  readonly buffer: Buffer
  readonly width: number
  readonly height: number
  readonly bytes: number
}

/**
 * Кроп под площадку. Апскейла нет никогда: если исходник меньше целевого
 * размера, целевой размер уменьшается до исходного с сохранением аспекта.
 * Интерполяционный апскейл это мыло с большим весом, а не качество, и
 * подсовывать его продавцу под видом «2000 px для Amazon» нечестно.
 */
export async function cropForMarketplace(
  input: Buffer,
  spec: MarketplaceImageSpec,
): Promise<CropResult>
```

Реализация в двух шагах: `sharp(input).resize({ width, height, fit: mode === 'pad' ? 'contain' : 'cover', background: spec.padColor, position: 'centre', withoutEnlargement: true })`, затем `.jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true })` или `.png({ compressionLevel: 9 })`.

Качество 88 и `4:4:4` не случайны: торцевой узор это высокочастотная геометрия с резкими границами пород, и стандартный `4:2:0` даёт цветные ореолы на стыках орех/клён. Это ровно та деталь, ради которой продают доску.

Проверка `maxBytes`: если результат тяжелее лимита площадки, понижаем `quality` шагами 88 -> 80 -> 72 -> 64 и пересобираем. Ниже 64 не опускаемся, вместо этого уменьшаем размер на 15%. Функция `fitUnderBytes(buffer, spec)` в том же файле.

Новые зависимости: `sharp` (кроп на сервере) и `fflate` (zip). `fflate` вместо `jszip`: 8 КБ против 100 КБ, синхронный `zipSync` на буферах, без промежуточных строк.

### 7.4 Маршрут скачивания пака

Server action файл отдать не может: он возвращает сериализуемое значение, не поток. Значит нужен route handler, и это не обходной манёвр, а правильный инструмент.

Файл: `app/api/promo/pack/[seriesId]/route.ts`

```ts
export const maxDuration = 60
export const runtime = 'nodejs'

/**
 * Отдаёт zip с отобранными кадрами, перекропленными под площадку.
 *
 * GET, а не POST, сознательно: браузер должен уметь скачать это обычной
 * ссылкой (<a href download>), без fetch + Blob + createObjectURL. Скачивание
 * через JS ломается в трети мобильных браузеров и не показывает прогресс.
 *
 * Параметры в query, потому что GET:
 *   ?market=ozon           - обязательный, из MARKETPLACE_IDS
 *   &shots=uuid,uuid,uuid  - обязательный, до 30 штук
 *   &format=jpeg|png       - необязательный, по умолчанию из спеки площадки
 *
 * Авторизация обычная, по cookie-сессии: RLS на promo_shots не даст прочитать
 * чужие кадры, но проверку владения делаем и явно - полагаться на одну RLS
 * в маршруте, отдающем байты, мало.
 *
 * Никакой платы: кроп это операция над уже оплаченными кадрами. Скачивать
 * один и тот же пак под шесть площадок можно бесплатно и сколько угодно раз.
 */
export async function GET(
  req: Request,
  ctx: { readonly params: Promise<{ readonly seriesId: string }> },
): Promise<Response>
```

Алгоритм:

1. Сессия, иначе 401.
2. Разбор query zod-схемой `packQuerySchema`. Больше 30 id - 400.
3. `select * from promo_shots where id = any(?) and user_id = ? and status = 'done'`. Мало строк - работаем с тем, что нашли, но если ноль - 404.
4. Скачиваем объекты из `promo-assets` service-ключом (не signed URL: мы уже на сервере).
5. `cropForMarketplace` на каждый, последовательно. 30 кадров по ~200 мс это 6 секунд, влезает в 60.
6. Имена файлов: `{ordinal}-{kindSlug}{variantSuffix}-{width}x{height}.{ext}`, например `01-hero-1200x1600.jpg`, `03-island-v2-1200x1600.jpg`. Порядковый номер с ведущим нулём, чтобы файловый менеджер сортировал правильно.
7. Кладём в архив `README.txt` с названием проекта, площадкой, датой, списком кадров и строкой «Требования площадки проверьте в кабинете продавца» для неподтверждённых площадок.
8. `zipSync` из `fflate`, уровень 0 (JPEG уже сжат, deflate над ним это трата процессора без выигрыша).
9. Ответ:

```
Content-Type: application/zip
Content-Disposition: attachment; filename="endgrain-{slug}-{market}.zip"; filename*=UTF-8''...
Content-Length: <bytes>
Cache-Control: private, no-store
```

Имя файла через `filename*=UTF-8''` обязательно: имя проекта бывает русским, и `filename=` без кодирования даст мусор.

### 7.5 Ограничение по времени и большие паки

30 кадров в 2000x2000 это ~6 секунд кропа и ~40 МБ ответа. Влезает. Но 30 кадров это потолок площадок, и его надо соблюсти явно:

- в query не больше `spec.image.maxImages` id, лишние отсекаются с предупреждением в `README.txt`;
- если суммарный размер архива превысил 100 МБ, понижаем качество всех кадров на шаг и пересобираем один раз; дальше отдаём как есть.

Стриминга нет намеренно: `Content-Length` полезнее прогресса, потому что браузер показывает честный процент скачивания вместо бесконечного спиннера.

### 7.6 UI пака

`components/promo/PackDownload.tsx`, `data-testid="promo-pack"`.

- `data-testid="promo-marketplace-select"` - селектор площадки, список из `marketplacesFor(locale)`.
- `data-testid="promo-pack-sizes"` - строка под ним: «Ozon: 1200x1600, 3:4, JPEG, до 10 МБ, до 30 фото». Меняется при смене площадки.
- `data-testid="promo-pack-unconfirmed"` - сноска для `confirmed: false`: «Требования собраны из открытых источников. Перед публикацией сверьтесь с кабинетом продавца.» со ссылкой на `sourceUrl`.
- `data-testid="promo-select-all"` - «Выбрать все» / «Снять всё».
- `data-testid="promo-pack-download"` - **обычная ссылка `<a>`**, не кнопка с onClick. `href` собирается из выбранных id. Отключена (`aria-disabled`, без href), пока не выбран ни один кадр.
- `data-testid="promo-pack-count"` - «Выбрано 5 кадров из 6».

---

## 8. SEO-описание под площадку

### 8.1 Где хранится

Таблица `promo_listings`, одна строка на пару `(project_id, marketplace)` (уникальный индекс `promo_listings_project_marketplace_idx`). Вторая генерация под ту же площадку **переписывает** строку, а не плодит дубль.

Поля: `title`, `description`, `bullets text[]`, `tags text[]`, плюс `selected_shot_ids uuid[]` - какие кадры человек отобрал под эту площадку.

### 8.2 Связь с кадрами

Двусторонняя и осмысленная:

- **Кадры -> текст.** При генерации текста в промпт уходит не только описание доски, но и список сцен отобранных кадров: «на фото доска на кухонном острове, макро торца, в упаковке». Модель пишет описание под то, что человек реально покажет, а не абстрактно.
- **Текст -> кадры.** `selected_shot_ids` это тот же набор, что уходит в zip-пак. Отметил кадры - отметились и для пака, и для текста. Один выбор, два потребителя. Это лечит расхождение «в описании обещал кухню, а в паке кухни нет».

### 8.3 Действия

`app/actions/listing.ts` расширяется:

```ts
/** Читает сохранённую карточку. Нет строки - возвращает пустую заготовку под площадку. */
export async function readListingAction(input: {
  readonly projectId: string
  readonly marketplace: MarketplaceId
}): Promise<ActionResult<PromoListingView>>

/**
 * Генерирует текст под площадку. Стоит 1 кадр по общему счётчику: это
 * обращение к модели, и делать вид, что оно бесплатное, нечестно.
 * Результат НЕ сохраняется автоматически: человек сначала смотрит и правит.
 */
export async function generateListingAction(input: {
  readonly projectId: string
  readonly marketplace: MarketplaceId
  readonly shotIds: readonly string[]
  readonly walletRef: string
}): Promise<ActionResult<PromoListingDraft>>

/** Сохраняет карточку целиком, включая ручные правки. Upsert по (project_id, marketplace). */
export async function saveListingAction(input: {
  readonly projectId: string
  readonly marketplace: MarketplaceId
  readonly title: string
  readonly description: string
  readonly bullets: readonly string[]
  readonly tags: readonly string[]
  readonly selectedShotIds: readonly string[]
}): Promise<ActionResult<PromoListingView>>
```

### 8.4 Правила площадок для текста

`lib/promo/marketplaces.ts` (тот же файл, что и размеры картинок):

```ts
export interface MarketplaceListingRules {
  readonly titleMax: number
  readonly descriptionMax: number
  readonly bulletCount: number
  readonly bulletMax: number
  readonly tagCount: number
  readonly tagMax: number
  /** Разрешена ли HTML-разметка в описании. */
  readonly htmlDescription: boolean
}
```

Лимиты берутся из справочников площадок (см. таблицу раздела 7 и источники там же). Ставить их «на глаз» запрещено: если для конкретной площадки лимит не подтверждён источником, ставим консервативное значение и помечаем в коде комментарием `// не подтверждено официальным источником, консервативная оценка`.

### 8.5 UI

Компонент `components/promo/ListingEditor.tsx` заменяет `ListingPanel.tsx`.

- `data-testid="promo-listing"` - секция.
- `data-testid="listing-marketplace"` - селектор площадки (общий со списком паков, один источник истины из стора `promo.marketplace`).
- `data-testid="listing-title"` - редактируемое поле заголовка со счётчиком «84 / 200».
- `data-testid="listing-description"` - textarea со счётчиком.
- `data-testid="listing-bullets"` - список редактируемых строк, кнопка «+ буллет».
- `data-testid="listing-tags"` - поле тегов через запятую со счётчиком.
- `data-testid="listing-generate"` - «Сгенерировать текст» (с ценой в 1 кадр под кнопкой).
- `data-testid="listing-save"` - «Сохранить». Меняется на «Сохранено» на 2 секунды после успеха.
- `data-testid="listing-copy-all"` - копирует всё одним блоком.
- Счётчик, превысивший лимит площадки, красный, и «Сохранить» при этом всё равно активна (лимиты площадок меняются, блокировать сохранение из-за нашего справочника нельзя).

Поля остаются с кнопками копирования по одному - это правильное решение существующего `CopyField.tsx`, сохранить.

---

## 9. Мерч: что чинить

### 9.1 Три состояния вместо тишины

Дефекты D10 и D11 лечатся одной таблицей состояний. Файл: `components/promo/MerchMockups.tsx`.

| Условие | Кнопка «Собрать мокапы» | Что показываем |
|---------|-------------------------|----------------|
| `printfulConfigured === false` | **скрыта** | Плашка `data-testid="merch-not-configured"`: «Настоящие мокапы на товарах включатся, когда владелец подключит Printful. Пока это компоновка узора - её можно скачать и использовать.» Силуэты остаются. |
| настроен, `access.state` не даёт мерч (`free`, `trial`, `trialSpent`, `anonymous`) | видна, **disabled** | `AiGateNote` с замком и причиной, `data-testid="merch-gate"`. Для `trial` отдельный текст: «Мокапы мерча входят в Pro» + ссылка на тарифы. |
| настроен, Pro | активна | обычная работа |

Правка `AiGate.tsx`: `useAiGate` получает обязательный аргумент фичи.

```ts
/**
 * feature обязателен: без него хук не знает, входит ли фича в пробный тир,
 * и рисует trial-состояние как незапертое для всего подряд. Ровно так
 * кнопка мокапов оказывалась активной у trial-пользователя (дефект D11).
 */
export function useAiGate(feature: AiFeature, remainingOverride: number | null = null): AiGateView
```

Внутри, в ветке `case 'trial'`:

```ts
case 'trial':
  // Фича не входит в пробный тир: замок с причиной, а не активная кнопка.
  if (!AI_TRIAL_FEATURES.includes(feature)) {
    return { locked: true, noteKey: 'ai.gate.notPro', params, showPricing: true, showPaywall: false, access: ai }
  }
  return { locked: false, noteKey: 'ai.trial.left', params, showPricing: false, showPaywall: false, access: ai }
```

Все вызовы обновляются: `PhotoSeries` -> `useAiGate('promoShots')`, `ReferenceShots` -> `useAiGate('referenceShots')`, `MerchMockups` -> `useAiGate('merchMockups')`, `ListingEditor` -> `useAiGate('saleListing')`.

Правка ветки `denied` в `MerchMockups.tsx:100-109`: `noteKey` больше не сваливается в `merch.idle` при `denied`. Вместо этого рисуется блок ошибки:

```tsx
{result?.denied !== undefined ? (
  <p data-testid="merch-denied" role="alert" className="...error...">
    {t(locale, `ai.gate.${result.denied}`)}
  </p>
) : null}
```

Правка блока ошибки на `:175`: условие `result.error !== 'notConfigured'` убирается. `notConfigured` теперь не «намеренно спрятан», а показывается своей плашкой (первая строка таблицы выше), потому что скрытая причина это и есть дефект.

### 9.2 Сохранение мокапов

Сегодня мокап это URL на CDN Printful в `useState`. Ссылка протухает, состояние теряется. Лечение:

`createMerchMockupsAction` после получения `MerchMockup[]`:

1. Создаёт `promo_series` с `source='merch'`, `quota_units=0`, `spent_cents=0`.
2. На каждый мокап: `fetch(mockup.url)` -> заливает в `promo-assets` -> строка `promo_shots` с `kind_slug = 'merch:tshirt'`, `provider='printful'`, `status='done'`.
3. Возвращает `PromoShotView[]` вместо `MerchMockup[]`.

Мокапы попадают в общую галерею, общий выбор и общий zip. Отдельного хранилища для них нет и не надо.

### 9.3 Где брать ключи

`PRINTFUL_API_KEY`: кабинет Printful -> Settings -> Developers -> создать private token со scope `mockup-generator`. Токен уровня store не требует заголовка `X-PF-Store-Id`; токен уровня account требует, и тогда нужен `PRINTFUL_STORE_ID`.

`PRINTFUL_STORE_ID`: тот же кабинет, Stores -> id магазина. Магазин через API не создаётся, только руками. Без магазина токен уровня аккаунта отвечает «This endpoint requires store_id» (это уже задокументировано в `lib/promo/config.ts`, не переоткрывать).

Оба уезжают в Vercel Environment Variables проекта, scope Production + Preview. `NEXT_PUBLIC_` у них не будет никогда.

### 9.4 Флаг «фича включится, когда владелец добавит ключ»

Уже есть `isPrintfulConfigured()`. Нужно только протащить его в клиент как проп через серверный layout (сегодня клиент узнаёт о нём только из ответа действия, то есть после нажатия кнопки - это и есть корень D10).

Файл: `components/ProProvider.tsx` расширяется полем `printfulEnabled: boolean`, считается в `app/layout.tsx` через `isPrintfulConfigured()`. Компонент решает, что показывать, **до** первого клика.

---

## 10. Этапы работ

### P0: без этого запускаться нельзя

Критерий P0: «человек платит и не теряет результат», «человек понимает, что происходит». Всё остальное подождёт.

| # | Работа | Файлы | Проверка |
|---|--------|-------|----------|
| P0-1 | Миграции: `promo_series`, `promo_shots`, `promo_listings`, bucket `promo-assets`, `settle_promo_series`, `frame_packs` | `supabase/migrations/20260815100000_promo_assets.sql`, `...110000_promo_series_settle.sql`, `...120000_frame_packs.sql` | `supabase db push` без ошибок; `get_advisors` без новых замечаний по RLS |
| P0-2 | `projectId` в сторе + `upsertProjectAction` (лечение D12, D13) | `lib/store/studio.ts`, `lib/store/persist.ts`, `app/actions/projects.ts`, `components/ProjectsPanel.tsx` | unit: два подряд «Сохранить» дают одну строку в `projects` |
| P0-3 | Job-путь: `createPromoSeriesAction` + `POST /api/promo/shot` + `lib/promo/runner.ts`. Удаление `generatePromoShotsAction`/`runSeries` (лечение D2, D5, D6) | `app/actions/promo.ts`, `app/api/promo/shot/route.ts`, `lib/promo/runner.ts` | e2e: 6 кадров доезжают по одному, ни один запрос не длиннее 60 с |
| P0-4 | Сохранение кадров в Storage + чтение серий из базы (лечение D1, D2, D3) | `lib/promo/assets.ts`, `app/actions/promo.ts` | e2e: сгенерировал, ушёл в «Редактор», вернулся - кадры на месте; перезагрузил страницу - на месте |
| P0-5 | Экономика: `lib/promo/pricing.ts`, единый счётчик, списание кошелька, пропорциональный возврат | `lib/promo/pricing.ts`, `app/actions/promo.ts`, `components/promo/FrameBudget.tsx` | unit: 12 заказано, 4 вышло -> возврат за 8; двойной клик с тем же ref -> одно списание |
| P0-6 | Прогресс: per-frame статусы, скелетоны, отмена, повтор (лечение D7, D8) | `components/promo/PhotoSeries.tsx`, `components/promo/ShotCard.tsx`, `lib/store/promo.ts` | e2e: видны 6 скелетонов сразу; отмена возвращает деньги |
| P0-7 | Мерч: три честных состояния, `useAiGate(feature)` (лечение D10, D11) | `components/promo/MerchMockups.tsx`, `components/promo/AiGate.tsx`, `components/ProProvider.tsx` | e2e: без ключа кнопки нет и есть плашка; trial видит замок |
| P0-8 | Reaper: `GET /api/promo/reap` + Vercel Cron | `app/api/promo/reap/route.ts`, `vercel.json` | unit: `running` старше 5 минут -> `failed` + возврат |
| P0-9 | Проектная плашка в промо-панели: селектор, автосохранение перед генерацией, ссылка на проект | `components/promo/ProjectContextBar.tsx`, `lib/promo/useProjectGuard.ts` | e2e: аноним видит приглашение войти; после генерации видна плашка «сохранено в проекте X» |

### P1: то, ради чего это переделывалось

| # | Работа | Проверка |
|---|--------|----------|
| P1-1 | Скачать паком: `GET /api/promo/pack/[seriesId]`, zip, кроп под площадку, выбор кадров (лечение D4) | e2e: zip скачался, внутри N файлов нужного размера |
| P1-2 | Селектор площадки, справочник `lib/promo/marketplaces.ts`, русские площадки только при `locale==='ru'` | unit: en-локаль не показывает Ozon/WB/ЯМ |
| P1-3 | «Изменить кадр»: `editPromoShotAction`, варианты в галерее, оба кадра остаются | e2e: после правки в галерее два кадра, оба выбираемы |
| P1-4 | Редактор промта: показ итогового промпта, правка сцены, `checkScene` (лечение D9) | unit: `checkScene` режет длинное и блокирует стоп-паттерны |
| P1-5 | `ListingEditor`: SEO под площадку, сохранение в `promo_listings`, ручные правки | e2e: сгенерировал, поправил, сохранил, перезагрузил - текст на месте |
| P1-6 | Пакеты кадров в Stripe Checkout + маппинг в вебхуке через `frame_packs` | ручной тест на тестовом ключе Stripe: купил $5 - в кошельке $6 |

### P2: полировка

| # | Работа |
|---|--------|
| P2-1 | Мокапы мерча в общую галерею и общий zip |
| P2-2 | «Свой пресет»: `kind_slug='custom'`, пустая сцена, человек пишет с нуля |
| P2-3 | История серий по проекту: список прошлых генераций со свёрткой |
| P2-4 | Пресеты кропа под соцсети (Instagram 4:5, Pinterest 2:3) в дополнение к маркетплейсам |
| P2-5 | Уборка Storage при удалении проекта (сегодня `on delete cascade` уносит строки, но не объекты) |

### Порядок PR

1. PR-1: P0-1 + P0-2 (база и проекты, ничего не ломает)
2. PR-2: P0-3 + P0-4 + P0-5 (новый платный путь целиком, старый удаляется)
3. PR-3: P0-6 + P0-9 (фронт)
4. PR-4: P0-7 + P0-8 (мерч и reaper)
5. PR-5: P1-1 + P1-2 (паки)
6. PR-6: P1-3 + P1-4 (правка кадра и промпт)
7. PR-7: P1-5 + P1-6 (SEO и деньги)

Разрывать PR-2 на части нельзя: между удалением старого пути и введением нового не должно быть коммита, в котором платная генерация работает наполовину.

---

## 11. Тесты

### 11.1 Unit (vitest)

| Файл | Что проверяет |
|------|---------------|
| `lib/promo/pricing.test.ts` | `framesFromBalance`, `frameChargeCents`, границы: 0 баланса, 19 центов -> 0 кадров |
| `lib/promo/promptGuard.test.ts` | `checkScene`: длина, каждый стоп-паттерн, пустая строка, нормальный текст проходит |
| `lib/promo/marketplaces.test.ts` | у каждой площадки заполнены все поля; ru-only площадки помечены; аспекты в допустимом диапазоне |
| `lib/promo/crop.test.ts` | кроп 1:1 -> 3:4 не режет центр; паддинг белым для площадок с белым фоном |
| `lib/promo/runner.test.ts` | не больше `SHOT_CONCURRENCY` одновременно; отмена не запускает новые |
| `lib/store/promo.test.ts` | `upsertShot` не теряет варианты; `selectAll` берёт только `done` |
| `lib/store/studio.test.ts` (дополнить) | `projectId` сбрасывается на хэш-ссылке и на `resetStudio`, сохраняется на правке |

### 11.2 E2E (playwright)

Файл: `e2e/promo-studio.spec.ts` (новый; существующий `e2e/promo.spec.ts` переписывается под новый путь).

| Сценарий | Ключевые testid |
|----------|-----------------|
| Аноним видит приглашение войти вместо генерации | `promo-project-anon` |
| Счётчик кадров виден до нажатия и совпадает с ценой | `promo-frames-left`, `promo-cost` |
| Генерация рисует скелетоны немедленно | `promo-shot-queued` x N |
| Кадры доезжают по одному | `promo-shot-done` |
| Уход на другую вкладку и возврат не теряет кадры | `promo-gallery` |
| Перезагрузка страницы не теряет кадры | `promo-gallery` |
| Отмена возвращает деньги и показывает честный текст | `promo-cancel`, `promo-partial-note` |
| Повтор упавшего кадра | `promo-shot-failed`, кнопка внутри |
| Правка кадра даёт два кадра, а не один | `promo-variants-*` |
| Скачивание пака отдаёт zip | `promo-pack-download` |
| Смена площадки меняет список размеров | `promo-marketplace-select`, `promo-pack-sizes` |
| Русские площадки не видны в en-локали | `promo-marketplace-select` |
| Мерч без ключа: кнопки нет, плашка есть | `merch-not-configured` |
| Мерч в trial: замок с причиной | `merch-gate` |
| SEO-текст сохраняется и переживает перезагрузку | `listing-save`, `listing-title` |

Все e2e гоняются в демо-режиме (без ключей провайдеров), где `mockProvider` отдаёт детерминированный PNG. Платный путь проверяется на моке кошелька: `wallet_topup` под service-ключом в фикстуре.

---

## 12. Что нужно от владельца руками

Всё ниже агент сделать не может: это учётные записи, деньги и чужие кабинеты. Разложено по срочности: без блока A промо-студия не запустится вовсе, без B запустится в демо-режиме, C это удобство.

### A. Обязательно до запуска

**A1. Supabase: применить миграции.**
Три файла из раздела 2 плюс правка `promo_shots` из 5.4 (колонка `retries`). Команда: `supabase db push` при настроенном линке, либо применить через панель SQL Editor по одному файлу в порядке имён.
После применения проверить: в Storage появился bucket `promo-assets`, приватный (не public), лимит 8 МБ.
Затем прогнать advisors и убедиться, что новых замечаний по RLS нет.

**A2. Stripe: пакеты кадров.**
Отдельные Price-объекты **не нужны**: `createTopUpCheckoutAction` уже работает с инлайновым `price_data` (`app/actions/wallet.ts:21`). Нужно только:
- убедиться, что `STRIPE_SECRET_KEY` и `STRIPE_WEBHOOK_SECRET` заведены в Vercel для Production;
- в дашборде Stripe -> Developers -> Webhooks проверить, что эндпоинт указывает на `https://<домен>/api/stripe/webhook` и подписан на `checkout.session.completed`;
- сделать **один тестовый платёж** на $2 в тестовом режиме и убедиться, что в `wallet_transactions` появилась строка `topup` на 200 центов. Сегодня в этой таблице 0 строк, то есть путь никогда не проверялся живьём. Это самый рискованный непроверенный участок во всём проекте.

**A3. Решить вопрос с себестоимостью кадра.**
В спеке зашито `FRAME_COST_CENTS = 8` со слов владельца. Перед запуском проверить по счёту fal.ai фактическую цену одного вызова `fal-ai/nano-banana-2/edit` в 1К. Если реальная цена выше 8 центов, наценка x2.5 съедается, и пакет «100 кадров за $15» становится убыточным. Цифру подтвердить или поправить в `lib/promo/pricing.ts` до первого платежа, а не после.

**A4. Vercel: включить Cron.**
Reaper (раздел 4.7) без крона не работает, и брошенные серии не будут возвращать деньги. Добавить в `vercel.json` расписание и завести переменную `CRON_SECRET` (любая случайная строка на 32 символа). На плане Hobby крон запускается раз в сутки, а не раз в 15 минут - если проект на Hobby, либо апгрейд, либо принять суточную задержку возврата и написать об этом в тексте плашки.

### B. Чтобы фичи вышли из демо-режима

**B1. `FAL_KEY`** - без него всё рисуется мок-провайдером. Кабинет fal.ai -> Keys. Пополнить баланс: nano banana 2 работает по предоплате.

**B2. `PRINTFUL_API_KEY` и `PRINTFUL_STORE_ID`** - мерч. Порядок: завести магазин в кабинете Printful (через API магазин не создаётся), затем Settings -> Developers -> создать private token со scope `mockup-generator`. Если токен уровня store, `PRINTFUL_STORE_ID` не нужен; если уровня account - нужен, иначе Printful отвечает «This endpoint requires store_id».
До появления ключей блок мерча честно показывает плашку из 9.1 - это рабочее состояние, а не поломка.

**B3. `GEMINI_API_KEY`** - нужен для двух вещей: fallback генерации кадров при падении fal и текст карточки товара (`generateListingAction`). Без него SEO-блок работает на `demoListing`, то есть на детерминированной заглушке. Известный блокер: Gemini требует предоплату, счёт пуст. Если решение - не платить, надо явно выбрать: либо SEO-текст остаётся заглушкой, либо его переводим на fal (там есть текстовые модели) - это отдельная задача, в этой спеке её нет.

**B4. `FREE_TRIAL_SECRET`** - любая случайная строка на 32+ символа. Без неё пробный тир выключен целиком и гость не увидит ни одного кадра.

### C. Проверить руками перед публичным запуском

**C1. Сверить требования площадок.** Из шести площадок первоисточником подтверждена одна (Яндекс.Маркет). Для Wildberries публичной документации не существует вовсе. Владельцу нужно один раз зайти в кабинеты продавца WB и Ozon и сверить четыре цифры: минимальный размер, рекомендуемый размер, максимальный вес, максимальное число фото. Расхождения внести в `lib/promo/marketplaces.ts` и переключить `confirmed: true`. Пока не сверено - в UI висит сноска, и это правильно.

**C2. Прогнать полный сценарий за живые деньги.** Один раз, своим аккаунтом: купить пакет на $2, сгенерировать 6 кадров, убить один принудительно (например, выключить сеть посреди), убедиться что деньги за него вернулись в `wallet_transactions`, скачать пак, открыть zip. Это единственная проверка, которая ловит расхождение между спекой и реальностью в бухгалтерии.

**C3. Решить про удержание Storage.** Кадры лежат вечно и стоят денег. Сегодня политики срока жизни нет. Варианты: (а) хранить вечно и заложить в цену, (б) удалять кадры старше 90 дней у не-Pro, (в) удалять вместе с проектом (это уже работает через `on delete cascade`, но объекты в bucket остаются - см. P2-5). Решение владельца нужно до запуска, потому что от него зависит текст в интерфейсе: обещать «навсегда» и потом удалить хуже, чем сразу написать «90 дней».

### D. Переменные окружения: итоговый список

| Переменная | Обязательна | Где взять | Scope в Vercel |
|------------|-------------|-----------|----------------|
| `FAL_KEY` | для настоящей генерации | fal.ai -> Keys | Production, Preview |
| `GEMINI_API_KEY` | для SEO-текста и fallback | Google AI Studio | Production, Preview |
| `PRINTFUL_API_KEY` | для мерча | Printful -> Developers | Production |
| `PRINTFUL_STORE_ID` | если токен уровня account | Printful -> Stores | Production |
| `FREE_TRIAL_SECRET` | для пробного тира | сгенерировать, 32+ символа | Production, Preview |
| `CRON_SECRET` | для reaper | сгенерировать, 32+ символа | Production |
| `STRIPE_SECRET_KEY` | уже есть | Stripe | Production |
| `STRIPE_WEBHOOK_SECRET` | уже есть, проверить | Stripe -> Webhooks | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | уже есть | Supabase -> API | Production, Preview |

Ни одна из них не получает префикс `NEXT_PUBLIC_`. Ни при каких обстоятельствах.

Известный подвох из прошлого опыта проекта: `vercel env pull` врёт про пустые значения. Проверять наличие переменной надо в веб-панели Vercel, а не по локальному `.env.local`.
