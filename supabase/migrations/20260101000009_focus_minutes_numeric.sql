-- ============================================================
-- Rhythm · Миграция 0009: фокус-минуты — integer → numeric(6,2).
--
-- Причина: приложение пишет в focus_sessions ФАКТИЧЕСКУЮ длительность
-- с точностью до десятых (напр. stop на 4:33 → focus_min = 4.6).
-- Колонки integer (миграция 0003) отклоняли дробные значения
-- (PostgREST 400: «column is of type integer but expression is of
-- type numeric») — строки прерванных сессий не попадали в БД.
--
-- Изменение integer → numeric(6,2) НЕразрушающее: существующие
-- значения сохраняются, диапазон (до 9999.99 мин) покрывает любые
-- сессии (максимум ~130 мин с продлениями).
-- ============================================================

alter table public.focus_sessions
  alter column focus_min type numeric(6, 2) using focus_min::numeric(6, 2),
  alter column break_min type numeric(6, 2) using break_min::numeric(6, 2);
