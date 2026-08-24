/* ============================================================
 * Rhythm — доменный слой (domain models)
 * Схемы идентичны будущим таблицам Supabase:
 *   users, tasks, routines, mood_logs
 * ============================================================ */

export type EnergyLevel = "low" | "medium" | "high";
export type TaskStatus = "todo" | "done" | "skipped";
export type TaskSource = "local" | "gcal" | "routine";
/** local — ещё не был в календаре, pending — изменён и ждёт push, synced — синхронизирован */
export type SyncStatus = "local" | "pending" | "synced";
export type AuthProvider = "email" | "google" | "apple";

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
}

export type TaskColor = "violet" | "indigo" | "aqua" | "amber" | "rose" | "lime" | "sky" | "slate";

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
  /** Tombstones: externalId удалённых событий — не ре-импортировать при pull. */
  removedExternalIds?: string[];
}

export interface SyncLogLine {
  at: number;
  text: string;
  kind: "info" | "ok" | "warn";
}

/* ---------- UI ---------- */

export type TabId = "today" | "rhythm" | "character" | "together" | "insights";

export interface Toast {
  id: number;
  kind: "success" | "info" | "error";
  text: string;
}
