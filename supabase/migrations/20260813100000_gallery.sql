-- Публичная галерея: неизменяемый снапшот design плюс редактируемая витрина,
-- лайки со счётчиком через триггер, заготовка покупок под фазу 2.

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

/*
 * design это полноценный товар платной публикации, а не деталь оформления:
 * RLS выше проверяет только строки (видна ли публикация вообще), а не колонки,
 * поэтому анонимный или чужой authenticated-клиент с обычным ключом мог
 * запросить design платной работы напрямую через PostgREST/Supabase-клиент,
 * даже не заходя на страницу и не покупая доску. Прячем колонку тем же
 * приёмом, что и update строкой выше: полный revoke select, затем явный
 * список колонок без design.
 */
revoke select on public.published_projects from anon, authenticated;
grant select (
  id, author_id, source_project_id, title, summary,
  price_cents, currency, likes_count, saves_count, status,
  created_at, updated_at
) on public.published_projects to anon, authenticated;
-- Единственный путь к самому design теперь - published_project_design() в самом
-- низу файла: определена после project_purchases, на которую ссылается.

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

-- Покупки. Таблица заводится сразу, наполняется в фазе 2: от неё зависит правило
-- «копировать себе можно бесплатное или купленное», и вводить её потом означало бы
-- переписывать это правило в уже работающем действии.
create table if not exists public.project_purchases (
  id                 uuid primary key default gen_random_uuid(),
  published_id       uuid not null references public.published_projects (id) on delete cascade,
  buyer_id           uuid not null references auth.users (id) on delete cascade,
  -- Автор фиксируется на момент покупки: строка чека не должна зависеть от того,
  -- что произошло с публикацией потом.
  author_id          uuid references auth.users (id) on delete set null,
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

-- Функция для копии проекта из галереи: счётчик копий, тот же довод про права
-- (update на published_projects у authenticated column-grant'ом сужен до title/price_cents/status).
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

/*
 * Единственный путь к полному design: бесплатной работе (price_cents = 0),
 * автору или покупателю. security definer обязателен - design закрыт
 * column-grant'ом на published_projects от anon и authenticated целиком
 * (см. выше), обычная функция упала бы на правах ровно как bump_like_count
 * упала бы без него.
 */
create or replace function public.published_project_design(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price  integer;
  v_author uuid;
  v_status text;
  v_design jsonb;
  v_uid    uuid := auth.uid();
begin
  select price_cents, author_id, status, design
    into v_price, v_author, v_status, v_design
    from public.published_projects
   where id = p_id;

  if v_design is null or v_status = 'removed' then
    return null;
  end if;

  if v_price = 0 or v_author = v_uid then
    return v_design;
  end if;

  if v_uid is not null and exists (
    select 1 from public.project_purchases
     where published_id = p_id and buyer_id = v_uid and status = 'paid'
  ) then
    return v_design;
  end if;

  return null;
end;
$$;

revoke all on function public.published_project_design(uuid) from public;
grant execute on function public.published_project_design(uuid) to anon, authenticated;

-- Триггерную функцию нельзя вызвать через PostgREST RPC (returns trigger),
-- но advisor Supabase ругается на executable-грант: снимаем его явно.
revoke all on function public.bump_like_count() from public, anon, authenticated;
