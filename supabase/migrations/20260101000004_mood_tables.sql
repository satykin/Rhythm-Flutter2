-- ============================================================
-- Rhythm · Миграция 004: Mood Journal 2.1.
-- mood_logs + prompt budget + инсайты. Чувствительные данные:
-- строгий RLS, никаких публичных политик.
-- ============================================================

-- ---------- mood_logs ----------
create table if not exists public.mood_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  date             date not null,
  time_min         integer not null check (time_min between 0 and 1439),
  mood             integer not null check (mood between 1 and 5),
  note             text,
  tags             text[] not null default '{}',
  linked_task_ids  uuid[] not null default '{}',
  focus_session_id uuid,
  source           mood_source not null default 'manual',
  logged_at        timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_mood_logs_user_date on public.mood_logs (user_id, date);
create index if not exists idx_mood_logs_user_logged on public.mood_logs (user_id, logged_at desc);

-- ---------- mood_prompt_settings (Prompt Budget, Фаза D) ----------
create table if not exists public.mood_prompt_settings (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  morning_enabled        boolean not null default true,
  morning_time           integer not null default 480,    -- 08:00
  evening_enabled        boolean not null default false,
  evening_time           integer not null default 1230,   -- 20:30
  quiet_start            integer not null default 1320,   -- 22:00
  quiet_end              integer not null default 480,    -- 08:00
  skip_if_recent_checkin boolean not null default true,
  updated_at             timestamptz not null default now()
);

-- ---------- mood_prompt_log (shown / dismissed / completed) ----------
create table if not exists public.mood_prompt_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  prompt_type text not null check (prompt_type in ('morning', 'evening')),
  action      text not null check (action in ('shown', 'dismissed', 'completed')),
  created_at  timestamptz not null default now()
);

create index if not exists idx_mood_prompt_log_user_time on public.mood_prompt_log (user_id, created_at desc);

-- ---------- mood_insight_feedback (Фаза E) ----------
create table if not exists public.mood_insight_feedback (
  user_id         uuid not null references auth.users (id) on delete cascade,
  signal_key      text not null,
  status          text not null default 'active'
    check (status in ('active', 'accepted', 'dismissed', 'stale')),
  first_shown_at  bigint,   -- epoch ms
  feedback_at     bigint,
  dismissed_until bigint,
  primary key (user_id, signal_key)
);

-- ---------- mood_insight_events (метрики доверия к инсайтам) ----------
create table if not exists public.mood_insight_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  signal_key text not null,
  event      text not null check (event in ('shown', 'explain_opened', 'accepted', 'dismissed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_mood_insight_events_user on public.mood_insight_events (user_id, created_at desc);

-- ---------- mood_export_log: только ФАКТ экспорта, никогда содержимое (§14) ----------
create table if not exists public.mood_export_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('csv', 'pdf')),
  count      integer not null default 0,
  period     text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_mood_export_log_user on public.mood_export_log (user_id, created_at desc);

-- ---------- RLS + триггеры ----------
select public.apply_own_rls('public.mood_logs');
select public.apply_own_rls('public.mood_prompt_settings');
select public.apply_own_rls('public.mood_prompt_log');
select public.apply_own_rls('public.mood_insight_feedback');
select public.apply_own_rls('public.mood_insight_events');
select public.apply_own_rls('public.mood_export_log');

select public.add_updated_at_trigger('public.mood_logs');
select public.add_updated_at_trigger('public.mood_prompt_settings');
