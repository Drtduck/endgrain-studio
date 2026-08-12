-- Публичный bucket под макеты для Printful Mockup Generator.
--
-- Почему публичный, а не приватный с signed URL, как feedback-attachments:
-- Printful тянет файл макета со своей стороны, обычным GET без наших заголовков,
-- и data:URI не принимает вовсе. Signed URL формально тоже https, но он несёт
-- подпись в query, живёт по таймеру и попадает в логи Printful целиком, а сам
-- объект всё равно доступен любому, кто эту ссылку получил. То есть приватность
-- тут мнимая, а сложности настоящие. Поэтому bucket честно публичный на чтение,
-- а защита строится иначе: писать может только service-ключ, имя объекта
-- случайное, и файл удаляется сразу после того, как Printful отдал мокапы.

-- 1. Bucket ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promo-mockups',
  'promo-mockups',
  true,
  -- 4 МБ: рендер доски в 1500 px весит сотни килобайт, запас на дробный узор.
  4194304,
  -- Только PNG: в Printful уходит рендер нашего же узора, ничего другого сюда
  -- класть не за чем, а лишний тип это лишняя поверхность для загрузки чужого.
  array['image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Политики ----------------------------------------------------------------

-- Читать может кто угодно, включая анонима: ровно за этим bucket и заводился,
-- Printful приходит за файлом без всякой авторизации.
drop policy if exists promo_mockups_public_read on storage.objects;
create policy promo_mockups_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'promo-mockups');

-- Писать и удалять не может никто из клиентов. Ни anon, ни authenticated:
-- иначе получился бы бесплатный публичный файлохостинг на нашем домене.
-- Загружает и убирает за собой только server action под service-ключом,
-- а service-ключ RLS обходит и в политиках не нуждается.
drop policy if exists promo_mockups_insert_own on storage.objects;
drop policy if exists promo_mockups_update_own on storage.objects;
drop policy if exists promo_mockups_delete_own on storage.objects;

-- 3. Уборка ------------------------------------------------------------------

-- Уборка живёт в коде (lib/promo/storage.ts), а не в SQL-функции, и это не лень.
-- Supabase запрещает прямой delete из storage.objects даже под service-ключом:
--   42501 «Direct deletion from storage tables is not allowed. Use the Storage
--   API instead» (проверено на живом проекте 12.08.2026).
-- Поэтому объекты сносятся через Storage API: свой сразу после ответа Printful,
-- забытые чужие ленивым проходом list + remove по префиксу пользователя.
-- Если такая функция осталась от прежней попытки, её здесь и убираем.
drop function if exists public.purge_promo_mockups(int);
