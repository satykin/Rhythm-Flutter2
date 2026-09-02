-- ============================================================
-- Rhythm · Миграция 007: права доступа и триггер профиля.
--
-- Корень инцидента «висящий спиннер на входе»: роли authenticated /
-- service_role не имели GRANT'ов на таблицы, и PostgREST отдавал 403
-- на mood_logs. RLS был включён, но без прав на чтение/запись
-- политики не могли сработать. Эта миграция выдаёт права и
-- гарантирует их для будущих таблиц.
-- ============================================================

-- ---------- права на схему и существующие объекты ----------
grant usage on schema public to authenticated, service_role;

grant all on all tables in schema public to authenticated, service_role;
grant all on all sequences in schema public to authenticated, service_role;

-- чтобы новые таблицы/секвенции автоматически получали те же права
alter default privileges in schema public grant all on tables to authenticated, service_role;
alter default privileges in schema public grant all on sequences to authenticated, service_role;

-- ---------- автопрофиль при регистрации ----------
-- security definer нужен, чтобы функция могла писать в user_profiles
-- от имени владельца (auth-хук выполняется до полноценной сессии).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, ''), '@', 1),
      'Пользователь'
    )
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
