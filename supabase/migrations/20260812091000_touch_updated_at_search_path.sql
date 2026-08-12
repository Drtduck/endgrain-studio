-- Линтер Supabase: фиксируем search_path у триггерной функции.
-- Применено координатором к живой базе 12 августа 2026, advisors после этого чистые.
alter function public.touch_updated_at() set search_path = '';
