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

export interface MoodLog {
  id: string;
  userId: string;
  /** YYYY-MM-DD */
  date: string;
  timeMin: number;
  /** 1..5 */
  mood: number;
  note?: string;
  /* --- Mood Journal 2.0 --- */
  tags: string[];
  linkedTaskIds: string[];
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

/* ---------- Smart Suggestions ---------- */

export type SuggestionType = "golden_time" | "reschedule" | "procrastination" | "new_task_time" | "rest_window";
export type SuggestionStatus = "pending" | "accepted" | "dismissed" | "snoozed";

export interface Suggestion {
  id: string;
  userId: string;
  type: SuggestionType;
  title: string;
  detail: string;
  context: {
    taskId?: string;
    date?: string;
    startMin?: number;
    endMin?: number;
  };
  status: SuggestionStatus;
  snoozeUntil?: number;
  /** ключ дедупликации (type + контекст) */
  dedupKey: string;
  createdAt: string;
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

export type TabId = "today" | "flow" | "rhythm" | "journal" | "character" | "together" | "insights";

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
