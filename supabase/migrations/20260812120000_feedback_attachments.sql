-- Вложения обратной связи: приватный bucket под файл пользователя и
-- автоскриншот экрана плюс колонки в public.feedback под signed URL.
-- Ссылки живут 30 дней и подписываются на сервере service-ключом, поэтому
-- политик на чтение объектов здесь нет и быть не должно.

-- 1. Bucket ------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments',
  'feedback-attachments',
  false,
  2097152, -- 2 МБ, тот же предел проверяет клиент и zod-схема server action
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Загрузку делает server action под service-ключом, а он RLS обходит. Политика
-- ниже нужна на случай, если когда-нибудь класть файл будет сам браузер:
-- залогиненный пользователь пишет только в папку со своим id и никуда больше.
drop policy if exists feedback_attachments_insert_own on storage.objects;
create policy feedback_attachments_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Чтения нет ни у anon, ни у authenticated: файл выдаётся только по signed URL.
-- Отдельная политика select тут была бы дырой - зная путь, любой залогиненный
-- пользователь подписал бы себе чужое вложение.
drop policy if exists feedback_attachments_select_own on storage.objects;

-- 2. Ссылки в записи обратной связи ------------------------------------------

alter table public.feedback
  add column if not exists attachment_url  text,
  add column if not exists attachment_name text,
  add column if not exists screenshot_url  text;

comment on column public.feedback.attachment_url is 'Signed URL (30 дней) на файл пользователя в bucket feedback-attachments';
comment on column public.feedback.attachment_name is 'Исходное имя файла, очищенное до безопасного вида';
comment on column public.feedback.screenshot_url is 'Signed URL (30 дней) на автоскриншот экрана в bucket feedback-attachments';

alter table public.feedback
  drop constraint if exists feedback_attachment_url_len;
alter table public.feedback
  add constraint feedback_attachment_url_len
  check (attachment_url is null or char_length(attachment_url) <= 2048);

alter table public.feedback
  drop constraint if exists feedback_attachment_name_len;
alter table public.feedback
  add constraint feedback_attachment_name_len
  check (attachment_name is null or char_length(attachment_name) <= 200);

alter table public.feedback
  drop constraint if exists feedback_screenshot_url_len;
alter table public.feedback
  add constraint feedback_screenshot_url_len
  check (screenshot_url is null or char_length(screenshot_url) <= 2048);
