-- Публичный bucket под print-файлы заказов мерча (спека merch-orders.md, §3.3).
--
-- Тот же приём, что в 20260812150000_promo_mockups_bucket.sql: Printful
-- забирает файл обычным GET со своей стороны и никакой авторизации не
-- поддерживает, значит объект должен быть публично читаемым. Приватность
-- строится не через RLS на чтение, а через неугадываемое имя объекта:
-- путь `{user_id или anon}/{orderId}.png`, где orderId - uuid из
-- merch_orders.id (спека §5.1), то есть случайное значение, не порядковый
-- номер.
--
-- TTL здесь другой, чем у промо-мокапов (90 дней вместо 60 минут), и это
-- не описка. Заказ мерча создаётся черновиком (Stripe Checkout ещё не
-- оплачен), а Printful заберёт файл не в момент рендера, а в момент
-- подтверждения заказа в вебхуке - это может случиться через сутки.
-- Снести файл раньше значит гарантированно получить у Printful
-- «file failed to download» на уже оплаченном заказе.

-- 1. Bucket ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'merch-prints',
  'merch-prints',
  true,
  -- 20 МБ: печатный файл 4000x4000 PNG на крупнозернистом узоре может
  -- ощутимо превышать вес мокапного 1500 px рендера из promo-mockups.
  20971520,
  -- Только PNG: в Printful уходит серверный рендер нашего же узора,
  -- ничего другого сюда класть незачем.
  array['image/png']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Политики ----------------------------------------------------------------

-- Читать может кто угодно, включая анонима: Printful приходит за файлом без
-- всякой авторизации, и это ровно та причина, по которой bucket публичный.
drop policy if exists merch_prints_public_read on storage.objects;
create policy merch_prints_public_read
  on storage.objects for select
  to public
  using (bucket_id = 'merch-prints');

-- Писать и удалять не может никто из клиентов. Ни anon, ни authenticated:
-- print-файл рисуется и заливается только сервером (server action
-- createMerchCheckoutAction, спека §4.1) под service-ключом, который RLS
-- обходит и в политиках не нуждается.
drop policy if exists merch_prints_insert_own on storage.objects;
drop policy if exists merch_prints_update_own on storage.objects;
drop policy if exists merch_prints_delete_own on storage.objects;

-- 3. Уборка ------------------------------------------------------------------

-- purge_merch_prints(): возвращает пути объектов bucket merch-prints старше
-- MERCH_PRINTS_TTL_DAYS (90, lib/merch/print.ts). Функция ТОЛЬКО читает и
-- ничего не удаляет сама - у Supabase прямой delete из storage.objects
-- запрещён даже под service-ключом (42501 «Direct deletion from storage
-- tables is not allowed. Use the Storage API instead», задокументировано и
-- проверено на живом проекте в 20260812150000_promo_mockups_bucket.sql,
-- где по этой же причине покойный purge_promo_mockups в итоге дропнут, а
-- уборка живёт в коде через list + remove). Повторять ту же ошибку здесь
-- незачем: функция даёт список кандидатов на удаление одним запросом,
-- а сам remove() вызывает суточный крон тем же способом, что и промо-уборка
-- (Vercel Cron, план Hobby - только суточное расписание).
drop function if exists public.purge_merch_prints(int);
create function public.purge_merch_prints(ttl_days int default 90)
returns table (path text)
language sql
security definer
set search_path = storage, public
as $$
  select name
  from storage.objects
  where bucket_id = 'merch-prints'
    and created_at < now() - make_interval(days => ttl_days);
$$;

comment on function public.purge_merch_prints(int) is
  'Список путей merch-prints старше ttl_days. Сама не удаляет (Storage API-only delete) - вызывающий код обязан пройтись storage.remove() по результату.';
