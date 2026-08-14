-- Профиль пользователя: публичная витрина автора (/u/[id]) плюс приватная
-- настройка уведомлений. Одна строка на пользователя, первичный ключ - сам
-- user_id, по образцу public.wallets (миграция 20260813110000).

create table if not exists public.profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  bio           text,
  website       text,
  notify_email  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_display_name_len check (display_name is null or char_length(display_name) between 2 and 40),
  constraint profiles_bio_len check (bio is null or char_length(bio) <= 280),
  constraint profiles_website_len check (website is null or char_length(website) <= 200),
  -- Только http(s): без этого website превратился бы в открытый редирект
  -- javascript:/data: под видом ссылки на сайт мастера.
  constraint profiles_website_scheme check (website is null or website ~* '^https?://')
);

comment on table public.profiles is 'Публичный профиль автора (display_name/bio/website) плюс приватная настройка notify_email';

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;

-- Публичная страница /u/[id] и «как меня видят авторы в галерее» читаются
-- анонимом: RLS открыт на select всем строкам, колонки режутся column-grant'ом ниже.
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select to anon, authenticated
  using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Политики delete нет: строка живёт и умирает вместе с auth.users через каскад.

-- Column-grants тем же приёмом, что и published_projects (миграция 20260813100000):
-- полный revoke, затем явный список колонок. anon не должен увидеть даже
-- notify_email чужого человека, а authenticated не должен мочь потрогать
-- user_id/created_at чужой или своей строки через сырой update.
revoke select on public.profiles from anon;
grant select (user_id, display_name, bio, website, created_at) on public.profiles to anon;

revoke select on public.profiles from authenticated;
grant select (user_id, display_name, bio, website, notify_email, created_at, updated_at) on public.profiles to authenticated;

revoke update on public.profiles from authenticated;
grant update (display_name, bio, website, notify_email) on public.profiles to authenticated;

revoke insert on public.profiles from authenticated;
grant insert (user_id, display_name, bio, website, notify_email) on public.profiles to authenticated;
