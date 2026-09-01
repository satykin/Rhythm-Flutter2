-- ============================================================
-- Rhythm · RLS smoke-проверка (запускать в SQL Editor).
-- Критерий: второй пользователь НЕ видит строки первого.
-- ============================================================

-- 1) Полнота RLS: все пользовательские таблицы защищены.
--    Ожидание: 0 строк (achievements — публичный каталог на чтение,
--    presence — публичные статусы по дизайну Together; у обеих политики есть).
select tablename as table_without_rls
from pg_tables
where schemaname = 'public'
  and tablename not in ('schema_migrations')
  and not rowsecurity;

-- 2) Покрытие политиками (ожидание: 0 строк).
select t.tablename as table_without_policies
from pg_tables t
where t.schemaname = 'public'
  and t.tablename not in ('schema_migrations')
  and not exists (
    select 1 from pg_policies p
    where p.schemaname = t.schemaname and p.tablename = t.tablename
  );

-- 3) Изоляция строк: выполнить ПОД УЧЁТКОЙ ЮЗЕРА B
--    (в Supabase SQL Editor: переключить роль, либо открыть второй браузер
--    с другой сессией и выполнить через anon-ключ).
--    Каждая из этих команд должна вернуть только данные юзера B (обычно 0):
-- select count(*) from public.mood_logs;
-- select count(*) from public.tasks;
-- select count(*) from public.focus_sessions;
-- select count(*) from public.suggestions;

-- 4) Попытка записать чужой user_id должна упасть с ошибкой RLS
--    (выполнить под юзером B, подставив id юзера A):
-- insert into public.mood_logs (user_id, date, time_min, mood, source)
-- values ('<ID_ЮЗЕРА_A>', current_date, 720, 3, 'manual');
-- → ERROR: new row violates row-level security policy
