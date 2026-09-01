-- ============================================================
-- Rhythm · Миграция 001: enums + хелперы.
-- Аддитивная, безопасна для повторного применения.
-- ============================================================

-- ---------- enums (идемпотентно) ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum ('todo', 'done', 'skipped');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_energy') then
    create type task_energy as enum ('low', 'medium', 'high');
  end if;
  if not exists (select 1 from pg_type where typname = 'mood_source') then
    create type mood_source as enum ('manual', 'post_focus', 'morning', 'evening');
  end if;
  if not exists (select 1 from pg_type where typname = 'flow_type') then
    create type flow_type as enum ('deep', 'creative', 'light', 'rest');
  end if;
  if not exists (select 1 from pg_type where typname = 'suggestion_status') then
    create type suggestion_status as enum ('created', 'shown', 'accepted', 'dismissed', 'snoozed', 'expired');
  end if;
end $$;

-- ---------- updated_at триггер-функция ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- хелпер: RLS «только свои строки» по user_id ----------
-- Включает RLS и создаёт 4 политики (select/insert/update/delete).
-- Идемпотентна: политики пересоздаются.
create or replace function public.apply_own_rls(tbl regclass)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := tbl::text;
begin
  execute format('alter table %s enable row level security', t);

  execute format('drop policy if exists "%s_select" on %s', t, t);
  execute format('create policy "%s_select" on %s for select using (auth.uid() = user_id)', t, t);

  execute format('drop policy if exists "%s_insert" on %s', t, t);
  execute format('create policy "%s_insert" on %s for insert with check (auth.uid() = user_id)', t, t);

  execute format('drop policy if exists "%s_update" on %s', t, t);
  execute format('create policy "%s_update" on %s for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t, t);

  execute format('drop policy if exists "%s_delete" on %s', t, t);
  execute format('create policy "%s_delete" on %s for delete using (auth.uid() = user_id)', t, t);
end;
$$;

-- Триггер updated_at (идемпотентно)
create or replace function public.add_updated_at_trigger(tbl regclass)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text := tbl::text;
begin
  execute format('drop trigger if exists trg_updated_at on %s', t);
  execute format(
    'create trigger trg_updated_at before update on %s for each row execute function public.set_updated_at()',
    t
  );
end;
$$;
