-- ============================================================
-- Rhythm · Миграция 002: ядро — профиль, задачи, шаблоны, рутины.
-- Единая схема (канон: docs/RHYTHM_MASTER_PLAN.md §6).
-- ============================================================

-- ---------- user_profiles (расширение auth.users) ----------
create table if not exists public.user_profiles (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  display_name  text,
  timezone      text not null default 'UTC',
  accent        text not null default 'violet',
  theme_palette text not null default 'default',
  sleep_hours   numeric(3, 1) not null default 7.5,
  quiet_start   integer not null default 1320,   -- минуты от полуночи (22:00)
  quiet_end     integer not null default 480,    -- (08:00)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- tasks ----------
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  title           text not null,
  description     text not null default '',
  date            date not null,
  start_min       integer not null check (start_min between 0 and 1439),
  end_min         integer not null check (end_min between 1 and 1440),
  color           text not null default 'violet',
  icon            text not null default 'target',
  tags            text[] not null default '{}',
  energy          task_energy not null default 'medium',
  status          task_status not null default 'todo',
  source          text not null default 'local',      -- local | gcal
  sync_status     text not null default 'local',      -- local | pending | synced
  external_id     text,                               -- id во внешнем календаре
  recurrence_rule text,                               -- RRULE (Фаза: Timeline Enhancements)
  parent_task_id  uuid references public.tasks (id) on delete set null,
  moved_count     integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (end_min > start_min)
);

create index if not exists idx_tasks_user_date on public.tasks (user_id, date);
create index if not exists idx_tasks_external on public.tasks (user_id, external_id);

-- ---------- task_templates ----------
create table if not exists public.task_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  icon         text not null default 'target',
  color        text not null default 'violet',
  duration_min integer not null default 60,
  energy       task_energy not null default 'medium',
  tags         text[] not null default '{}',
  time_hint    text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_task_templates_user on public.task_templates (user_id);

-- ---------- routines ----------
create table if not exists public.routines (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  icon         text not null default 'sun',
  color        text not null default 'amber',
  duration_min integer not null default 15,
  time_hint    text not null default '08:00',
  days         integer[] not null default '{}',       -- 0=Пн … 6=Вс
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_routines_user on public.routines (user_id);

-- ---------- routine_completions ----------
create table if not exists public.routine_completions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  routine_id   uuid not null references public.routines (id) on delete cascade,
  date         date not null,
  completed_at timestamptz not null default now(),
  unique (user_id, routine_id, date)
);

create index if not exists idx_routine_completions_user_date on public.routine_completions (user_id, date);

-- ---------- RLS + триггеры ----------
select public.apply_own_rls('public.user_profiles');
select public.apply_own_rls('public.tasks');
select public.apply_own_rls('public.task_templates');
select public.apply_own_rls('public.routines');
select public.apply_own_rls('public.routine_completions');

select public.add_updated_at_trigger('public.user_profiles');
select public.add_updated_at_trigger('public.tasks');
select public.add_updated_at_trigger('public.routines');
