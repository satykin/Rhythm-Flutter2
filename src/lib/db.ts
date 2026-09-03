/* ============================================================
 * Rhythm — слой данных (data layer)
 *
 * Архитектура повторяет будущую связку Supabase:
 *   - Schema  ≈ таблицы users / tasks / routines / mood_logs /
 *               focus_sessions / suggestions / task_templates
 *   - Adapter ≈ клиент (сейчас LocalAdapter на localStorage,
 *               в проде — SupabaseAdapter с realtime-подписками)
 *   - db.*    ≈ async API с сетевой задержкой, как у HTTP-клиента
 * ============================================================ */

import type {
  FocusSession, MoodCorrelation, MoodExportLog, MoodInsightEvent, MoodInsightFeedback, MoodLog, MoodPromptLog,
  MoodPromptSettings, ProductivitySlot, Routine, Suggestion, SuggestionFeedback, Task, TaskTemplate, User,
} from "./types";
import { pad2 } from "./time";

export interface Schema {
  version: number;
  users: User[];
  tasks: Task[];
  routines: Routine[];
  mood_logs: MoodLog[];
  focus_sessions: FocusSession[];
  suggestions: Suggestion[];
  suggestion_feedback: SuggestionFeedback[];
  user_productivity_slots: ProductivitySlot[];
  task_templates: TaskTemplate[];
  user_mood_correlations: MoodCorrelation[];
  mood_prompt_settings: MoodPromptSettings[];
  mood_prompt_log: MoodPromptLog[];
  mood_insight_feedback: MoodInsightFeedback[];
  mood_insight_events: MoodInsightEvent[];
  mood_export_log: MoodExportLog[];
}

export interface StorageAdapter {
  load(): Promise<Schema | null>;
  persist(schema: Schema): Promise<void>;
}

const DB_KEY = "rhythm.db.v1";
const SCHEMA_VERSION = 1;

const latency = (ms = 60) => new Promise<void>((r) => setTimeout(r, ms + Math.random() * 60));

/** Мягкая миграция: добиваем отсутствующие коллекции и поля (схемы v1 без Этапа 2). */
function backfill(raw: Partial<Schema>): Schema {
  return {
    version: SCHEMA_VERSION,
    users: (raw.users ?? []).map((u) => {
      const l = u as Partial<User>;
      return {
        ...u,
        themePalette: l.themePalette ?? "default",
        quietFrom: l.quietFrom ?? 22 * 60,
        quietTo: l.quietTo ?? 8 * 60,
        notifications: l.notifications ?? { enabled: false, taskReminder: true, focusTime: true, morningBriefing: true, eveningReview: true },
      };
    }),
    tasks: raw.tasks ?? [],
    routines: raw.routines ?? [],
    mood_logs: (raw.mood_logs ?? []).map((m) => {
      const l = m as Partial<MoodLog>;
      const loggedAt = l.loggedAt ?? `${m.date}T${pad2(Math.floor(m.timeMin / 60))}:${pad2(m.timeMin % 60)}:00`;
      return {
        ...m,
        tags: l.tags ?? [],
        linkedTaskIds: l.linkedTaskIds ?? [],
        source: l.source ?? "manual",
        loggedAt,
        updatedAt: l.updatedAt ?? loggedAt,
      };
    }),
    focus_sessions: raw.focus_sessions ?? [],
    suggestions: raw.suggestions ?? [],
    suggestion_feedback: raw.suggestion_feedback ?? [],
    user_productivity_slots: raw.user_productivity_slots ?? [],
    task_templates: raw.task_templates ?? [],
    user_mood_correlations: raw.user_mood_correlations ?? [],
    mood_prompt_settings: raw.mood_prompt_settings ?? [],
    mood_prompt_log: raw.mood_prompt_log ?? [],
    mood_insight_feedback: raw.mood_insight_feedback ?? [],
    mood_insight_events: raw.mood_insight_events ?? [],
    mood_export_log: raw.mood_export_log ?? [],
  };
}

/** Локальный адаптер — аналог Hive из ТЗ (кэш первого слоя). */
const LocalAdapter: StorageAdapter = {
  async load() {
    await latency(120);
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<Schema>;
      if (parsed.version !== SCHEMA_VERSION) return null;
      return backfill(parsed);
    } catch {
      return null;
    }
  },
  async persist(schema) {
    await latency(20);
    localStorage.setItem(DB_KEY, JSON.stringify(schema));
  },
};

let schema: Schema = {
  version: SCHEMA_VERSION,
  users: [], tasks: [], routines: [], mood_logs: [],
  focus_sessions: [], suggestions: [], suggestion_feedback: [], user_productivity_slots: [], task_templates: [],
  user_mood_correlations: [], mood_prompt_settings: [], mood_prompt_log: [],
  mood_insight_feedback: [], mood_insight_events: [], mood_export_log: [],
};

export const db = {
  async boot(): Promise<Schema> {
    const loaded = await LocalAdapter.load();
    if (loaded) schema = loaded;
    return schema;
  },

  get(): Schema {
    return schema;
  },

  async commit(): Promise<void> {
    await LocalAdapter.persist(schema);
  },

  /** Синхронный сброс кэша — для beforeunload (прерванная Flow-сессия не должна теряться). */
  flushSync(): void {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(schema));
    } catch {
      /* ignore */
    }
  },

  /* ---------- users ---------- */
  findUserByEmail(email: string): User | undefined {
    return schema.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  },
  insertUser(u: User) {
    schema.users.push(u);
  },
  updateUser(u: User) {
    const i = schema.users.findIndex((x) => x.id === u.id);
    if (i >= 0) schema.users[i] = u;
  },

  /* ---------- tasks ---------- */
  tasksOf(userId: string): Task[] {
    return schema.tasks.filter((t) => t.userId === userId);
  },
  insertTask(t: Task) {
    schema.tasks.push(t);
  },
  updateTask(t: Task) {
    const i = schema.tasks.findIndex((x) => x.id === t.id);
    if (i >= 0) schema.tasks[i] = t;
  },
  removeTask(id: string) {
    schema.tasks = schema.tasks.filter((t) => t.id !== id);
  },

  /* ---------- routines ---------- */
  routinesOf(userId: string): Routine[] {
    return schema.routines.filter((r) => r.userId === userId);
  },
  insertRoutine(r: Routine) {
    schema.routines.push(r);
  },
  updateRoutine(r: Routine) {
    const i = schema.routines.findIndex((x) => x.id === r.id);
    if (i >= 0) schema.routines[i] = r;
  },
  removeRoutine(id: string) {
    schema.routines = schema.routines.filter((r) => r.id !== id);
  },

  /**
   * Гидратация локального кэша из удалённых данных (Фаза 1.5b).
   * Заменяет коллекции пользователя на полученные из Supabase, чтобы вся
   * нижестоящая логика (scheduler, materialize, корреляции) видела
   * актуальные данные. Вызывается только в remote-режиме.
   */
  hydrateUser(
    userId: string,
    remote: {
      tasks: Task[];
      routines: Routine[];
      focusSessions: FocusSession[];
      suggestions: Suggestion[];
      templates: TaskTemplate[];
      slots: ProductivitySlot[];
      moods: MoodLog[];
    }
  ) {
    schema.tasks = [...schema.tasks.filter((t) => t.userId !== userId), ...remote.tasks];
    schema.routines = [...schema.routines.filter((r) => r.userId !== userId), ...remote.routines];
    schema.focus_sessions = [...schema.focus_sessions.filter((s) => s.userId !== userId), ...remote.focusSessions];
    schema.suggestions = [...schema.suggestions.filter((s) => s.userId !== userId), ...remote.suggestions];
    schema.task_templates = [...schema.task_templates.filter((t) => t.userId !== userId), ...remote.templates];
    schema.user_productivity_slots = [...schema.user_productivity_slots.filter((s) => s.userId !== userId), ...remote.slots];
    schema.mood_logs = [...schema.mood_logs.filter((m) => m.userId !== userId), ...remote.moods];
  },

  /* ---------- mood_logs ---------- */
  moodsOf(userId: string): MoodLog[] {
    return schema.mood_logs.filter((m) => m.userId === userId);
  },
  insertMood(m: MoodLog) {
    schema.mood_logs.push(m);
  },
  updateMood(m: MoodLog) {
    const i = schema.mood_logs.findIndex((x) => x.id === m.id);
    if (i >= 0) schema.mood_logs[i] = m;
  },
  findMood(id: string): MoodLog | undefined {
    return schema.mood_logs.find((m) => m.id === id);
  },
  removeMood(id: string) {
    schema.mood_logs = schema.mood_logs.filter((m) => m.id !== id);
  },

  /* ---------- user_mood_correlations (Фаза C) ---------- */
  correlationsOf(userId: string): MoodCorrelation[] {
    return schema.user_mood_correlations.filter((c) => c.userId === userId);
  },
  /** Upsert по (userId, signalKey) — как primary key в SQL-схеме. */
  upsertCorrelations(userId: string, rows: MoodCorrelation[]) {
    schema.user_mood_correlations = schema.user_mood_correlations.filter(
      (c) => !(c.userId === userId && rows.some((r) => r.signalKey === c.signalKey))
    );
    schema.user_mood_correlations.push(...rows);
  },
  clearCorrelations(userId: string) {
    schema.user_mood_correlations = schema.user_mood_correlations.filter((c) => c.userId !== userId);
  },

  /* ---------- mood_prompt_settings / mood_prompt_log (Фаза D) ---------- */
  promptSettingsOf(userId: string): MoodPromptSettings | undefined {
    return schema.mood_prompt_settings.find((s) => s.userId === userId);
  },
  upsertPromptSettings(s: MoodPromptSettings) {
    const i = schema.mood_prompt_settings.findIndex((x) => x.userId === s.userId);
    if (i >= 0) schema.mood_prompt_settings[i] = s;
    else schema.mood_prompt_settings.push(s);
  },
  promptLogOf(userId: string): MoodPromptLog[] {
    return schema.mood_prompt_log.filter((l) => l.userId === userId);
  },
  insertPromptLog(l: MoodPromptLog) {
    schema.mood_prompt_log.push(l);
  },

  /* ---------- mood_insight_feedback / mood_insight_events (Фаза E) ---------- */
  insightFeedbackOf(userId: string): MoodInsightFeedback[] {
    return schema.mood_insight_feedback.filter((f) => f.userId === userId);
  },
  /** Upsert по (userId, signalKey) — как primary key в SQL-схеме. */
  upsertInsightFeedback(row: MoodInsightFeedback) {
    const i = schema.mood_insight_feedback.findIndex(
      (f) => f.userId === row.userId && f.signalKey === row.signalKey
    );
    if (i >= 0) schema.mood_insight_feedback[i] = row;
    else schema.mood_insight_feedback.push(row);
  },
  insightEventsOf(userId: string): MoodInsightEvent[] {
    return schema.mood_insight_events.filter((e) => e.userId === userId);
  },
  insertInsightEvent(e: MoodInsightEvent) {
    schema.mood_insight_events.push(e);
  },

  /* ---------- mood_export_log (Фаза F): только факт, не содержимое ---------- */
  exportLogsOf(userId: string): MoodExportLog[] {
    return schema.mood_export_log.filter((l) => l.userId === userId);
  },
  insertExportLog(l: MoodExportLog) {
    schema.mood_export_log.push(l);
  },

  /* ---------- focus_sessions ---------- */
  focusSessionsOf(userId: string): FocusSession[] {
    return schema.focus_sessions.filter((s) => s.userId === userId);
  },
  insertFocusSession(s: FocusSession) {
    schema.focus_sessions.push(s);
  },

  /* ---------- suggestions ---------- */
  suggestionsOf(userId: string): Suggestion[] {
    return schema.suggestions.filter((s) => s.userId === userId);
  },
  insertSuggestion(s: Suggestion) {
    schema.suggestions.push(s);
  },
  updateSuggestion(s: Suggestion) {
    const i = schema.suggestions.findIndex((x) => x.id === s.id);
    if (i >= 0) schema.suggestions[i] = s;
  },
  removeSuggestion(id: string) {
    schema.suggestions = schema.suggestions.filter((s) => s.id !== id);
  },

  /* ---------- suggestion_feedback ---------- */
  feedbackOf(userId: string): SuggestionFeedback[] {
    return schema.suggestion_feedback.filter((f) => f.userId === userId);
  },
  insertFeedback(f: SuggestionFeedback) {
    schema.suggestion_feedback.push(f);
  },

  /* ---------- user_productivity_slots ---------- */
  slotsOf(userId: string): ProductivitySlot[] {
    return schema.user_productivity_slots.filter((s) => s.userId === userId);
  },
  upsertSlots(userId: string, slots: ProductivitySlot[]) {
    schema.user_productivity_slots = schema.user_productivity_slots.filter((s) => s.userId !== userId);
    schema.user_productivity_slots.push(...slots);
  },

  /* ---------- task_templates ---------- */
  templatesOf(userId: string): TaskTemplate[] {
    return schema.task_templates.filter((t) => t.userId === userId);
  },
  insertTemplate(t: TaskTemplate) {
    schema.task_templates.push(t);
  },
  removeTemplate(id: string) {
    schema.task_templates = schema.task_templates.filter((t) => t.id !== id);
  },

  /* ---------- сервис ---------- */
  async wipeUserData(userId: string): Promise<void> {
    schema.tasks = schema.tasks.filter((t) => t.userId !== userId);
    schema.mood_logs = schema.mood_logs.filter((m) => m.userId !== userId);
    schema.routines = schema.routines.filter((r) => r.userId !== userId);
    schema.focus_sessions = schema.focus_sessions.filter((s) => s.userId !== userId);
    schema.suggestions = schema.suggestions.filter((s) => s.userId !== userId);
    schema.suggestion_feedback = schema.suggestion_feedback.filter((f) => f.userId !== userId);
    schema.user_productivity_slots = schema.user_productivity_slots.filter((s) => s.userId !== userId);
    schema.task_templates = schema.task_templates.filter((t) => t.userId !== userId);
    schema.user_mood_correlations = schema.user_mood_correlations.filter((c) => c.userId !== userId);
    schema.mood_prompt_settings = schema.mood_prompt_settings.filter((s) => s.userId !== userId);
    schema.mood_prompt_log = schema.mood_prompt_log.filter((l) => l.userId !== userId);
    schema.mood_insight_feedback = schema.mood_insight_feedback.filter((f) => f.userId !== userId);
    schema.mood_insight_events = schema.mood_insight_events.filter((e) => e.userId !== userId);
    schema.mood_export_log = schema.mood_export_log.filter((l) => l.userId !== userId);
    await this.commit();
  },
};

/* ---------- сессия (аналог Supabase Auth session) ---------- */
const SESSION_KEY = "rhythm.session.v1";

export const sessionStore = {
  read(): string | null {
    try {
      return localStorage.getItem(SESSION_KEY);
    } catch {
      return null;
    }
  },
  write(userId: string) {
    localStorage.setItem(SESSION_KEY, userId);
  },
  clear() {
    localStorage.removeItem(SESSION_KEY);
  },
};
