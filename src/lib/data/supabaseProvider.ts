/* ============================================================
 * SupabaseProvider — реальная реализация DataProvider.
 * 1.5a: auth + mood_logs. 1.5b: tasks, routines (+completions),
 * focus_sessions, suggestions (+feedback), user_profiles,
 * user_productivity_slots, daily_stats, task_templates.
 * Колонки — строго по миграциям 0002–0008 (канон: supabase/migrations).
 * Конфликты: updated_at обновляется триггером, last-write-wins (спека).
 * ============================================================ */

import type { Session, User as SbUser } from "@supabase/supabase-js";
import type {
  DailyStat, FocusSession, MoodLog, ProductivitySlot, Routine, RoutineCompletion,
  Suggestion, SuggestionFeedback, Task, TaskTemplate,
} from "../types";
import type { AuthResult, AuthUser, DataProvider, OAuthProvider, ProfilePatch } from "./types";
import { supabase } from "./client";

/* ============================================================
 * Мапперы camelCase ↔ snake_case (экспортируются для юнит-тестов).
 * ============================================================ */

/* ---------- auth ---------- */

export const toAuthUser = (u: SbUser): AuthUser => ({
  id: u.id,
  email: u.email ?? "",
  name:
    (u.user_metadata?.name as string | undefined) ??
    (u.email ? u.email.split("@")[0] : "Пользователь"),
  provider: (u.app_metadata?.provider as AuthUser["provider"] | undefined) ?? "email",
});

export const translateAuthError = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Неверная почта или пароль";
  if (m.includes("already registered")) return "Аккаунт с такой почтой уже существует";
  if (m.includes("confirm") || m.includes("email not confirmed"))
    return "Подтвердите почту по ссылке из письма — затем войдите снова";
  if (m.includes("rate limit")) return "Слишком много попыток — подождите минуту";
  return message;
};

/* ---------- mood_logs (миграция 0004) ---------- */

export interface MoodRow {
  id: string;
  user_id: string;
  date: string;
  time_min: number;
  mood: number;
  note: string | null;
  tags: string[];
  linked_task_ids: string[];
  focus_session_id: string | null;
  source: MoodLog["source"];
  logged_at: string;
  updated_at: string;
}

export const rowToMood = (r: MoodRow): MoodLog => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  timeMin: r.time_min,
  mood: r.mood,
  note: r.note ?? undefined,
  tags: r.tags ?? [],
  linkedTaskIds: r.linked_task_ids ?? [],
  focusSessionId: r.focus_session_id ?? undefined,
  source: r.source,
  loggedAt: r.logged_at,
  updatedAt: r.updated_at,
});

export const moodToRow = (m: MoodLog): MoodRow => ({
  id: m.id,
  user_id: m.userId,
  date: m.date,
  time_min: m.timeMin,
  mood: m.mood,
  note: m.note ?? null,
  tags: m.tags,
  linked_task_ids: m.linkedTaskIds,
  focus_session_id: m.focusSessionId ?? null,
  source: m.source,
  logged_at: m.loggedAt,
  updated_at: m.updatedAt,
});

/* ---------- tasks (миграция 0002) ---------- */

export interface TaskRow {
  id: string;
  user_id: string;
  title: string;
  description: string;
  date: string;
  start_min: number;
  end_min: number;
  color: string;
  icon: string;
  tags: string[];
  energy: Task["energy"];
  status: Task["status"];
  source: string;
  sync_status: string;
  external_id: string | null;
  recurrence_rule: string | null;
  parent_task_id: string | null;
  moved_count: number;
  created_at: string;
  updated_at: string;
}

export const rowToTask = (r: TaskRow): Task => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  description: r.description ?? "",
  date: r.date,
  startMin: r.start_min,
  endMin: r.end_min,
  color: r.color as Task["color"],
  icon: r.icon,
  tags: r.tags ?? [],
  energy: r.energy,
  status: r.status,
  source: r.source as Task["source"],
  syncStatus: (r.sync_status as Task["syncStatus"]) ?? "local",
  externalId: r.external_id ?? undefined,
  recurrenceRule: r.recurrence_rule ?? undefined,
  parentTaskId: r.parent_task_id ?? undefined,
  movedCount: r.moved_count ?? 0,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export const taskToRow = (t: Task): TaskRow => ({
  id: t.id,
  user_id: t.userId,
  title: t.title,
  description: t.description ?? "",
  date: t.date,
  start_min: t.startMin,
  end_min: t.endMin,
  color: t.color,
  icon: t.icon,
  tags: t.tags ?? [],
  energy: t.energy,
  status: t.status,
  source: t.source,
  sync_status: t.syncStatus,
  external_id: t.externalId ?? null,
  recurrence_rule: t.recurrenceRule ?? null,
  parent_task_id: t.parentTaskId ?? null,
  moved_count: t.movedCount ?? 0,
  created_at: t.createdAt,
  updated_at: t.updatedAt,
});

/* ---------- routines + routine_completions (миграция 0002) ---------- */

export interface RoutineRow {
  id: string;
  user_id: string;
  title: string;
  icon: string;
  color: string;
  duration_min: number;
  time_hint: string;
  days: number[];
}

export const rowToRoutine = (r: RoutineRow): Routine => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  icon: r.icon,
  color: r.color as Routine["color"],
  durationMin: r.duration_min,
  timeHint: r.time_hint,
  days: r.days ?? [],
});

export const routineToRow = (r: Routine): RoutineRow => ({
  id: r.id,
  user_id: r.userId,
  title: r.title,
  icon: r.icon,
  color: r.color,
  duration_min: r.durationMin,
  time_hint: r.timeHint,
  days: r.days ?? [],
});

export interface CompletionRow {
  id: string;
  user_id: string;
  routine_id: string;
  date: string;
  completed_at: string;
}

export const rowToCompletion = (r: CompletionRow): RoutineCompletion => ({
  id: r.id,
  userId: r.user_id,
  routineId: r.routine_id,
  date: r.date,
  completedAt: r.completed_at,
});

export const completionToRow = (c: RoutineCompletion): CompletionRow => ({
  id: c.id,
  user_id: c.userId,
  routine_id: c.routineId,
  date: c.date,
  completed_at: c.completedAt,
});

/* ---------- focus_sessions (миграция 0003) ---------- */

export interface FocusRow {
  id: string;
  user_id: string;
  type: FocusSession["type"];
  started_at: string;
  date: string;
  planned_focus_min: number;
  planned_break_min: number;
  focus_min: number;
  break_min: number;
  cycles: number;
  completed: boolean;
  sounds: string[];
}

export const rowToFocus = (r: FocusRow): FocusSession => ({
  id: r.id,
  userId: r.user_id,
  type: r.type,
  startedAt: r.started_at,
  date: r.date,
  plannedFocusMin: r.planned_focus_min,
  plannedBreakMin: r.planned_break_min,
  focusMin: r.focus_min,
  breakMin: r.break_min,
  cycles: r.cycles,
  completed: r.completed,
  sounds: r.sounds ?? [],
});

export const focusToRow = (s: FocusSession): FocusRow => ({
  id: s.id,
  user_id: s.userId,
  type: s.type,
  started_at: s.startedAt,
  date: s.date,
  planned_focus_min: s.plannedFocusMin,
  planned_break_min: s.plannedBreakMin,
  focus_min: s.focusMin,
  break_min: s.breakMin,
  cycles: s.cycles,
  completed: s.completed,
  sounds: s.sounds ?? [],
});

/* ---------- suggestions + feedback (миграции 0003 + 0008) ----------
 * kind ↔ type, body ↔ detail, state ↔ status;
 * createdAt/shownAt/snoozeUntil/expiresAt: epoch ms ↔ ISO/bigint. */

export interface SuggestionRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  detail: string | null;
  context: Record<string, unknown>;
  priority: number;
  status: string;
  dedup_key: string | null;
  snooze_until: number | null;
  shown_at: number | null;
  expires_at: number | null;
  created_at: string;
}

export const rowToSuggestion = (r: SuggestionRow): Suggestion => ({
  id: r.id,
  userId: r.user_id,
  kind: r.type as Suggestion["kind"],
  title: r.title,
  body: r.detail ?? "",
  context: (r.context ?? {}) as Suggestion["context"],
  priority: r.priority,
  state: r.status as Suggestion["state"],
  dedupKey: r.dedup_key ?? "",
  snoozeUntil: r.snooze_until ?? undefined,
  shownAt: r.shown_at ?? undefined,
  expiresAt: r.expires_at ?? undefined,
  createdAt: Date.parse(r.created_at) || 0,
});

export const suggestionToRow = (s: Suggestion): SuggestionRow => ({
  id: s.id,
  user_id: s.userId,
  type: s.kind,
  title: s.title,
  detail: s.body || null,
  context: s.context as Record<string, unknown>,
  priority: s.priority,
  status: s.state,
  dedup_key: s.dedupKey || null,
  snooze_until: s.snoozeUntil ?? null,
  shown_at: s.shownAt ?? null,
  expires_at: s.expiresAt ?? null,
  created_at: new Date(s.createdAt).toISOString(),
});

export interface FeedbackRow {
  id: string;
  user_id: string;
  suggestion_type: string;
  action: SuggestionFeedback["action"];
  created_at: string;
}

export const rowToFeedback = (r: FeedbackRow): SuggestionFeedback => ({
  id: r.id,
  userId: r.user_id,
  /* suggestion_id в схеме 0003 нет — связь по типу (ранкер агрегирует по kind) */
  suggestionId: "",
  kind: r.suggestion_type as SuggestionFeedback["kind"],
  action: r.action,
  createdAt: Date.parse(r.created_at) || 0,
});

export const feedbackToRow = (f: SuggestionFeedback): FeedbackRow => ({
  id: f.id,
  user_id: f.userId,
  suggestion_type: f.kind,
  action: f.action,
  created_at: new Date(f.createdAt).toISOString(),
});

/* ---------- user_profiles (миграция 0002) ---------- */

export const profilePatchToRow = (p: ProfilePatch): Record<string, unknown> => {
  const row: Record<string, unknown> = {};
  if (p.displayName !== undefined) row.display_name = p.displayName;
  if (p.timezone !== undefined) row.timezone = p.timezone;
  if (p.accent !== undefined) row.accent = p.accent;
  if (p.themePalette !== undefined) row.theme_palette = p.themePalette;
  if (p.sleepHours !== undefined) row.sleep_hours = p.sleepHours;
  if (p.quietFrom !== undefined) row.quiet_start = p.quietFrom;
  if (p.quietTo !== undefined) row.quiet_end = p.quietTo;
  return row;
};

export const rowToProfilePatch = (r: Record<string, unknown>): ProfilePatch => ({
  displayName: (r.display_name as string | undefined) ?? undefined,
  timezone: (r.timezone as string | undefined) ?? undefined,
  accent: (r.accent as string | undefined) ?? undefined,
  themePalette: (r.theme_palette as string | undefined) ?? undefined,
  sleepHours: (r.sleep_hours as number | undefined) ?? undefined,
  quietFrom: (r.quiet_start as number | undefined) ?? undefined,
  quietTo: (r.quiet_end as number | undefined) ?? undefined,
});

/* ---------- user_productivity_slots (миграция 0003) ---------- */

export interface SlotRow {
  user_id: string;
  slot_index: number;
  score: number;
  computed_at: string;
}

export const rowToSlot = (r: SlotRow): ProductivitySlot => ({
  userId: r.user_id,
  slotIndex: r.slot_index,
  score: r.score,
  computedAt: Date.parse(r.computed_at) || Date.now(),
});

export const slotToRow = (s: ProductivitySlot): SlotRow => ({
  user_id: s.userId,
  slot_index: s.slotIndex,
  score: s.score,
  computed_at: new Date(s.computedAt).toISOString(),
});

/* ---------- daily_stats (миграция 0003) ---------- */

export interface DailyStatRow {
  user_id: string;
  date: string;
  tasks_done: number;
  focus_min: number;
  mood_avg: number | null;
  computed_at: string;
}

export const rowToDailyStat = (r: DailyStatRow): DailyStat => ({
  userId: r.user_id,
  date: r.date,
  tasksDone: r.tasks_done,
  focusMin: r.focus_min,
  moodAvg: r.mood_avg,
  computedAt: r.computed_at,
});

/* ---------- task_templates (миграция 0002) ---------- */

export interface TemplateRow {
  id: string;
  user_id: string;
  title: string;
  icon: string;
  color: string;
  duration_min: number;
  energy: TaskTemplate["energy"];
  tags: string[];
  time_hint: string | null;
}

export const rowToTemplate = (r: TemplateRow): TaskTemplate => ({
  id: r.id,
  userId: r.user_id,
  title: r.title,
  icon: r.icon,
  color: r.color as TaskTemplate["color"],
  durationMin: r.duration_min,
  energy: r.energy,
  tags: r.tags ?? [],
  timeHint: r.time_hint ?? undefined,
});

export const templateToRow = (t: TaskTemplate): TemplateRow => ({
  id: t.id,
  user_id: t.userId,
  title: t.title,
  icon: t.icon,
  color: t.color,
  duration_min: t.durationMin,
  energy: t.energy,
  tags: t.tags ?? [],
  time_hint: t.timeHint ?? null,
});

/* ============================================================
 * Провайдер
 * ============================================================ */

export function createSupabaseProvider(): DataProvider {
  const sb = supabase;
  if (!sb) throw new Error("Supabase не сконфигурирован (нет env-ключей)");

  const sessionToAuthUser = (s: Session | null): AuthUser | null => (s ? toAuthUser(s.user) : null);

  return {
    kind: "supabase",

    async getSession() {
      const { data } = await sb.auth.getSession();
      return sessionToAuthUser(data.session);
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        cb(sessionToAuthUser(session));
      });
      return () => data.subscription.unsubscribe();
    },

    async signUp(name, email, password): Promise<AuthResult> {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) return { error: translateAuthError(error.message) };
      if (!data.session) {
        return { error: "Письмо с подтверждением отправлено — откройте ссылку и войдите" };
      }
      return { user: data.session ? toAuthUser(data.session.user) : undefined };
    },

    async signIn(email, password): Promise<AuthResult> {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { error: translateAuthError(error.message) };
      return { user: toAuthUser(data.user) };
    },

    async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) return { error: translateAuthError(error.message) };
      return {};
    },

    async signOut() {
      await sb.auth.signOut();
    },

    /* ---------- moods ---------- */
    moods: {
      async list(userId) {
        const { data, error } = await sb
          .from("mood_logs")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .order("time_min", { ascending: false });
        if (error) throw new Error(`mood_logs.list: ${error.message}`);
        return (data as MoodRow[]).map(rowToMood);
      },
      async insert(entry) {
        const { data, error } = await sb.from("mood_logs").insert(moodToRow(entry)).select().single();
        if (error) throw new Error(`mood_logs.insert: ${error.message}`);
        return rowToMood(data as MoodRow);
      },
      async update(entry) {
        const { data, error } = await sb
          .from("mood_logs")
          .update(moodToRow(entry))
          .eq("id", entry.id)
          .eq("user_id", entry.userId)
          .select()
          .single();
        if (error) throw new Error(`mood_logs.update: ${error.message}`);
        return rowToMood(data as MoodRow);
      },
      async remove(userId, id) {
        const { error } = await sb.from("mood_logs").delete().eq("id", id).eq("user_id", userId);
        if (error) throw new Error(`mood_logs.remove: ${error.message}`);
      },
    },

    /* ---------- tasks ---------- */
    tasks: {
      async list(userId) {
        const { data, error } = await sb
          .from("tasks")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: true })
          .order("start_min", { ascending: true });
        if (error) throw new Error(`tasks.list: ${error.message}`);
        return (data as TaskRow[]).map(rowToTask);
      },
      async upsert(task) {
        /* onConflict=id → идемпотентный апсерт (офлайн-flush, last-write-wins) */
        const { data, error } = await sb
          .from("tasks")
          .upsert(taskToRow(task), { onConflict: "id" })
          .select()
          .single();
        if (error) throw new Error(`tasks.upsert: ${error.message}`);
        return rowToTask(data as TaskRow);
      },
      async remove(userId, id) {
        const { error } = await sb.from("tasks").delete().eq("id", id).eq("user_id", userId);
        if (error) throw new Error(`tasks.remove: ${error.message}`);
      },
    },

    /* ---------- routines + completions ---------- */
    routines: {
      async list(userId) {
        const { data, error } = await sb.from("routines").select("*").eq("user_id", userId);
        if (error) throw new Error(`routines.list: ${error.message}`);
        return (data as RoutineRow[]).map(rowToRoutine);
      },
      async upsert(routine) {
        const { data, error } = await sb
          .from("routines")
          .upsert(routineToRow(routine), { onConflict: "id" })
          .select()
          .single();
        if (error) throw new Error(`routines.upsert: ${error.message}`);
        return rowToRoutine(data as RoutineRow);
      },
      async remove(userId, id) {
        const { error } = await sb.from("routines").delete().eq("id", id).eq("user_id", userId);
        if (error) throw new Error(`routines.remove: ${error.message}`);
      },
      async listCompletions(userId, fromDate) {
        const { data, error } = await sb
          .from("routine_completions")
          .select("*")
          .eq("user_id", userId)
          .gte("date", fromDate);
        if (error) throw new Error(`routine_completions.list: ${error.message}`);
        return (data as CompletionRow[]).map(rowToCompletion);
      },
      async insertCompletion(c) {
        /* unique(user_id, routine_id, date) — ignoreDuplicates для идемпотентности */
        const { error } = await sb
          .from("routine_completions")
          .upsert(completionToRow(c), { onConflict: "user_id,routine_id,date", ignoreDuplicates: true });
        if (error) throw new Error(`routine_completions.insert: ${error.message}`);
      },
      async removeCompletion(userId, id) {
        const { error } = await sb
          .from("routine_completions")
          .delete()
          .eq("id", id)
          .eq("user_id", userId);
        if (error) throw new Error(`routine_completions.remove: ${error.message}`);
      },
    },

    /* ---------- focus_sessions ---------- */
    focus: {
      async list(userId) {
        const { data, error } = await sb
          .from("focus_sessions")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false });
        if (error) throw new Error(`focus_sessions.list: ${error.message}`);
        return (data as FocusRow[]).map(rowToFocus);
      },
      async insert(session) {
        const { data, error } = await sb.from("focus_sessions").insert(focusToRow(session)).select().single();
        if (error) throw new Error(`focus_sessions.insert: ${error.message}`);
        return rowToFocus(data as FocusRow);
      },
    },

    /* ---------- suggestions + feedback ---------- */
    suggestions: {
      async list(userId) {
        const { data, error } = await sb.from("suggestions").select("*").eq("user_id", userId);
        if (error) throw new Error(`suggestions.list: ${error.message}`);
        return (data as SuggestionRow[]).map(rowToSuggestion);
      },
      async upsert(s) {
        const { data, error } = await sb
          .from("suggestions")
          .upsert(suggestionToRow(s), { onConflict: "id" })
          .select()
          .single();
        if (error) throw new Error(`suggestions.upsert: ${error.message}`);
        return rowToSuggestion(data as SuggestionRow);
      },
      async remove(userId, id) {
        const { error } = await sb.from("suggestions").delete().eq("id", id).eq("user_id", userId);
        if (error) throw new Error(`suggestions.remove: ${error.message}`);
      },
      async listFeedback(userId) {
        const { data, error } = await sb
          .from("suggestion_feedback")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });
        if (error) throw new Error(`suggestion_feedback.list: ${error.message}`);
        return (data as FeedbackRow[]).map(rowToFeedback);
      },
      async insertFeedback(f) {
        const { error } = await sb.from("suggestion_feedback").insert(feedbackToRow(f));
        if (error) throw new Error(`suggestion_feedback.insert: ${error.message}`);
      },
    },

    /* ---------- user_profiles ---------- */
    profiles: {
      async get(userId) {
        const { data, error } = await sb.from("user_profiles").select("*").eq("user_id", userId).maybeSingle();
        if (error) throw new Error(`user_profiles.get: ${error.message}`);
        return data ? rowToProfilePatch(data as Record<string, unknown>) : null;
      },
      async upsert(userId, p) {
        const row = profilePatchToRow(p);
        if (!Object.keys(row).length) return;
        const { error } = await sb
          .from("user_profiles")
          .upsert({ user_id: userId, ...row }, { onConflict: "user_id" });
        if (error) throw new Error(`user_profiles.upsert: ${error.message}`);
      },
    },

    /* ---------- user_productivity_slots ---------- */
    slots: {
      async list(userId) {
        const { data, error } = await sb
          .from("user_productivity_slots")
          .select("*")
          .eq("user_id", userId)
          .order("slot_index", { ascending: true });
        if (error) throw new Error(`user_productivity_slots.list: ${error.message}`);
        return (data as SlotRow[]).map(rowToSlot);
      },
      async upsert(userId, slots) {
        if (!slots.length) return;
        const { error } = await sb
          .from("user_productivity_slots")
          .upsert(slots.map(slotToRow), { onConflict: "user_id,slot_index" });
        if (error) throw new Error(`user_productivity_slots.upsert: ${error.message}`);
      },
    },

    /* ---------- daily_stats ---------- */
    dailyStats: {
      async list(userId, fromDate) {
        const { data, error } = await sb
          .from("daily_stats")
          .select("*")
          .eq("user_id", userId)
          .gte("date", fromDate)
          .order("date", { ascending: false });
        if (error) throw new Error(`daily_stats.list: ${error.message}`);
        return (data as DailyStatRow[]).map(rowToDailyStat);
      },
    },

    /* ---------- task_templates ---------- */
    templates: {
      async list(userId) {
        const { data, error } = await sb.from("task_templates").select("*").eq("user_id", userId);
        if (error) throw new Error(`task_templates.list: ${error.message}`);
        return (data as TemplateRow[]).map(rowToTemplate);
      },
      async upsert(t) {
        const { data, error } = await sb
          .from("task_templates")
          .upsert(templateToRow(t), { onConflict: "id" })
          .select()
          .single();
        if (error) throw new Error(`task_templates.upsert: ${error.message}`);
        return rowToTemplate(data as TemplateRow);
      },
      async remove(userId, id) {
        const { error } = await sb.from("task_templates").delete().eq("id", id).eq("user_id", userId);
        if (error) throw new Error(`task_templates.remove: ${error.message}`);
      },
    },
  };
}
