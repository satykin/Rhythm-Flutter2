/* ============================================================
 * Rhythm — доменный слой (domain models)
 * Схемы идентичны будущим таблицам Supabase:
 *   users, tasks, routines, mood_logs,
 *   focus_sessions, suggestions, task_templates   (Этап 2)
 * ============================================================ */

export type EnergyLevel = "low" | "medium" | "high";
export type TaskStatus = "todo" | "done" | "skipped";
export type TaskSource = "local" | "gcal" | "routine";
/** local — ещё не был в календаре, pending — изменён и ждёт push, synced — синхронизирован */
export type SyncStatus = "local" | "pending" | "synced";
export type AuthProvider = "email" | "google" | "apple";

export type PaletteId = "default" | "ocean" | "sunset" | "forest" | "mono";
export type TaskColor = "violet" | "indigo" | "aqua" | "amber" | "rose" | "lime" | "sky" | "slate";

export interface NotifPrefs {
  enabled: boolean;
  taskReminder: boolean;
  focusTime: boolean;
  morningBriefing: boolean;
  eveningReview: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  /** demo-хэш (в проде — Supabase Auth) */
  passHash?: string;
  provider: AuthProvider;
  accent: "violet" | "indigo" | "aqua";
  sleepHours: number;
  createdAt: string;
  /* --- Этап 2 --- */
  themePalette: PaletteId;
  /** точечный кастомный цвет поверх палитры */
  customColor?: { slot: TaskColor; hex: string };
  /** тихие часы (минуты от начала суток); поддерживается переход через полночь */
  quietFrom: number;
  quietTo: number;
  notifications: NotifPrefs;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description: string;
  /** YYYY-MM-DD */
  date: string;
  /** минуты от начала суток */
  startMin: number;
  endMin: number;
  color: TaskColor;
  icon: string;
  tags: string[];
  energy: EnergyLevel;
  status: TaskStatus;
  source: TaskSource;
  externalId?: string;
  syncStatus: SyncStatus;
  createdAt: string;
  updatedAt: string;
  /* --- Этап 2: повторяемость (RRULE-подмножество: FREQ=DAILY|WEEKLY;INTERVAL;BYDAY;UNTIL;COUNT) --- */
  recurrenceRule?: string;
  /** для материализованных экземпляров повторяющейся задачи */
  parentTaskId?: string;
  /** сколько раз задачу переносили — для §4.6 break_down */
  movedCount?: number;
}

export interface Routine {
  id: string;
  userId: string;
  title: string;
  icon: string;
  color: TaskColor;
  durationMin: number;
  /** предпочтительное время начала, "HH:MM" */
  timeHint: string;
  /** 0=Пн … 6=Вс */
  days: number[];
}

/** routine_completions — отметки выполнения привычек по дням */
export interface RoutineCompletion {
  id: string;
  userId: string;
  routineId: string;
  /** YYYY-MM-DD */
  date: string;
  /** ISO */
  completedAt: string;
}

/** daily_stats — дневные агрегаты (задачи/фокус/настроение) */
export interface DailyStat {
  userId: string;
  /** YYYY-MM-DD */
  date: string;
  tasksDone: number;
  focusMin: number;
  moodAvg: number | null;
  computedAt: string;
}

/** Происхождение записи (Журнал 2.1, §4) */
export type MoodSource = "manual" | "post_focus" | "morning" | "evening";

export interface MoodLog {
  id: string;
  userId: string;
  /** YYYY-MM-DD — локальная дата (для группировки/аналитики) */
  date: string;
  /** минуты от начала суток — локальное время записи */
  timeMin: number;
  /** внутренний score 1..5 — НЕ показывается в UI (только эмодзи + подпись) */
  mood: number;
  note?: string;
  tags: string[];
  linkedTaskIds: string[];
  /* --- Mood Journal 2.1 --- */
  source: MoodSource;
  /** связь с Flow Session (Фаза B) */
  focusSessionId?: string;
  /** ISO, редактируемое для manual entry */
  loggedAt: string;
  /** ISO, для синхронизации и разрешения конфликтов */
  updatedAt: string;
}

/* ---------- Mood Prompts / Prompt Budget (Фаза D) ---------- */

export type PromptType = "morning" | "evening";
export type PromptAction = "shown" | "dismissed" | "completed";

/** mood_prompt_settings (1 строка на пользователя, PK = user_id) */
export interface MoodPromptSettings {
  userId: string;
  morningEnabled: boolean;
  /** минуты от полуночи (локальное) */
  morningTime: number;
  eveningEnabled: boolean;
  eveningTime: number;
  /** тихие часы; поддерживают переход через полночь (start > end) */
  quietStart: number;
  quietEnd: number;
  /** не напоминать, если недавно уже был ручной check-in */
  skipIfRecentCheckin: boolean;
  updatedAt: string;
}

/** mood_prompt_log — для бюджета и аналитики */
export interface MoodPromptLog {
  id: string;
  userId: string;
  promptType: PromptType;
  action: PromptAction;
  /** epoch ms — абсолютный момент (аналог timestamptz) */
  createdAt: number;
}

/* ---------- Flow Sessions (focus_sessions) ---------- */

export type FlowType = "deep" | "creative" | "light" | "rest";

export interface FlowPreset {
  type: FlowType;
  label: string;
  desc: string;
  focusMin: number;
  breakMin: number;
}

export interface FocusSession {
  id: string;
  userId: string;
  /** YYYY-MM-DD */
  date: string;
  startedAt: string;
  type: FlowType;
  plannedFocusMin: number;
  plannedBreakMin: number;
  /** фактически накопленный фокус, мин */
  focusMin: number;
  breakMin: number;
  /** завершённые focus-фазы */
  cycles: number;
  /** true — сессия завершена пользователем, false — брошена */
  completed: boolean;
  sounds: string[];
}

/* ---------- Smart Suggestions (спека v1.0, §8) ---------- */

export type SuggestionKind =
  | "golden_hour"
  | "best_time"
  | "duration"
  | "reschedule"
  | "overload"
  | "break_down"
  | "briefing_am"
  | "briefing_pm";

export type SuggestionState = "created" | "shown" | "accepted" | "dismissed" | "snoozed" | "expired";

export interface SuggestionContext {
  taskId?: string;
  date?: string;
  startMin?: number;
  endMin?: number;
  proposedDate?: string;
  proposedStartMin?: number;
  subtasks?: { title: string; durationMin: number }[];
  estimatedMin?: number;
  scheduledMin?: number;
}

export interface Suggestion {
  id: string;
  userId: string;
  kind: SuggestionKind;
  title: string;
  body: string;
  context: SuggestionContext;
  priority: number;
  state: SuggestionState;
  shownAt?: number;
  expiresAt?: number;
  snoozeUntil?: number;
  dedupKey: string;
  createdAt: number;
}

/** suggestion_feedback (§8) — обучение ранкера. */
export interface SuggestionFeedback {
  id: string;
  userId: string;
  suggestionId: string;
  kind: SuggestionKind;
  action: "accepted" | "dismissed" | "snoozed";
  createdAt: number;
}

/** user_productivity_slots (§8) — агрегированные золотые слоты. */
export interface ProductivitySlot {
  userId: string;
  slotIndex: number; // 0..47
  score: number;
  computedAt: number;
}

/* ---------- Task Templates ---------- */

export interface TaskTemplate {
  id: string;
  userId: string;
  title: string;
  icon: string;
  color: TaskColor;
  durationMin: number;
  energy: EnergyLevel;
  tags: string[];
  timeHint?: string;
}

/* ---------- Mood Journal 2.1 · Фаза C (user_mood_correlations) ---------- */

export type CorrelationSignalType = "categorical" | "numeric";
export type CorrelationConfidence = "low" | "medium" | "high";
export type CorrelationDirection = "up" | "down" | "flat";

/**
 * Сохранённая корреляция настроения с сигналом.
 * Полные объясняемые поля нужны для «Почему я это вижу?» (Фаза E).
 */
/* ---------- Mood Insights: feedback и события (Фаза E) ---------- */

export type InsightStatus = "active" | "accepted" | "dismissed" | "stale";
export type InsightEventType = "shown" | "explain_opened" | "accepted" | "dismissed";

/** mood_insight_feedback — состояние инсайта по (user_id, signal_key). */
export interface MoodInsightFeedback {
  userId: string;
  signalKey: string;
  status: InsightStatus;
  /** epoch ms первого показа; null — инсайт ещё не показывался («новый») */
  firstShownAt: number | null;
  feedbackAt: number | null;
  /** отклонён до этого момента (now + 14 дней) */
  dismissedUntil: number | null;
}

/** mood_insight_events — журнал событий для метрик доверия. */
export interface MoodInsightEvent {
  id: string;
  userId: string;
  signalKey: string;
  event: InsightEventType;
  createdAt: number;
}

/* ============================================================
 * Журнал экспорта (Фаза F). Логируется ТОЛЬКО факт действия
 * (тип, число записей, период) — никогда содержимое (спека §14).
 * ============================================================ */

export interface MoodExportLog {
  id: string;
  userId: string;
  kind: "csv" | "pdf";
  count: number;
  /** человекочитаемый период, напр. «с 2026-02-01 по 2026-02-28» */
  period: string;
  createdAt: number; // epoch ms
}

export interface MoodCorrelation {
  userId: string;
  /** 'tag:exercise' | 'weekday:mon' | 'habit:<id>' | 'num:focus_minutes' */
  signalKey: string;
  signalType: CorrelationSignalType;
  /** '30d' */
  period: string;
  sampleSize: number;
  baseline: number;
  observedValue: number;
  effectSize: number;
  confidence: CorrelationConfidence;
  direction: CorrelationDirection;
  computedAt: number;
}

/* ---------- синхронизация с внешним календарём ---------- */

export interface ExternalEvent {
  externalId: string;
  title: string;
  date: string;
  startMin: number;
  endMin: number;
}

export interface SyncState {
  connected: boolean;
  account?: string;
  autoSync: boolean;
  lastSyncAt?: number;
  syncing: boolean;
  /** удалённые события календаря — не импортировать повторно */
  removedExternalIds?: string[];
}

export interface SyncLogLine {
  at: number;
  text: string;
  kind: "info" | "ok" | "warn";
}

/* ---------- UI ---------- */

export type TabId = "today" | "flow" | "rhythm" | "journal" | "mood" | "character" | "together" | "insights";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  kind: "success" | "info" | "error";
  text: string;
  actions?: ToastAction[];
}
