-- ============================================================
-- Rhythm · Миграция 005: уведомления и BioSync-данные.
-- notification_settings — общая для веба и мобайла (трек M4):
-- один аккаунт = одни настройки на всех клиентах.
-- ============================================================

-- ---------- notification_settings ----------
create table if not exists public.notification_settings (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  enabled          boolean not null default false,
  task_reminder    boolean not null default true,
  focus_time       boolean not null default true,
  morning_briefing boolean not null default true,
  evening_review   boolean not null default true,
  quiet_from       integer not null default 1320,  -- 22:00
  quiet_to         integer not null default 480,   -- 08:00
  push_endpoint    text,                           -- FCM/APNs токен (мобайл, M4)
  updated_at       timestamptz not null default now()
);

-- ---------- notification_log ----------
create table if not exists public.notification_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  type       text not null,  -- task_reminder | focus_time | morning_briefing | evening_review
  title      text not null default '',
  body       text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_notification_log_user_time on public.notification_log (user_id, created_at desc);

-- ---------- health_metrics (BioSync, Этап 3: HealthKit / Google Fit) ----------
create table if not exists public.health_metrics (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  date         date not null,
  sleep_hours  numeric(3, 1),
  resting_hr   integer,
  stress       numeric(4, 2),
  steps        integer,
  source       text not null default 'healthkit',  -- healthkit | google_fit | manual
  created_at   timestamptz not null default now()
);

create index if not exists idx_health_metrics_user_date on public.health_metrics (user_id, date);

-- ---------- energy_scores (расчётная энергия по слотам дня) ----------
create table if not exists public.energy_scores (
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  slot_index  integer not null check (slot_index between 0 and 47),
  score       integer not null check (score between 0 and 100),
  computed_at timestamptz not null default now(),
  primary key (user_id, date, slot_index)
);

-- ---------- RLS + триггеры ----------
select public.apply_own_rls('public.notification_settings');
select public.apply_own_rls('public.notification_log');
select public.apply_own_rls('public.health_metrics');
select public.apply_own_rls('public.energy_scores');

select public.add_updated_at_trigger('public.notification_settings');
