/* ============================================================
 * Глобальное состояние Rhythm (аналог Riverpod-контроллеров).
 * Все мутации проходят через db (слой данных) → коммит в кэш.
 * ============================================================ */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { db, sessionStore } from "../lib/db";
import { seedFor } from "../lib/seed";
import { googleProvider } from "../lib/sync";
import { clamp, demoHash, hmToMin, nowMin, todayKey, uid } from "../lib/time";
import { parseRRule, occurrences } from "../features/timeline/recurrence";
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
};

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

interface Ctx extends AppState {
  toast: (kind: Toast["kind"], text: string, actions?: ToastAction[]) => void;
  dismissToast: (id: number) => void;
  setTab: (t: TabId) => void;

  signIn: (email: string, pass: string) => Promise<string | null>;
  signUp: (name: string, email: string, pass: string) => Promise<string | null>;
  signInWith: (provider: "google" | "apple") => Promise<string | null>;
  signOut: () => void;
  updateUser: (patch: Partial<User>) => void;

  addTask: (input: NewTaskInput) => Task;
  updateTask: (id: string, patch: Partial<Task>) => void;
  removeTask: (id: string) => void;
  setTaskStatus: (id: string, status: TaskStatus) => void;
  applyRoutine: (r: Routine) => { time: number } | null;

  saveMood: (input: NewMoodInput) => MoodLog | null;
  updateMoodLog: (id: string, patch: Partial<Pick<MoodLog, "mood" | "note" | "tags" | "linkedTaskIds" | "date" | "timeMin">>) => void;
  removeMoodLog: (id: string) => MoodLog | null;
  restoreMoodLog: (entry: MoodLog) => void;
  /* Quick Check-In sheet (Журнал 2.1) */
  openCheckIn: (entryId?: string, opts?: { source?: MoodSource; openNote?: boolean }) => void;
  closeCheckIn: () => void;

  /* Mood Prompts (Фаза D) */
  evaluatePrompts: () => void;
  dismissPrompt: () => void;
  savePromptSettings: (patch: Partial<Omit<MoodPromptSettings, "userId" | "updatedAt">>) => void;

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

  /* Подсказки: генерация кандидатов + дедупликация по ключу. */
  const refreshFromDb = useCallback((userId: string) => {
    materializeRecurrences(userId);
    const { suggestions } = runScheduler(userId);
    patch({
      tasks: db.tasksOf(userId).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin),
      routines: db.routinesOf(userId),
      moods: db.moodsOf(userId),
      templates: db.templatesOf(userId),
      suggestions,
      focusSessions: db.focusSessionsOf(userId),
      promptSettings: MoodPromptRepository.getSettings(userId),
    });
  }, [materializeRecurrences, patch]);

  const toast = useCallback((kind: Toast["kind"], text: string, actions?: ToastAction[]) => {
    const id = toastId.current++;
    setState((s) => ({ ...s, toasts: [...s.toasts.slice(-3), { id, kind, text, actions }] }));
    window.setTimeout(() => {
      setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
    }, actions ? 7000 : 3800);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
  }, []);

  const seedInto = useCallback((user: User) => {
    const seeded = seedFor(user);
    seeded.tasks.forEach((t) => db.insertTask(t));
    seeded.routines.forEach((r) => db.insertRoutine(r));
    seeded.moods.forEach((m) => db.insertMood(m));
    seeded.templates.forEach((t) => db.insertTemplate(t));
    seeded.focusSessions.forEach((s) => db.insertFocusSession(s));
  }, []);

  /* ---------- boot ---------- */
  useEffect(() => {
    (async () => {
      await db.boot();
      const sid = sessionStore.read();
      const user = sid ? db.get().users.find((u) => u.id === sid) ?? null : null;
      if (user) {
        if (db.tasksOf(user.id).length === 0) {
          seedInto(user);
          await db.commit();
        }
        refreshFromDb(user.id);
        patch({ user, sync: { ...loadSyncState(user.id), syncing: false } });
      }
      patch({ booted: true });
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
    })();
  }, [patch, refreshFromDb, seedInto]);

  /* ---------- auth ---------- */
  const enterAs = useCallback(async (user: User, isNew: boolean) => {
    if (isNew) seedInto(user);
    sessionStore.write(user.id);
    await db.commit();
    refreshFromDb(user.id);
    patch({ user, tab: "today", sync: { ...loadSyncState(user.id), syncing: false } });
  }, [patch, refreshFromDb, seedInto]);

  const signUp = useCallback(async (name: string, email: string, pass: string) => {
    await new Promise((r) => setTimeout(r, 700));
    if (db.findUserByEmail(email)) return "Аккаунт с такой почтой уже существует";
    const user: User = {
      id: uid(), name, email, passHash: demoHash(pass), provider: "email",
      accent: "violet", sleepHours: 7.5, createdAt: new Date().toISOString(),
      themePalette: "default", quietFrom: 22 * 60, quietTo: 8 * 60, notifications: { ...DEFAULT_PREFS },
    };
    db.insertUser(user);
    await enterAs(user, true);
    return null;
  }, [enterAs]);

  const signIn = useCallback(async (email: string, pass: string) => {
    await new Promise((r) => setTimeout(r, 600));
    const user = db.findUserByEmail(email);
    if (!user) return "Аккаунт не найден — создайте новый";
    if (user.provider === "email" && user.passHash !== demoHash(pass)) return "Неверный пароль";
    if (db.tasksOf(user.id).length === 0) seedInto(user);
    await enterAs(user, false);
    return null;
  }, [enterAs, seedInto]);

  const signInWith = useCallback(async (provider: "google" | "apple") => {
    await new Promise((r) => setTimeout(r, 1000));
    const email = provider === "google" ? "alex.day@gmail.com" : "alex@icloud.com";
    let user = db.findUserByEmail(email);
    const isNew = !user;
    if (!user) {
      user = {
        id: uid(), name: "Alex Day", email, provider,
        accent: provider === "google" ? "indigo" : "aqua", sleepHours: 7.5,
        createdAt: new Date().toISOString(),
        themePalette: "default", quietFrom: 22 * 60, quietTo: 8 * 60, notifications: { ...DEFAULT_PREFS },
      };
      db.insertUser(user);
    }
    await enterAs(user, isNew);
    return null;
  }, [enterAs]);

  const signOut = useCallback(() => {
    sessionStore.clear();
    patch({ user: null, tasks: [], routines: [], moods: [], templates: [], suggestions: [], focusSessions: [], tab: "today", sync: initial.sync, syncLog: [] });
  }, [patch]);

  const updateUser = useCallback((p: Partial<User>) => {
    const u = stateRef.current.user;
    if (!u) return;
    const next = { ...u, ...p };
    db.updateUser(next);
    void db.commit();
    patch({ user: next });
  }, [patch]);

  /* ---------- tasks ---------- */
  const addTask = useCallback((input: NewTaskInput) => {
    const u = stateRef.current.user!;
    const connected = stateRef.current.sync.connected;
    const now = new Date().toISOString();
    const task: Task = {
      id: uid(), userId: u.id, ...input,
      status: "todo", source: "local",
      syncStatus: connected ? "pending" : "local",
      createdAt: now, updatedAt: now,
    };
    db.insertTask(task);
    if (task.recurrenceRule) materializeRecurrences(u.id);
    void db.commit();
    refreshFromDb(u.id);
    return task;
  }, [materializeRecurrences, refreshFromDb]);

  const updateTask = useCallback((id: string, p: Partial<Task>) => {
    const u = stateRef.current.user!;
    const t = db.tasksOf(u.id).find((x) => x.id === id);
    if (!t) return;
    const connected = stateRef.current.sync.connected;
    const next: Task = {
      ...t, ...p, updatedAt: new Date().toISOString(),
      syncStatus: connected && !t.parentTaskId ? "pending" : t.syncStatus,
    };
    db.updateTask(next);
    if (next.recurrenceRule && !next.parentTaskId) materializeRecurrences(u.id);
    void db.commit();
    refreshFromDb(u.id);
  }, [materializeRecurrences, refreshFromDb]);

  const removeTask = useCallback((id: string) => {
    const st = stateRef.current;
    const u = st.user!;
    const t = db.tasksOf(u.id).find((x) => x.id === id);
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
    refreshFromDb(u.id);
  }, [patch, persistSync, refreshFromDb]);

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
    addTask({
      title: r.title, description: "", date: today,
      startMin: start, endMin: start + r.durationMin,
      color: r.color, icon: r.icon, tags: ["рутина"], energy: "low",
    });
    return { time: start };
  }, [addTask]);

  /* ---------- mood (Журнал 2.1, Фаза A) ----------
   * Append-модель: каждый чек-ин — отдельная запись (разрешено несколько в день).
   * «Состояние сегодня» = последняя запись дня (latestMoodOfDay). */
  const saveMood = useCallback((input: NewMoodInput): MoodLog | null => {
    const u = stateRef.current.user!;
    /* Связи — только те, что пользователь явно подтвердил (спека §7:
     * система предлагает, пользователь выбирает). Никакой тихой автопривязки. */
    const entry = MoodRepository.add(u.id, input, input.linkedTaskIds ?? []);
    if (!entry) return null;
    /* Если запись создана из промпта — логируем completed и гасим карточку. */
    const active = stateRef.current.activePrompt;
    if (active && (entry.source === "morning" || entry.source === "evening") && entry.source === active) {
      MoodPromptRepository.log(u.id, active, "completed");
      patch({ activePrompt: null });
    }
    void db.commit();
    refreshFromDb(u.id);
    return entry;
  }, [patch, refreshFromDb]);

  const updateMoodLog = useCallback((id: string, p: Partial<Pick<MoodLog, "mood" | "note" | "tags" | "linkedTaskIds" | "date" | "timeMin">>) => {
    const u = stateRef.current.user!;
    MoodRepository.update(id, p);
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb]);

  const removeMoodLog = useCallback((id: string): MoodLog | null => {
    const u = stateRef.current.user!;
    const removed = MoodRepository.remove(id);
    if (removed) {
      void db.commit();
      refreshFromDb(u.id);
    }
    return removed;
  }, [refreshFromDb]);

  const restoreMoodLog = useCallback((entry: MoodLog) => {
    const u = stateRef.current.user!;
    MoodRepository.restore(entry);
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb]);

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

  /* ---------- flow sessions ---------- */
  const logFocusSession = useCallback((s: Omit<FocusSession, "id" | "userId" | "date">): FocusSession => {
    const u = stateRef.current.user!;
    const session: FocusSession = { ...s, id: uid(), userId: u.id, date: s.startedAt.slice(0, 10) };
    db.insertFocusSession(session);
    void db.commit();
    refreshFromDb(u.id);
    return session;
  }, [refreshFromDb]);

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
    addTask, updateTask, removeTask, setTaskStatus, applyRoutine,
    saveMood, updateMoodLog, removeMoodLog, restoreMoodLog, openCheckIn, closeCheckIn,
    evaluatePrompts, dismissPrompt, savePromptSettings,
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
