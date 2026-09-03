/* ============================================================
 * DataProvider — единый контракт доступа к данным (Фаза 1.5).
 * Две реализации:
 *   · local    — демо-режим (localStorage), используется без env-ключей
 *                и в dev/CI, чтобы текущие тесты не ломались;
 *   · supabase — реальный бэкенд (auth + PostgreSQL + RLS).
 * Переключение — по наличию VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 *
 * 1.5a: auth + mood_logs. 1.5b: tasks, routines (+completions),
 * focus_sessions, suggestions (+feedback), user_profiles,
 * user_productivity_slots, daily_stats, task_templates.
 * ============================================================ */

import type {
  DailyStat, FocusSession, MoodLog, ProductivitySlot, Routine, RoutineCompletion,
  Suggestion, SuggestionFeedback, Task, TaskTemplate,
} from "../types";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  provider: "email" | "google" | "apple";
}

export interface AuthResult {
  user?: AuthUser;
  /** человекочитаемая ошибка для показа в форме */
  error?: string;
}

export type OAuthProvider = "google" | "apple";

/* ---------- источники данных (каждый — CRUD в объёме store) ---------- */

export interface MoodsSource {
  list(userId: string): Promise<MoodLog[]>;
  insert(entry: MoodLog): Promise<MoodLog>;
  update(entry: MoodLog): Promise<MoodLog>;
  remove(userId: string, id: string): Promise<void>;
}

export interface TasksSource {
  list(userId: string): Promise<Task[]>;
  /** insert-or-update по id (идемпотентно — для офлайн-flush) */
  upsert(task: Task): Promise<Task>;
  remove(userId: string, id: string): Promise<void>;
}

export interface RoutinesSource {
  list(userId: string): Promise<Routine[]>;
  upsert(routine: Routine): Promise<Routine>;
  remove(userId: string, id: string): Promise<void>;
  listCompletions(userId: string, fromDate: string): Promise<RoutineCompletion[]>;
  insertCompletion(c: RoutineCompletion): Promise<void>;
  removeCompletion(userId: string, id: string): Promise<void>;
}

export interface FocusSource {
  list(userId: string): Promise<FocusSession[]>;
  insert(session: FocusSession): Promise<FocusSession>;
}

export interface SuggestionsSource {
  list(userId: string): Promise<Suggestion[]>;
  upsert(s: Suggestion): Promise<Suggestion>;
  remove(userId: string, id: string): Promise<void>;
  listFeedback(userId: string): Promise<SuggestionFeedback[]>;
  insertFeedback(f: SuggestionFeedback): Promise<void>;
}

/** Настройки профиля, синхронизируемые с user_profiles (1 строка на юзера). */
export interface ProfilePatch {
  displayName?: string;
  timezone?: string;
  accent?: string;
  themePalette?: string;
  sleepHours?: number;
  quietFrom?: number;
  quietTo?: number;
}

export interface ProfilesSource {
  get(userId: string): Promise<ProfilePatch | null>;
  upsert(userId: string, patch: ProfilePatch): Promise<void>;
}

export interface SlotsSource {
  list(userId: string): Promise<ProductivitySlot[]>;
  upsert(userId: string, slots: ProductivitySlot[]): Promise<void>;
}

export interface DailyStatsSource {
  list(userId: string, fromDate: string): Promise<DailyStat[]>;
}

export interface TemplatesSource {
  list(userId: string): Promise<TaskTemplate[]>;
  upsert(t: TaskTemplate): Promise<TaskTemplate>;
  remove(userId: string, id: string): Promise<void>;
}

export interface DataProvider {
  readonly kind: "local" | "supabase";

  getSession(): Promise<AuthUser | null>;
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;

  signUp(name: string, email: string, password: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signInWithOAuth(provider: OAuthProvider): Promise<AuthResult>;
  signOut(): Promise<void>;

  moods: MoodsSource;
  /* Фаза 1.5b */
  tasks: TasksSource;
  routines: RoutinesSource;
  focus: FocusSource;
  suggestions: SuggestionsSource;
  profiles: ProfilesSource;
  slots: SlotsSource;
  dailyStats: DailyStatsSource;
  templates: TemplatesSource;
}
