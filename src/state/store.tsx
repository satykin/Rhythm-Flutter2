/* ============================================================
 * Глобальное состояние Rhythm (аналог Riverpod-контроллеров).
 * Все мутации проходят через db (слой данных) → коммит в кэш.
 * ============================================================ */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { db, sessionStore } from "../lib/db";
import { data, type AuthUser } from "../lib/data";
import { seedFor } from "../lib/seed";
import { googleProvider } from "../lib/sync";
import { clamp, hmToMin, todayKey, uid, DAY_END } from "../lib/time";
import { parseRRule, occurrences } from "../features/timeline/recurrence";
import { findCollisions, freeSlotOptions, resolveSlot, type SlotCheckResult } from "../features/timeline/conflicts";
import { act } from "../features/suggestions/data/SuggestionRepository";
import { reschedulePlan } from "../features/suggestions/domain/reschedule";
import { productivityWindows } from "../features/suggestions/suggestionService";
import { runScheduler } from "../features/suggestions/SuggestionScheduler";
import { startScheduler, registerWorker } from "../features/notify/notify";
import type {
  FocusSession, MoodLog, MoodPromptSettings, MoodSource, PromptType, Routine, Suggestion, SyncLogLine,
  SyncState, TabId, Task, TaskStatus, TaskTemplate, Toast, ToastAction, User,
} from "../lib/types";
import { MoodRepository, type NewMoodInput } from "../features/mood/data/MoodRepository";
import { MoodPromptRepository } from "../features/mood/data/MoodPromptRepository";
import { pickPrompt } from "../features/mood/domain/promptBudget";
import type { MoodFilters } from "../features/mood/domain/moodFilters";
import type { OverviewTab } from "../features/mood/domain/deeplinks";
import { withTimeout } from "../lib/data/withTimeout";
import { offlineQueue, isNetworkLikeError, type QueueOp, type QueueTable } from "../lib/data/offlineQueue";
import type { ProfilePatch } from "../lib/data/types";
import type { RoutineCompletion, SuggestionFeedback } from "../lib/types";

interface AppState {
  booted: boolean;
  user: User | null;
  tasks: Task[];
  routines: Routine[];
  moods: MoodLog[];
  templates: TaskTemplate[];
  suggestions: Suggestion[];
  focusSessions: FocusSession[];
  sync: SyncState;
  syncLog: SyncLogLine[];
  tab: TabId;
  toasts: Toast[];
  /* Mood Journal 2.1: глобальный Quick Check-In sheet */
  checkInOpen: boolean;
  checkInEditId: string | null;
  /** source записи, если чек-ин открыт из промпта (Фаза D) */
  checkInSource: MoodSource | null;
  /** раскрыть ли заметку сразу (вечерний промпт) */
  checkInOpenNote: boolean;
  /* Mood Prompts (Фаза D) */
  promptSettings: MoodPromptSettings | null;
  activePrompt: PromptType | null;
  /** Deep links Фазы F: данные из hash-маршрута (однократное потребление экраном). */
  deepLink: { filters: MoodFilters | null; entryId: string | null; overviewTab: OverviewTab | null };
}

const initial: AppState = {
  booted: false,
  user: null,
  tasks: [],
  routines: [],
  moods: [],
  templates: [],
  suggestions: [],
  focusSessions: [],
  sync: { connected: false, autoSync: true, syncing: false },
  syncLog: [],
  tab: "today",
  toasts: [],
  checkInOpen: false,
  checkInEditId: null,
  checkInSource: null,
  checkInOpenNote: false,
  promptSettings: null,
  activePrompt: null,
  deepLink: { filters: null, entryId: null, overviewTab: null },
};

/** Пустой deep link (после потребления экраном). */
const EMPTY_DEEP_LINK = { filters: null, entryId: null, overviewTab: null };

const DEFAULT_PREFS: User["notifications"] = {
  enabled: false,
  taskReminder: true,
  focusTime: true,
  morningBriefing: true,
  eveningReview: true,
};

export interface NewTaskInput {
  title: string;
  description: string;
  date: string;
  startMin: number;
  endMin: number;
  color: Task["color"];
  icon: string;
  tags: string[];
  energy: Task["energy"];
  recurrenceRule?: string;
}

export interface Ctx extends AppState {
  toast: (kind: Toast["kind"], text: string, actions?: ToastAction[]) => void;
  dismissToast: (id: number) => void;
  setTab: (t: TabId) => void;

  signIn: (email: string, pass: string) => Promise<string | null>;
  signUp: (name: string, email: string, pass: string) => Promise<string | null>;
  signInWith: (provider: "google" | "apple") => Promise<string | null>;
  signOut: () => Promise<void>;
  updateUser: (patch: Partial<User>) => void;

  addTask: (input: NewTaskInput) => Task | null;
  updateTask: (id: string, patch: Partial<Task>) => Task | null;
  removeTask: (id: string) => void;
  /** Проверка слота перед записью (фикс 11): free / коллизии + варианты переноса. */
  checkTaskSlot: (date: string, startMin: number, endMin: number, excludeId?: string) => SlotCheckResult;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  applyRoutine: (r: Routine) => { time: number } | null;

  saveMood: (input: NewMoodInput) => Promise<MoodLog | null>;
  updateMoodLog: (id: string, patch: Partial<Pick<MoodLog, "mood" | "note" | "tags" | "linkedTaskIds" | "date" | "timeMin">>) => Promise<void>;
  removeMoodLog: (id: string) => Promise<MoodLog | null>;
  restoreMoodLog: (entry: MoodLog) => Promise<void>;
  /* Quick Check-In sheet (Журнал 2.1) */
  openCheckIn: (entryId?: string, opts?: { source?: MoodSource; openNote?: boolean }) => void;
  closeCheckIn: () => void;

  /* Mood Prompts (Фаза D) */
  evaluatePrompts: () => void;
  dismissPrompt: () => void;
  savePromptSettings: (patch: Partial<Omit<MoodPromptSettings, "userId" | "updatedAt">>) => void;

  /* Deep links (Фаза F): роутер кладёт данные сюда, экран потребляет один раз. */
  consumeDeepLink: () => AppState["deepLink"];
  clearDeepLink: () => void;
  setDeepLink: (d: Partial<AppState["deepLink"]>) => void;

  logFocusSession: (s: Omit<FocusSession, "id" | "userId" | "date">) => FocusSession;

  addTemplate: (t: Omit<TaskTemplate, "id" | "userId">) => void;
  removeTemplate: (id: string) => void;

  pendingSuggestion: () => Suggestion | null;
  acceptSuggestion: (id: string) => void;
  dismissSuggestion: (id: string) => void;
  snoozeSuggestion: (id: string) => void;
  applyReschedule: () => number;

  connectCalendar: () => Promise<void>;
  disconnectCalendar: () => void;
  syncNow: (silent?: boolean) => Promise<void>;
  setAutoSync: (v: boolean) => void;

  wipeAndReseed: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

const SYNC_KEY = "rhythm.syncstate.v1";

/* Состояние синхронизации хранится per-user: аккаунты в одном браузере не делят его. */
function loadSyncState(userId: string): SyncState {
  try {
    const raw = localStorage.getItem(`${SYNC_KEY}:${userId}`);
    if (raw) return { ...initial.sync, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return initial.sync;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AppState>(initial);
  const toastId = useRef(1);
  const stateRef = useRef(state);
  stateRef.current = state;

  /* ---------- helpers ---------- */
  const patch = useCallback((p: Partial<AppState>) => setState((s) => ({ ...s, ...p })), []);

  const persistSync = useCallback((sync: SyncState) => {
    const userId = stateRef.current.user?.id;
    if (!userId) return;
    try { localStorage.setItem(`${SYNC_KEY}:${userId}`, JSON.stringify({ ...sync, syncing: false })); } catch { /* ignore */ }
  }, []);

  /* Материализация повторяющихся задач: создаёт экземпляры на 7 дней вперёд. */
  const materializeRecurrences = useCallback((userId: string) => {
    const parents = db.tasksOf(userId).filter((t) => t.recurrenceRule && !t.parentTaskId);
    const today = todayKey();
    for (const p of parents) {
      const rule = parseRRule(p.recurrenceRule!);
      if (!rule) continue;
      const dates = occurrences(rule, p.date, today, 7);
      for (const d of dates) {
        if (d === p.date) continue;
        const exists = db.tasksOf(userId).some((t) => t.parentTaskId === p.id && t.date === d);
        if (exists) continue;
        const now = new Date().toISOString();
        db.insertTask({
          ...p, id: uid(), date: d, status: "todo",
          parentTaskId: p.id, recurrenceRule: undefined, externalId: undefined,
          syncStatus: "local", createdAt: now, updatedAt: now,
        });
      }
    }
  }, []);

  const toast = useCallback((kind: Toast["kind"], text: string, actions?: ToastAction[]) => {
    const id = toastId.current++;
    setState((s) => ({ ...s, toasts: [...s.toasts.slice(-3), { id, kind, text, actions }] }));
    window.setTimeout(() => {
      setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
    }, actions ? 7000 : 3800);
  }, []);

  const netToastAt = useRef(0);
  const netToast = useCallback((kind: Toast["kind"], text: string) => {
    /* троттлинг сетевых тостов: не чаще раза в 5 секунд */
    const now = Date.now();
    if (now - netToastAt.current < 5000) return;
    netToastAt.current = now;
    toast(kind, text);
  }, [toast]);

  /* Подсказки: генерация кандидатов + дедупликация по ключу.
   * Фаза 1.5b: в remote-режиме ВСЕ чтения — через DataProvider; результат
   * гидрирует локальный кэш, и нижестоящая логика (scheduler, materialize,
   * корреляции) работает с актуальными данными. Сбой сети → работаем с кэшем. */
  const refreshFromDb = useCallback(async (userId: string) => {
    if (data.kind === "supabase") {
      try {
        const [tasks, routines, focusSessions, suggestionsRemote, templates, slots, moods] = await Promise.all([
          data.tasks.list(userId),
          data.routines.list(userId),
          data.focus.list(userId),
          data.suggestions.list(userId),
          data.templates.list(userId),
          data.slots.list(userId),
          data.moods.list(userId),
        ]);
        db.hydrateUser(userId, { tasks, routines, focusSessions, suggestions: suggestionsRemote, templates, slots, moods });
        await db.commit();
      } catch (e) {
        netToast("error", e instanceof Error ? e.message : "Не удалось загрузить данные — показан кэш");
      }
    }
    materializeRecurrences(userId);
    const suggestions = runScheduler(userId);
    patch({
      tasks: db.tasksOf(userId).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin),
      routines: db.routinesOf(userId),
      moods: db.moodsOf(userId),
      templates: db.templatesOf(userId),
      suggestions,
      focusSessions: db.focusSessionsOf(userId),
      promptSettings: MoodPromptRepository.getSettings(userId),
    });
  }, [materializeRecurrences, netToast, patch]);

  const dismissToast = useCallback((id: number) => {
    setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
  }, []);

  /**
   * Зеркалирует локальную запись в Supabase (fire-and-forget: UI уже
   * обновлён оптимистично). Сетевая ошибка → операция в офлайн-очередь
   * + тост «синхронизирую позже»; логическая ошибка → тост сразу (не глотаем).
   */
  const mirrorRemote = useCallback((
    userId: string,
    table: QueueTable,
    kind: "upsert" | "delete",
    payload: Record<string, unknown>,
    op: () => Promise<unknown>
  ) => {
    if (data.kind !== "supabase") return;
    op().catch((e) => {
      if (isNetworkLikeError(e)) {
        offlineQueue.push({ userId, table, kind, payload });
        netToast("info", "Нет связи с сервером — синхронизирую позже");
      } else {
        netToast("error", e instanceof Error ? e.message : "Ошибка синхронизации");
      }
    });
  }, [netToast]);

  /** Повтор операции из офлайн-очереди через провайдер. */
  const replayOp = useCallback((op: QueueOp): Promise<unknown> => {
    const p = op.payload as Record<string, unknown>;
    switch (op.table) {
      case "tasks":
        return op.kind === "delete"
          ? data.tasks.remove(op.userId, p.id as string)
          : data.tasks.upsert(p as unknown as Task);
      case "routines":
        return op.kind === "delete"
          ? data.routines.remove(op.userId, p.id as string)
          : data.routines.upsert(p as unknown as Routine);
      case "routine_completions":
        return op.kind === "delete"
          ? data.routines.removeCompletion(op.userId, p.id as string)
          : data.routines.insertCompletion(p as unknown as RoutineCompletion);
      case "focus_sessions":
        return data.focus.insert(p as unknown as FocusSession);
      case "suggestions":
        return op.kind === "delete"
          ? data.suggestions.remove(op.userId, p.id as string)
          : data.suggestions.upsert(p as unknown as Suggestion);
      case "suggestion_feedback":
        return data.suggestions.insertFeedback(p as unknown as SuggestionFeedback);
      case "user_profiles":
        return data.profiles.upsert(op.userId, p as unknown as ProfilePatch);
      case "task_templates":
        return op.kind === "delete"
          ? data.templates.remove(op.userId, p.id as string)
          : data.templates.upsert(p as unknown as TaskTemplate);
    }
  }, []);

  /** Слив офлайн-очереди: при входе и по событию 'online'. */
  const flushOffline = useCallback(async () => {
    const u = stateRef.current.user;
    if (data.kind !== "supabase" || !u) return;
    const ops = offlineQueue.list(u.id);
    if (!ops.length) return;
    let done = 0;
    for (const op of ops) {
      try {
        await replayOp(op);
        offlineQueue.remove(u.id, op.id);
        done++;
      } catch (e) {
        if (isNetworkLikeError(e)) break; /* всё ещё офлайн — остаток ждёт */
        offlineQueue.remove(u.id, op.id); /* перманентная ошибка — сбрасываем, чтобы не клинить */
        done++;
      }
    }
    if (done > 0) {
      await refreshFromDb(u.id);
      toast("success", `Синхронизировано изменений: ${done}`);
    }
  }, [refreshFromDb, replayOp, toast]);

  const seedInto = useCallback((user: User) => {
    const seeded = seedFor(user);
    seeded.tasks.forEach((t) => db.insertTask(t));
    seeded.routines.forEach((r) => db.insertRoutine(r));
    seeded.moods.forEach((m) => db.insertMood(m));
    seeded.templates.forEach((t) => db.insertTemplate(t));
    seeded.focusSessions.forEach((s) => db.insertFocusSession(s));
  }, []);

  /* boot-эффект перенесён ниже auth-секции (использует enterRemote). */

  /* ---------- auth ---------- */
  const enterAs = useCallback(async (user: User, isNew: boolean) => {
    if (isNew) seedInto(user);
    sessionStore.write(user.id);
    await db.commit();
    refreshFromDb(user.id);
    patch({ user, tab: "today", sync: { ...loadSyncState(user.id), syncing: false } });
  }, [patch, refreshFromDb, seedInto]);

  /**
   * Вход под реальным Supabase-пользователем (Фаза 1.5a).
   * Демо-данные НЕ сидируются (production стартует чистым — мастер-план §данные).
   * Профиль для UI-состояния собирается из auth-метаданных;
   * user_profiles (настройки) подключается в 1.5c.
   */
  const enterRemote = useCallback(async (authUser: AuthUser) => {
    const user: User = {
      id: authUser.id,
      name: authUser.name,
      email: authUser.email,
      provider: authUser.provider,
      accent: "violet", sleepHours: 7.5, createdAt: new Date().toISOString(),
      themePalette: "default", quietFrom: 22 * 60, quietTo: 8 * 60,
      notifications: { ...DEFAULT_PREFS },
    };
    /* Устойчивость входа: загрузка ограничена по времени, любая ошибка БД/сети
     * превращается в исключение с человекочитаемым текстом (его signIn/signUp
     * вернут на экран входа вместо вечного спиннера). */
    try {
      await withTimeout(refreshFromDb(user.id), 10_000, "загрузка данных");
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "неизвестная ошибка";
      /* preserve-caught-error: причина пробрасывается в cause (для логов/отладки).
       * Object.assign — вместо двухаргументного конструктора Error (lib ES2020). */
      throw Object.assign(new Error(`Не удалось загрузить данные (${msg}). Попробуйте ещё раз.`), { cause: e });
    }
    patch({ user, tab: "today", sync: { ...initial.sync, syncing: false } });
    /* Фаза 1.5b: вход/восстановление сессии — сливаем накопленную офлайн-очередь. */
    void flushOffline();
  }, [flushOffline, patch, refreshFromDb]);

  const signUp = useCallback(async (name: string, email: string, pass: string) => {
    const res = await data.signUp(name, email, pass);
    if (res.error || !res.user) return res.error ?? "Не удалось создать аккаунт";
    if (data.kind === "supabase") {
      try {
        await enterRemote(res.user);
      } catch (e) {
        return e instanceof Error ? e.message : "Не удалось загрузить данные — попробуйте ещё раз";
      }
      return null;
    }
    const local = db.findUserByEmail(email);
    if (local) await enterAs(local, true);
    return null;
  }, [enterAs, enterRemote]);

  const signIn = useCallback(async (email: string, pass: string) => {
    const res = await data.signIn(email, pass);
    if (res.error || !res.user) return res.error ?? "Не удалось войти";
    if (data.kind === "supabase") {
      try {
        await enterRemote(res.user);
      } catch (e) {
        /* Ошибка загрузки данных: пользователь не входит, на экране — текст
         * ошибки, кнопка снова активна. Сессия Supabase сохранена — повтор
         * входа или перезагрузка страницы повторит загрузку. */
        return e instanceof Error ? e.message : "Не удалось загрузить данные — попробуйте ещё раз";
      }
      return null;
    }
    const local = db.findUserByEmail(email);
    if (!local) return "Аккаунт не найден — создайте новый";
    if (db.tasksOf(local.id).length === 0) seedInto(local);
    await enterAs(local, false);
    return null;
  }, [enterAs, enterRemote, seedInto]);

  const signInWith = useCallback(async (provider: "google" | "apple") => {
    const res = await data.signInWithOAuth(provider);
    if (res.error) return res.error;
    /* Supabase: произошёл редирект к провайдеру — сессию подхватит onAuthChange. */
    if (data.kind === "supabase") return null;
    const authU = await data.getSession();
    const local = authU ? db.get().users.find((u) => u.id === authU.id) ?? null : null;
    if (local) await enterAs(local, db.tasksOf(local.id).length === 0);
    return null;
  }, [enterAs]);

  const signOut = useCallback(async () => {
    await data.signOut();
    patch({ user: null, tasks: [], routines: [], moods: [], templates: [], suggestions: [], focusSessions: [], tab: "today", sync: initial.sync, syncLog: [] });
  }, [patch]);

  /* ---------- boot (после auth: нужен enterRemote) ---------- */
  useEffect(() => {
    void (async () => {
      await db.boot();

      if (data.kind === "supabase") {
        /* Реальный бэкенд: сессию отдаёт Supabase; OAuth-возврат и выход
           ловим через onAuthChange. Демо-данные не сидируются. */
        const u = await data.getSession();
        if (u) await enterRemote(u);
        patch({ booted: true });
        return;
      }

      /* Локальный демо-режим: сессия в localStorage, демо-сид при первом входе. */
      const sid = sessionStore.read();
      const user = sid ? db.get().users.find((x) => x.id === sid) ?? null : null;
      if (user) {
        if (db.tasksOf(user.id).length === 0) {
          seedInto(user);
          await db.commit();
        }
        refreshFromDb(user.id);
        patch({ user, sync: { ...loadSyncState(user.id), syncing: false } });
      }
      patch({ booted: true });
    })();

    void registerWorker();
    startScheduler(() => {
      const st = stateRef.current;
      if (!st.user) return null;
      return {
        prefs: st.user.notifications,
        quietFrom: st.user.quietFrom,
        quietTo: st.user.quietTo,
        tasks: st.tasks,
      };
    });

    /* Supabase: OAuth-редирект / выход из другой вкладки */
    const unsubscribe = data.onAuthChange((u) => {
      if (data.kind !== "supabase") return;
      if (u) void enterRemote(u);
      else patch({ user: null, tasks: [], routines: [], moods: [], templates: [], suggestions: [], focusSessions: [], tab: "today", sync: initial.sync, syncLog: [] });
    });

    /* Фаза 1.5b: возвращение сети — сливаем офлайн-очередь. */
    const onOnline = () => void flushOffline();
    window.addEventListener("online", onOnline);

    return () => {
      unsubscribe();
      window.removeEventListener("online", onOnline);
    };
  }, [enterRemote, flushOffline, patch, refreshFromDb, seedInto]);

  const updateUser = useCallback((p: Partial<User>) => {
    const u = stateRef.current.user;
    if (!u) return;
    const next = { ...u, ...p };
    db.updateUser(next);
    void db.commit();
    patch({ user: next });
  }, [patch]);

  /* ---------- tasks ---------- */
  const addTask = useCallback((input: NewTaskInput): Task | null => {
    const u = stateRef.current.user!;
    /* Разведение по слотам: одновременно — одна задача (фикс 7).
     * Фикс 11: молча НЕ переносим — при коллизии задача не создаётся
     * (null), а UI через checkTaskSlot показывает диалог с вариантами.
     * Skipped-задачи не считаются занятыми: пропуск освобождает время. */
    const occupied = db
      .tasksOf(u.id)
      .filter((x) => x.date === input.date && !x.recurrenceRule && x.status !== "skipped");
    if (findCollisions(occupied, input.startMin, input.endMin).length) return null;

    const connected = stateRef.current.sync.connected;
    const now = new Date().toISOString();
    const task: Task = {
      id: uid(), userId: u.id, ...input,
      status: "todo", source: "local",
      syncStatus: connected ? "pending" : "local",
      createdAt: now, updatedAt: now,
    };
    /* Ошибки записи задачи не глотаем: показываем тост (контур фикса ошибок). */
    try {
      db.insertTask(task);
      if (task.recurrenceRule) materializeRecurrences(u.id);
      void db.commit();
    } catch (e) {
      toast("error", `Не удалось сохранить задачу: ${e instanceof Error ? e.message : "неизвестная ошибка"}`);
    }
    /* Фаза 1.5b: зеркалируем в Supabase (в remote-режиме); офлайн → очередь. */
    mirrorRemote(u.id, "tasks", "upsert", task as unknown as Record<string, unknown>, () => data.tasks.upsert(task));
    refreshFromDb(u.id);
    return task;
  }, [materializeRecurrences, mirrorRemote, refreshFromDb, toast]);

  const updateTask = useCallback((id: string, p: Partial<Task>): Task | null => {
    const u = stateRef.current.user!;
    const t = db.tasksOf(u.id).find((x) => x.id === id);
    if (!t) return null;

    /* Разведение по слотам: одновременно — одна задача (фикс 7).
     * Фикс 11: перенос/смена дня при коллизии молча отклоняются (null) —
     * UI через checkTaskSlot показывает диалог с вариантами переноса.
     * Resize — по-прежнему кламп до ближайшей следующей задачи. */
    const dateChanged = p.date !== undefined && p.date !== t.date;
    const startChanged = p.startMin !== undefined && p.startMin !== t.startMin;
    if (dateChanged || startChanged) {
      const targetDate = p.date ?? t.date;
      const startMin = p.startMin ?? t.startMin;
      const endMin = p.endMin ?? startMin + (t.endMin - t.startMin);
      const occupied = db
        .tasksOf(u.id)
        .filter((x) => x.date === targetDate && x.id !== id && !x.recurrenceRule && x.status !== "skipped");
      if (findCollisions(occupied, startMin, endMin).length) return null;
    } else if (p.endMin !== undefined && p.endMin !== t.endMin) {
      const occupied = db
        .tasksOf(u.id)
        .filter((x) => x.date === t.date && x.id !== id && !x.recurrenceRule && x.status !== "skipped" && x.startMin > t.startMin);
      const limit = occupied.length ? Math.min(...occupied.map((x) => x.startMin)) : DAY_END;
      p = { ...p, endMin: clamp(p.endMin, t.startMin + 15, limit) };
    }

    const connected = stateRef.current.sync.connected;
    const next: Task = {
      ...t, ...p, updatedAt: new Date().toISOString(),
      syncStatus: connected && !t.parentTaskId ? "pending" : t.syncStatus,
    };
    try {
      db.updateTask(next);
      if (next.recurrenceRule && !next.parentTaskId) materializeRecurrences(u.id);
      void db.commit();
    } catch (e) {
      toast("error", `Не удалось обновить задачу: ${e instanceof Error ? e.message : "неизвестная ошибка"}`);
    }
    mirrorRemote(u.id, "tasks", "upsert", next as unknown as Record<string, unknown>, () => data.tasks.upsert(next));
    refreshFromDb(u.id);
    return next;
  }, [materializeRecurrences, mirrorRemote, refreshFromDb, toast]);

  /**
   * Проверка слота перед записью (фикс 11). Чистое чтение:
   * free=true — можно писать; иначе colliding (для текста диалога)
   * и proposals (ближайшие свободные окна той же длительности).
   */
  const checkTaskSlot = useCallback(
    (date: string, startMin: number, endMin: number, excludeId?: string): SlotCheckResult => {
      const u = stateRef.current.user;
      if (!u) return { free: true, colliding: [], proposals: [] };
      const occupied = db
        .tasksOf(u.id)
        .filter((x) => x.date === date && x.id !== excludeId && !x.recurrenceRule && x.status !== "skipped");
      const colliding = findCollisions(occupied, startMin, endMin).map((t) => ({
        id: t.id,
        title: t.title,
        startMin: t.startMin,
        endMin: t.endMin,
      }));
      if (!colliding.length) return { free: true, colliding: [], proposals: [] };
      /* Первичное предложение — resolveSlot (ближайший слот, вперёд или назад);
       * затем — альтернативы из freeSlotOptions (до 3 уникальных вариантов). */
      const dur = endMin - startMin;
      const primary = resolveSlot(occupied, startMin, dur);
      const proposals: { startMin: number; endMin: number }[] = [];
      if (primary) proposals.push({ startMin: primary.startMin, endMin: primary.endMin });
      for (const alt of freeSlotOptions(occupied, startMin, dur)) {
        if (proposals.length >= 3) break;
        if (!proposals.some((p) => p.startMin === alt.startMin)) proposals.push(alt);
      }
      return { free: false, colliding, proposals };
    },
    []
  );

  const removeTask = useCallback((id: string) => {
    const st = stateRef.current;
    const u = st.user!;
    const t = db.tasksOf(u.id).find((x) => x.id === id);
    try {
      db.removeTask(id);
      /* Tombstone: удалённое событие календаря не должно вернуться при следующем pull. */
      if (t?.externalId) {
        const removed = st.sync.removedExternalIds ?? [];
        if (!removed.includes(t.externalId)) {
          const sync = { ...st.sync, removedExternalIds: [...removed, t.externalId] };
          patch({ sync });
          persistSync(sync);
        }
      }
      void db.commit();
    } catch (e) {
      toast("error", `Не удалось удалить задачу: ${e instanceof Error ? e.message : "неизвестная ошибка"}`);
    }
    mirrorRemote(u.id, "tasks", "delete", { id }, () => data.tasks.remove(u.id, id));
    refreshFromDb(u.id);
  }, [mirrorRemote, patch, persistSync, refreshFromDb, toast]);

  const setTaskStatus = useCallback((id: string, status: TaskStatus) => {
    updateTask(id, { status });
  }, [updateTask]);

  const applyRoutine = useCallback((r: Routine) => {
    const u = stateRef.current.user!;
    const today = todayKey();
    const dayTasks = db.tasksOf(u.id).filter((t) => t.date === today && t.status !== "skipped");
    const maxStart = 23 * 60 - r.durationMin;
    let start = clamp(hmToMin(r.timeHint), 6 * 60, Math.max(6 * 60, maxStart));
    const overlaps = (s: number, e: number) => dayTasks.some((t) => s < t.endMin && e > t.startMin);
    let guard = 0;
    while (overlaps(start, start + r.durationMin) && guard++ < 60 && start <= maxStart) start += 15;
    if (overlaps(start, start + r.durationMin) || start > maxStart) return null;
    const created = addTask({
      title: r.title, description: "", date: today,
      startMin: start, endMin: start + r.durationMin,
      color: r.color, icon: r.icon, tags: ["рутина"], energy: "low",
    });
    return created ? { time: created.startMin } : null;
  }, [addTask]);

  /* ---------- mood (Журнал 2.1, Фаза A; с Фаза 1.5a — через DataProvider) ----------
   * Append-модель: каждый чек-ин — отдельная запись (разрешено несколько в день).
   * «Состояние сегодня» = последняя запись дня (latestMoodOfDay).
   * Режим Supabase: записи живут в mood_logs (RLS), конфликты — по updated_at. */
  const completePromptIfNeeded = useCallback((userId: string, source: MoodLog["source"]) => {
    const active = stateRef.current.activePrompt;
    if (active && (source === "morning" || source === "evening") && source === active) {
      MoodPromptRepository.log(userId, active, "completed");
      patch({ activePrompt: null });
    }
  }, [patch]);

  const saveMood = useCallback(async (input: NewMoodInput): Promise<MoodLog | null> => {
    const u = stateRef.current.user!;
    /* Связи — только те, что пользователь явно подтвердил (спека §7:
     * система предлагает, пользователь выбирает). Никакой тихой автопривязки. */
    const entry = MoodRepository.build(u.id, input, input.linkedTaskIds ?? []);
    if (!entry) return null;

    if (data.kind === "supabase") {
      try {
        const saved = await data.moods.insert(entry);
        completePromptIfNeeded(u.id, saved.source);
        await refreshFromDb(u.id);
        return saved;
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Не удалось сохранить запись");
        return null;
      }
    }

    db.insertMood(entry);
    completePromptIfNeeded(u.id, entry.source);
    void db.commit();
    refreshFromDb(u.id);
    return entry;
  }, [completePromptIfNeeded, refreshFromDb, toast]);

  const updateMoodLog = useCallback(async (id: string, p: Partial<Pick<MoodLog, "mood" | "note" | "tags" | "linkedTaskIds" | "date" | "timeMin">>) => {
    const u = stateRef.current.user!;

    if (data.kind === "supabase") {
      const existing = stateRef.current.moods.find((m) => m.id === id);
      if (!existing) return;
      try {
        await data.moods.update({ ...existing, ...p, updatedAt: new Date().toISOString() });
        await refreshFromDb(u.id);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Не удалось обновить запись");
      }
      return;
    }

    MoodRepository.update(id, p);
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb, toast]);

  const removeMoodLog = useCallback(async (id: string): Promise<MoodLog | null> => {
    const u = stateRef.current.user!;

    if (data.kind === "supabase") {
      const removed = stateRef.current.moods.find((m) => m.id === id) ?? null;
      if (!removed) return null;
      try {
        await data.moods.remove(u.id, id);
        await refreshFromDb(u.id);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Не удалось удалить запись");
        return null;
      }
      return removed;
    }

    const removed = MoodRepository.remove(id);
    if (removed) {
      void db.commit();
      refreshFromDb(u.id);
    }
    return removed;
  }, [refreshFromDb, toast]);

  const restoreMoodLog = useCallback(async (entry: MoodLog) => {
    const u = stateRef.current.user!;
    if (data.kind === "supabase") {
      try {
        await data.moods.insert(entry);
        await refreshFromDb(u.id);
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Не удалось восстановить запись");
      }
      return;
    }
    MoodRepository.restore(entry);
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb, toast]);

  /* ---------- Quick Check-In sheet ---------- */
  const openCheckIn = useCallback((entryId?: string, opts?: { source?: MoodSource; openNote?: boolean }) => {
    patch({
      checkInOpen: true,
      checkInEditId: entryId ?? null,
      checkInSource: opts?.source ?? null,
      checkInOpenNote: opts?.openNote ?? false,
    });
  }, [patch]);

  const closeCheckIn = useCallback(() => {
    patch({ checkInOpen: false, checkInEditId: null, checkInSource: null, checkInOpenNote: false });
  }, [patch]);

  /* ---------- Mood Prompts (Фаза D) ---------- */
  /** Пересчёт: положен ли промпт прямо сейчас? (идемпотентно, не чаще 1 активного) */
  const evaluatePrompts = useCallback(() => {
    const st = stateRef.current;
    const u = st.user;
    if (!u) return;
    if (st.activePrompt || st.checkInOpen) return; // уже активен — не дублируем
    const settings = MoodPromptRepository.getSettings(u.id);
    const pSettings = MoodPromptRepository.toPromptSettings(settings);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const state = MoodPromptRepository.computeBudgetState(u.id, Date.now());
    const next = pickPrompt(nowMin, Date.now(), pSettings, state);
    if (next) {
      MoodPromptRepository.log(u.id, next, "shown");
      void db.commit();
      patch({ activePrompt: next });
    }
  }, [patch]);

  /** «Не сейчас» — пишем dismissed, скрываем, тип сегодня больше не показывается. */
  const dismissPrompt = useCallback(() => {
    const st = stateRef.current;
    const u = st.user;
    const type = st.activePrompt;
    if (!u || !type) return;
    MoodPromptRepository.log(u.id, type, "dismissed");
    void db.commit();
    patch({ activePrompt: null });
  }, [patch]);

  const savePromptSettings = useCallback((p: Partial<Omit<MoodPromptSettings, "userId" | "updatedAt">>) => {
    const u = stateRef.current.user;
    if (!u) return;
    const next = MoodPromptRepository.saveSettings(u.id, p);
    void db.commit();
    patch({ promptSettings: next });
  }, [patch]);

  /* ---------- deep links (Фаза F) ---------- */
  /** Экран забирает данные маршрута ровно один раз (затем они гасятся). */
  const consumeDeepLink = useCallback((): AppState["deepLink"] => {
    const d = stateRef.current.deepLink;
    if (d.filters || d.entryId || d.overviewTab) patch({ deepLink: EMPTY_DEEP_LINK });
    return d;
  }, [patch]);

  const clearDeepLink = useCallback(() => patch({ deepLink: EMPTY_DEEP_LINK }), [patch]);

  const setDeepLink = useCallback(
    (d: Partial<AppState["deepLink"]>) => patch({ deepLink: { ...EMPTY_DEEP_LINK, ...d } }),
    [patch]
  );

  /* ---------- flow sessions ---------- */
  const logFocusSession = useCallback((s: Omit<FocusSession, "id" | "userId" | "date">): FocusSession => {
    const u = stateRef.current.user!;
    const session: FocusSession = { ...s, id: uid(), userId: u.id, date: s.startedAt.slice(0, 10) };
    db.insertFocusSession(session);
    void db.commit();
    /* Фикс 7: без зеркала строка терялась в Supabase-режиме (refreshFromDb
     * перечитывает focus_sessions с сервера). Офлайн → очередь. */
    mirrorRemote(u.id, "focus_sessions", "upsert", session as unknown as Record<string, unknown>, () => data.focus.insert(session));
    refreshFromDb(u.id);
    return session;
  }, [mirrorRemote, refreshFromDb]);

  /* ---------- templates ---------- */
  const addTemplate = useCallback((t: Omit<TaskTemplate, "id" | "userId">) => {
    const u = stateRef.current.user!;
    db.insertTemplate({ ...t, id: uid(), userId: u.id });
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb]);

  const removeTemplate = useCallback((id: string) => {
    const u = stateRef.current.user!;
    db.removeTemplate(id);
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb]);

  /* ---------- suggestions (Smart Suggestions Engine, спека v1.0) ---------- */
  const pendingSuggestion = useCallback((): Suggestion | null => {
    return stateRef.current.suggestions[0] ?? null;
  }, []);

  const suggestionAct = useCallback((id: string, action: "accepted" | "dismissed" | "snoozed") => {
    const u = stateRef.current.user;
    if (!u) return;
    act(u.id, id, action);
    refreshFromDb(u.id);
  }, [refreshFromDb]);

  const acceptSuggestion = useCallback((id: string) => suggestionAct(id, "accepted"), [suggestionAct]);

  const dismissSuggestion = useCallback((id: string) => suggestionAct(id, "dismissed"), [suggestionAct]);

  const snoozeSuggestion = useCallback((id: string) => {
    suggestionAct(id, "snoozed");
    toast("info", "Подсказка вернётся через 2 часа");
  }, [suggestionAct, toast]);

  const applyReschedule = useCallback((): number => {
    const u = stateRef.current.user!;
    const tasks = db.tasksOf(u.id);
    const plan = reschedulePlan(tasks, productivityWindows(tasks, db.focusSessionsOf(u.id)));
    for (const p of plan) {
      const t = tasks.find((x) => x.id === p.task.id);
      if (!t) continue;
      db.updateTask({
        ...t, date: p.date, startMin: p.startMin, endMin: p.endMin,
        status: "todo", movedCount: (t.movedCount ?? 0) + 1, updatedAt: new Date().toISOString(),
      });
    }
    if (plan.length) {
      void db.commit();
      refreshFromDb(u.id);
    }
    return plan.length;
  }, [refreshFromDb]);

  /* ---------- calendar sync ---------- */
  const log = useCallback((text: string, kind: SyncLogLine["kind"] = "info") => {
    setState((s) => ({ ...s, syncLog: [...s.syncLog.slice(-30), { at: Date.now(), text, kind }] }));
  }, []);

  const runSync = useCallback(async (silent: boolean) => {
    const st = stateRef.current;
    const u = st.user;
    if (!u || st.sync.syncing || !st.sync.connected) return;
    patch({ sync: { ...st.sync, syncing: true } });
    if (!silent) log("Синхронизация с Google Calendar…");

    try {
      /* pull */
      const events = await googleProvider.pull();
      const removed = new Set(stateRef.current.sync.removedExternalIds ?? []);
      const existing = new Set(db.tasksOf(u.id).map((t) => t.externalId).filter(Boolean));
      let pulled = 0;
      for (const ev of events) {
        if (existing.has(ev.externalId) || removed.has(ev.externalId)) continue;
        db.insertTask({
          id: uid(), userId: u.id, title: ev.title, description: "Импортировано из Google Calendar",
          date: ev.date, startMin: ev.startMin, endMin: ev.endMin,
          color: "indigo", icon: "calendar", tags: ["календарь"], energy: "medium",
          status: "todo", source: "gcal", externalId: ev.externalId, syncStatus: "synced",
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        });
        pulled++;
      }

      /* push */
      const pending = db.tasksOf(u.id).filter((t) => t.syncStatus === "pending");
      let pushed = 0;
      if (pending.length > 0) {
        pushed = await googleProvider.push(pending.map((t) => t.title));
        for (const t of pending) db.updateTask({ ...t, syncStatus: "synced" });
      }

      await db.commit();
      refreshFromDb(u.id);
      const sync: SyncState = { ...stateRef.current.sync, syncing: false, lastSyncAt: Date.now() };
      patch({ sync });
      persistSync(sync);
      if (!silent) {
        log(`Готово: +${pulled} из календаря, ${pushed} отправлено`, "ok");
        toast("success", `Синхронизировано: ${pulled} получено, ${pushed} отправлено`);
      }
    } catch {
      patch({ sync: { ...stateRef.current.sync, syncing: false } });
      if (!silent) {
        log("Ошибка сети. Повторите позже", "warn");
        toast("error", "Не удалось синхронизировать календарь");
      }
    }
  }, [log, patch, persistSync, refreshFromDb, toast]);

  const connectCalendar = useCallback(async () => {
    patch({ sync: { ...stateRef.current.sync, syncing: true } });
    log("Подключение к Google…");
    try {
      const { account } = await googleProvider.connect();
      const sync: SyncState = { connected: true, account, autoSync: stateRef.current.sync.autoSync, syncing: false };
      patch({ sync });
      persistSync(sync);
      log(`Аккаунт подключён: ${account}`, "ok");
      toast("success", "Google Calendar подключён");
      await runSync(false);
    } catch {
      patch({ sync: { ...stateRef.current.sync, syncing: false } });
      toast("error", "Не удалось подключить Google Calendar");
    }
  }, [log, patch, persistSync, runSync, toast]);

  const disconnectCalendar = useCallback(() => {
    const sync: SyncState = { connected: false, autoSync: true, syncing: false };
    patch({ sync, syncLog: [] });
    persistSync(sync);
    toast("info", "Google Calendar отключён");
  }, [patch, persistSync, toast]);

  const setAutoSync = useCallback((v: boolean) => {
    const sync = { ...stateRef.current.sync, autoSync: v };
    patch({ sync });
    persistSync(sync);
  }, [patch, persistSync]);

  /* авто-синхронизация каждые 45 c */
  useEffect(() => {
    if (!state.sync.connected || !state.sync.autoSync) return;
    const t = window.setInterval(() => void runSync(true), 45_000);
    return () => window.clearInterval(t);
  }, [state.sync.connected, state.sync.autoSync, runSync]);

  /* ---------- сервис ---------- */
  const wipeAndReseed = useCallback(async () => {
    const u = stateRef.current.user;
    if (!u) return;
    await db.wipeUserData(u.id);
    seedInto(u);
    await db.commit();
    refreshFromDb(u.id);
    toast("success", "Демо-данные пересозданы");
  }, [refreshFromDb, seedInto, toast]);

  const value: Ctx = {
    ...state,
    toast, dismissToast, setTab: (t) => patch({ tab: t }),
    signIn, signUp, signInWith, signOut, updateUser,
    addTask, updateTask, removeTask, checkTaskSlot, setTaskStatus, applyRoutine,
    saveMood, updateMoodLog, removeMoodLog, restoreMoodLog, openCheckIn, closeCheckIn,
    evaluatePrompts, dismissPrompt, savePromptSettings,
    consumeDeepLink, clearDeepLink, setDeepLink,
    logFocusSession,
    addTemplate, removeTemplate,
    pendingSuggestion, acceptSuggestion, dismissSuggestion, snoozeSuggestion, applyReschedule,
    connectCalendar, disconnectCalendar, syncNow: (silent = false) => runSync(silent), setAutoSync,
    wipeAndReseed,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp outside AppProvider");
  return ctx;
}
