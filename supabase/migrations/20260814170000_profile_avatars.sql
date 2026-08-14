-- Аватар профиля: колонка avatar_url в public.profiles плюс публичный bucket
-- avatars под картинку, которую человек загружает сам. Без загруженной картинки
-- аватар по-прежнему рисуется инициалом (components/account/Avatar.tsx), поэтому
-- колонка nullable и никакого default у неё нет.

-- 1. Колонка ------------------------------------------------------------------

alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is 'Публичный URL картинки аватара в bucket avatars; null - рисуем инициал';

alter table public.profiles
  drop constraint if exists profiles_avatar_url_len;
alter table public.profiles
  add constraint profiles_avatar_url_len
  check (avatar_url is null or char_length(avatar_url) <= 512);

-- Тот же приём, что profiles_website_scheme (миграция 20260814100000): без
-- проверки схемы колонка стала бы javascript:/data: под видом картинки. Кроме
-- https разрешён относительный путь с ведущим слэшем - это всегда наш домен.
-- Более узкая проверка «свой bucket и своя папка» живёт в server action
-- (app/actions/profile.ts, updateAvatarAction): там известен user_id из сессии.
alter table public.profiles
  drop constraint if exists profiles_avatar_url_scheme;
alter table public.profiles
  add constraint profiles_avatar_url_scheme
  check (avatar_url is null or avatar_url ~ '^(https://|/)');

-- 2. Column-grants -------------------------------------------------------------

-- avatar_url публична ровно как display_name/bio/website: её видит аноним на
-- /u/[id] и в карточках галереи. Гранты переписываются целиком (полный revoke,
-- затем полный список колонок) по образцу миграции 20260814100000 - так список
-- колонок остаётся в одном месте и читается как есть, а не собирается из двух
-- миграций по кускам. notify_email в select по-прежнему нет ни у кого: политика
-- profiles_select_all открыта using(true) на все строки, и приватная настройка
-- уведомлений утекла бы любому вошедшему.
revoke select on public.profiles from anon;
grant select (user_id, display_name, bio, website, avatar_url, created_at) on public.profiles to anon;

revoke select on public.profiles from authenticated;
grant select (user_id, display_name, bio, website, avatar_url, created_at, updated_at) on public.profiles to authenticated;

-- update/insert-гранты authenticated, как и в 20260814100000, практического
-- значения не имеют: профиль пишется service-role клиентом мимо PostgREST-роли
-- (RETURNING upsert'а требует table-level SELECT, которого у authenticated нет
-- и не будет). Список ниже - документация целевой модели privileges, avatar_url
-- добавлена в него по той же причине, что и остальные публичные колонки.
revoke update on public.profiles from authenticated;
grant update (user_id, display_name, bio, website, avatar_url, notify_email) on public.profiles to authenticated;

revoke insert on public.profiles from authenticated;
grant insert (user_id, display_name, bio, website, avatar_url, notify_email) on public.profiles to authenticated;

-- 3. Bucket --------------------------------------------------------------------

-- Публичный на чтение, как promo-mockups (миграция 20260812150000): аватар
-- показывается анониму на /u/[id] и в галерее, signed URL там был бы мнимой
-- приватностью с настоящими сложностями (ссылка живёт по таймеру и всё равно
-- открыта любому, кто её получил). Приватности у аватара нет по определению:
-- это картинка, которой человек сам представляется публично.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  -- 1 МБ: клиент режет картинку до 256x256 PNG (это десятки килобайт), запас
  -- взят на случай сложного изображения с шумом.
  1048576,
  -- Только растр, который умеет отрисовать canvas клиента. SVG тут нет
  -- намеренно: публичный bucket отдаёт его по прямой ссылке со скриптами
  -- внутри, это был бы stored XSS на домене Storage.
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 4. Политики bucket -----------------------------------------------------------

-- Читает кто угодно, включая анонима: ровно за этим bucket и публичный.
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Пишет только владелец и только в свою папку {user_id}/. Загрузка идёт из
-- браузера напрямую в Storage под сессией пользователя (без прокси через наш
-- сервер), поэтому здесь, в отличие от promo-mockups, политики insert/update
-- нужны по-настоящему: первая папка пути обязана совпасть с auth.uid().
drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- update нужен ровно потому, что аватар перезаписывается по фиксированному пути
-- {user_id}/avatar.png: upsert из supabase-js уходит PUT-ом на существующий объект.
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- delete: кнопка «Убрать» возвращает инициал и заодно уносит объект, чтобы
-- публичная ссылка не оставалась живой после отказа от картинки.
drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
