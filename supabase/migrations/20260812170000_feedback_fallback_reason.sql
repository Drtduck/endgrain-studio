-- Причина, по которой обращение легло в таблицу, а не в GitHub issue.
-- Primary-канал обратной связи - issue в репозитории проекта; запись в
-- public.feedback остаётся fallback-путём. Раньше отказ GitHub проглатывался
-- молча, и поломка канала жила незаметно: пользователь видел «записано»,
-- issue не появлялся. Теперь причина видна прямо в строке таблицы.
-- null означает, что fallback сработал штатно (например, issue создан не был
-- вовсе, потому что запись пришла из старой версии кода).

alter table public.feedback
  add column if not exists fallback_reason text;

comment on column public.feedback.fallback_reason is
  'Почему обращение не ушло в GitHub issue: код и тело ответа API либо ошибка сети. null - причина неизвестна';

alter table public.feedback
  drop constraint if exists feedback_fallback_reason_len;
alter table public.feedback
  add constraint feedback_fallback_reason_len
  check (fallback_reason is null or char_length(fallback_reason) <= 500);
