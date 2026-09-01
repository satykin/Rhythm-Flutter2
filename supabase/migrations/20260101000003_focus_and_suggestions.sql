-- ============================================================
-- Rhythm · Миграция 003: фокус-сессии и Smart Suggestions.
-- ============================================================

-- ---------- focus_sessions ----------
create table if not exists public.focus_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  type               flow_type not null,
  started_at         timestamptz not null,
  date               date not null,
  planned_focus_min  integer not null,
  planned_break_min  integer not null default 0,
  focus_min          integer not null default 0,
  break_min          integer not null default 0,
  cycles             integer not null default 1,
  completed          boolean not null default false,
  sounds             text[] not null default '{}',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_focus_sessions_user_date on public.focus_sessions (user_id, date);

-- ---------- suggestions ----------
create table if not exists public.suggestions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  type         text not null,  -- golden_hour | reschedule | overload | break_down | briefing_am | briefing_pm
  title        text not null,
  detail       text,
  context      jsonb not null default '{}',
  priority     integer not null default 5,
  status       suggestion_status not null default 'created',
  dedup_key    text,
  snooze_until bigint,         -- epoch ms
  shown_at     bigint,         -- epoch ms
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_suggestions_user_status on public.suggestions (user_id, status);
create index if not exists idx_suggestions_dedup on public.suggestions (user_id, dedup_key);

-- ---------- suggestion_feedback (цикл обучения: принял/отклонил → вес) ----------
create table if not exists public.suggestion_feedback (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  suggestion_type text not null,
  action          text not null check (action in ('accepted', 'dismissed', 'snoozed')),
  created_at      timestamptz not null default now()
);

create index if not exists idx_suggestion_feedback_user on public.suggestion_feedback (user_id, created_at desc);

-- ---------- user_productivity_slots (агрегация «золотых часов», пересчёт раз в сутки) ----------
create table if not exists public.user_productivity_slots (
  user_id     uuid not null references auth.users (id) on delete cascade,
  slot_index  integer not null check (slot_index between 0 and 47),
  score       double precision not null default 0,
  computed_at timestamptz not null default now(),
  primary key (user_id, slot_index)
);

-- ---------- daily_stats (агрегаты по дням) ----------
create table if not exists public.daily_stats (
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  tasks_done  integer not null default 0,
  focus_min   integer not null default 0,
  mood_avg    numeric(3, 2),
  computed_at timestamptz not null default now(),
  primary key (user_id, date)
);

-- ---------- RLS + триггеры ----------
select public.apply_own_rls('public.focus_sessions');
select public.apply_own_rls('public.suggestions');
select public.apply_own_rls('public.suggestion_feedback');
select public.apply_own_rls('public.user_productivity_slots');
select public.apply_own_rls('public.daily_stats');

select public.add_updated_at_trigger('public.focus_sessions');
select public.add_updated_at_trigger('public.suggestions');
