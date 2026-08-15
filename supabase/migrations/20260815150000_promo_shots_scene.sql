-- P0-3/4/5/6: job-путь генерации кадров (route handler на кадр вместо
-- Promise.all в server action). Route handler POST /api/promo/shot не имеет
-- права доверять клиенту тексту сцены в момент исполнения - клиент мог за
-- время между созданием серии и разбором очереди уйти со страницы и вернуться
-- с другим состоянием формы. Поэтому итоговый (уже провалидированный через
-- checkScene на этапе createPromoSeriesAction) текст сцены кладём в саму
-- строку кадра при создании, а не пересчитываем и не принимаем заново при
-- исполнении. Отдельная колонка, а не promo_series.user_prompt: один клик по
-- «Собрать серию» может нести разные пресеты с разными правками сцены на
-- каждый кадр, а не один общий промпт на всю серию.
alter table public.promo_shots
  add column if not exists scene text;

alter table public.promo_shots
  drop constraint if exists promo_shots_scene_len;
alter table public.promo_shots
  add constraint promo_shots_scene_len check (scene is null or char_length(scene) <= 4000);

comment on column public.promo_shots.scene is
  'Итоговый текст сцены, провалидированный на сервере при создании серии (checkScene для пресетов, referenceRecipe для источника reference). Читается route handler''ом при исполнении кадра, клиенту в момент исполнения не доверяем';
