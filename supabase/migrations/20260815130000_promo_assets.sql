-- Промо-студия: сгенерированные ассеты живут в базе и в Storage, а не в useState.
--
-- Три таблицы и один приватный bucket. Смысл каждой:
--   promo_series   - одно нажатие «Сгенерировать»: что просили, чем кончилось.
--   promo_shots    - один кадр. Вариант-правка это тоже кадр, со ссылкой на корневой.
--   promo_listings - SEO-текст карточки под конкретную площадку.
--
-- Байты в bucket promo-assets, здесь только пути: base64 в jsonb это тот же
-- дефект, от которого лечит эта миграция.
--
-- ЭКОНОМИКА (пересмотрено 14.08.2026, отменяет более раннее черновое решение
-- «кадры - производная от долларового баланса кошелька»): кадры теперь
-- отдельный ledger в штуках - public.ai_credits/ai_credit_transactions
-- (миграция 20260815100000_ai_credits.sql, параллельная работа). Причина
-- пересмотра: если хранить кадры центами общего кошелька, купленный пакет
-- кадров можно потратить на генерацию видео с другой наценкой, и пакет начнёт
-- субсидировать чужой продукт. Поэтому promo_series НЕ хранит ни quota_units,
-- ни spent_cents, ни refunded_cents - это был бы второй, рассинхронизирующийся
-- ledger. Резерв и возврат идут ПОШТУЧНО, per-shot, вызовами
-- consume_ai_units/release_ai_units с ref = `${series.wallet_ref}:${shotId}`
-- из route handler POST /api/promo/shot (P0-3, другой агент): один кадр -
-- один consume при захвате в running, один release при провале. Так частичный
-- успех не требует пропорциональной арифметики в этой миграции вовсе: каждый
-- кадр сам по себе атомарен и обратим через готовые функции ai_credits.ts.

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
  -- Сколько кадров заказано и сколько реально вышло. settle_promo_series пересчитывает
  -- оба поля из promo_shots при каждом изменении статуса кадра.
  requested     integer not null,
  succeeded     integer not null default 0,
  failed        integer not null default 0,
  -- База для per-shot ref'ов ledger'а кадров (ai_credit_transactions.ref =
  -- `${wallet_ref}:${shotId}`). Сама серия деньги/кадры не резервирует и не
  -- списывает - это делает route handler на каждый кадр отдельно. Уникальность
  -- нужна для защиты от дублирования серии при двойном клике по кнопке.
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
  constraint promo_series_prompt_len check (user_prompt is null or char_length(user_prompt) <= 2000),
  constraint promo_series_desc_len check (board_desc is null or char_length(board_desc) <= 4000),
  constraint promo_series_error_len check (error is null or char_length(error) <= 200)
);

comment on table public.promo_series is 'Одно нажатие «Сгенерировать» в промо-студии: заказ и исход. Деньги/кадры живут в ai_credit_transactions per-shot, не здесь';
comment on column public.promo_series.wallet_ref is 'База ref для ai_credit_transactions per-shot (`${wallet_ref}:${shotId}`) и защита от дублирования серии двойным кликом';

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
