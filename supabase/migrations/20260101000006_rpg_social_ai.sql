-- ============================================================
-- Rhythm · Миграция 006: RPG-система, Social Blocks, Rhythm AI.
-- Таблицы созданы заранее (Этап 3), но RLS включён сразу —
-- «схема — единственный источник истины» (мастер-план §6.1).
-- ============================================================

-- ---------- characters (Life Character) ----------
create table if not exists public.characters (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  level      integer not null default 1,
  xp         integer not null default 0,
  streak     integer not null default 0,
  stats      jsonb not null default '{}',   -- { focus, energy, balance, growth }
  skin       text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- xp_transactions ----------
create table if not exists public.xp_transactions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  amount     integer not null,
  reason     text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_xp_transactions_user_time on public.xp_transactions (user_id, created_at desc);

-- ---------- achievements (глобальный каталог: чтение всем, запись запрещена) ----------
create table if not exists public.achievements (
  code        text primary key,
  title       text not null,
  description text not null default '',
  icon        text not null default 'spark'
);

alter table public.achievements enable row level security;
drop policy if exists "achievements_read" on public.achievements;
create policy "achievements_read" on public.achievements for select using (true);
-- намеренно нет insert/update/delete политик — каталог неизменяем клиентами

-- ---------- user_achievements ----------
create table if not exists public.user_achievements (
  user_id        uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null references public.achievements (code) on delete cascade,
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------- friendships ----------
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references auth.users (id) on delete cascade,
  user_b     uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a <> user_b)
);

alter table public.friendships enable row level security;
drop policy if exists "friendships_select" on public.friendships;
create policy "friendships_select" on public.friendships for select
  using (auth.uid() in (user_a, user_b));
drop policy if exists "friendships_insert" on public.friendships;
create policy "friendships_insert" on public.friendships for insert
  with check (auth.uid() = user_a);
drop policy if exists "friendships_update" on public.friendships;
create policy "friendships_update" on public.friendships for update
  using (auth.uid() in (user_a, user_b)) with check (auth.uid() in (user_a, user_b));
drop policy if exists "friendships_delete" on public.friendships;
create policy "friendships_delete" on public.friendships for delete
  using (auth.uid() in (user_a, user_b));

-- ---------- social_sessions + участники ----------
create table if not exists public.social_sessions (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Sync-сессия',
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  status     text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_session_members (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.social_sessions (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'joined' check (status in ('joined', 'left')),
  joined_at  timestamptz not null default now(),
  unique (session_id, user_id)
);

create index if not exists idx_social_sessions_host on public.social_sessions (host_id);
create index if not exists idx_social_members_user on public.social_session_members (user_id);

alter table public.social_sessions enable row level security;
drop policy if exists "social_sessions_select" on public.social_sessions;
create policy "social_sessions_select" on public.social_sessions for select
  using (
    auth.uid() = host_id
    or exists (select 1 from public.social_session_members m where m.session_id = id and m.user_id = auth.uid())
  );
drop policy if exists "social_sessions_insert" on public.social_sessions;
create policy "social_sessions_insert" on public.social_sessions for insert
  with check (auth.uid() = host_id);
drop policy if exists "social_sessions_update" on public.social_sessions;
create policy "social_sessions_update" on public.social_sessions for update
  using (auth.uid() = host_id) with check (auth.uid() = host_id);
drop policy if exists "social_sessions_delete" on public.social_sessions;
create policy "social_sessions_delete" on public.social_sessions for delete
  using (auth.uid() = host_id);

alter table public.social_session_members enable row level security;
drop policy if exists "social_members_select" on public.social_session_members;
create policy "social_members_select" on public.social_session_members for select
  using (
    auth.uid() = user_id
    or exists (select 1 from public.social_sessions s where s.id = session_id and s.host_id = auth.uid())
  );
drop policy if exists "social_members_insert" on public.social_session_members;
create policy "social_members_insert" on public.social_session_members for insert
  with check (auth.uid() = user_id);
drop policy if exists "social_members_update" on public.social_session_members;
create policy "social_members_update" on public.social_session_members for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "social_members_delete" on public.social_session_members;
create policy "social_members_delete" on public.social_session_members for delete
  using (auth.uid() = user_id);

-- ---------- presence (статусы «в фокусе / свободен» — публичное чтение по дизайну Together) ----------
create table if not exists public.presence (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  status     text not null default 'offline' check (status in ('offline', 'free', 'deep', 'rest')),
  note       text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.presence enable row level security;
drop policy if exists "presence_select" on public.presence;
create policy "presence_select" on public.presence for select using (true);
drop policy if exists "presence_insert" on public.presence;
create policy "presence_insert" on public.presence for insert with check (auth.uid() = user_id);
drop policy if exists "presence_update" on public.presence;
create policy "presence_update" on public.presence for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "presence_delete" on public.presence;
create policy "presence_delete" on public.presence for delete using (auth.uid() = user_id);

-- ---------- Rhythm AI: память и диалоги (Этап 3) ----------
create table if not exists public.ai_memory (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null default 'preference',
  content    text not null,
  meta       jsonb not null default '{}',   -- для будущих embedding-векторов
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_memory_user on public.ai_memory (user_id, kind);

create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null default 'Диалог',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists idx_ai_messages_conv on public.ai_messages (conversation_id, created_at);

-- ---------- RLS + триггеры ----------
select public.apply_own_rls('public.characters');
select public.apply_own_rls('public.xp_transactions');
select public.apply_own_rls('public.user_achievements');
select public.apply_own_rls('public.ai_memory');
select public.apply_own_rls('public.ai_conversations');
select public.apply_own_rls('public.ai_messages');

select public.add_updated_at_trigger('public.characters');
select public.add_updated_at_trigger('public.social_sessions');
select public.add_updated_at_trigger('public.ai_conversations');
select public.add_updated_at_trigger('public.presence');
