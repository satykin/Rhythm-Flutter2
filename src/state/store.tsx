/* ============================================================
 * Глобальное состояние Rhythm (аналог Riverpod-контроллеров).
 * Все мутации проходят через db (слой данных) → коммит в кэш.
 * ============================================================ */

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { db, sessionStore } from "../lib/db";
import { seedFor } from "../lib/seed";
import { googleProvider } from "../lib/sync";
import { clamp, demoHash, hmToMin, nowMin, todayKey, uid } from "../lib/time";
import type {
  MoodLog, Routine, SyncLogLine, SyncState, TabId, Task, TaskStatus, Toast, User,
} from "../lib/types";

interface AppState {
  booted: boolean;
  user: User | null;
  tasks: Task[];
  routines: Routine[];
  moods: MoodLog[];
  sync: SyncState;
  syncLog: SyncLogLine[];
  tab: TabId;
  toasts: Toast[];
}

const initial: AppState = {
  booted: false,
  user: null,
  tasks: [],
  routines: [],
  moods: [],
  sync: { connected: false, autoSync: true, syncing: false },
  syncLog: [],
  tab: "today",
  toasts: [],
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
}

interface Ctx extends AppState {
  toast: (kind: Toast["kind"], text: string) => void;
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

  saveMood: (level: number, note?: string) => void;

  connectCalendar: () => Promise<void>;
  disconnectCalendar: () => void;
  syncNow: (silent?: boolean) => Promise<void>;
  setAutoSync: (v: boolean) => void;

  wipeAndReseed: () => Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);

const SYNC_KEY = "rhythm.syncstate.v1";

function loadSyncState(): SyncState {
  try {
    const raw = localStorage.getItem(SYNC_KEY);
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

  const refreshFromDb = useCallback((userId: string) => {
    patch({
      tasks: db.tasksOf(userId).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin),
      routines: db.routinesOf(userId),
      moods: db.moodsOf(userId),
    });
  }, [patch]);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = toastId.current++;
    setState((s) => ({ ...s, toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    window.setTimeout(() => {
      setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3800);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setState((s) => ({ ...s, toasts: s.toasts.filter((t) => t.id !== id) }));
  }, []);

  /* ---------- boot ---------- */
  useEffect(() => {
    (async () => {
      await db.boot();
      const sid = sessionStore.read();
      const user = sid ? db.get().users.find((u) => u.id === sid) ?? null : null;
      if (user) {
        if (db.tasksOf(user.id).length === 0) {
          const seeded = seedFor(user);
          seeded.tasks.forEach((t) => db.insertTask(t));
          seeded.routines.forEach((r) => db.insertRoutine(r));
          seeded.moods.forEach((m) => db.insertMood(m));
          await db.commit();
        }
        refreshFromDb(user.id);
        patch({ user, sync: { ...loadSyncState(), syncing: false } });
      }
      patch({ booted: true });
    })();
  }, [patch, refreshFromDb]);

  /* ---------- auth ---------- */
  const enterAs = useCallback(async (user: User, isNew: boolean) => {
    if (isNew) {
      const seeded = seedFor(user);
      seeded.tasks.forEach((t) => db.insertTask(t));
      seeded.routines.forEach((r) => db.insertRoutine(r));
      seeded.moods.forEach((m) => db.insertMood(m));
    }
    sessionStore.write(user.id);
    await db.commit();
    refreshFromDb(user.id);
    patch({ user, tab: "today", sync: { ...loadSyncState(), syncing: false } });
  }, [patch, refreshFromDb]);

  const signUp = useCallback(async (name: string, email: string, pass: string) => {
    await new Promise((r) => setTimeout(r, 700));
    if (db.findUserByEmail(email)) return "Аккаунт с такой почтой уже существует";
    const user: User = {
      id: uid(), name, email, passHash: demoHash(pass), provider: "email",
      accent: "violet", sleepHours: 7.5, createdAt: new Date().toISOString(),
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
    if (db.tasksOf(user.id).length === 0) {
      const seeded = seedFor(user);
      seeded.tasks.forEach((t) => db.insertTask(t));
      seeded.routines.forEach((r) => db.insertRoutine(r));
      seeded.moods.forEach((m) => db.insertMood(m));
    }
    await enterAs(user, false);
    return null;
  }, [enterAs]);

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
      };
      db.insertUser(user);
    }
    await enterAs(user, isNew);
    return null;
  }, [enterAs]);

  const signOut = useCallback(() => {
    sessionStore.clear();
    patch({ user: null, tasks: [], routines: [], moods: [], tab: "today", syncLog: [] });
  }, [patch]);

  const updateUser = useCallback((p: Partial<User>) => {
    const u = stateRef.current.user;
    if (!u) return;
    const next = { ...u, ...p };
    const sch = db.get();
    const i = sch.users.findIndex((x) => x.id === u.id);
    if (i >= 0) sch.users[i] = next;
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
    void db.commit();
    refreshFromDb(u.id);
    return task;
  }, [refreshFromDb]);

  const updateTask = useCallback((id: string, p: Partial<Task>) => {
    const u = stateRef.current.user!;
    const t = db.tasksOf(u.id).find((x) => x.id === id);
    if (!t) return;
    const connected = stateRef.current.sync.connected;
    const next: Task = {
      ...t, ...p, updatedAt: new Date().toISOString(),
      syncStatus: connected ? "pending" : t.syncStatus,
    };
    db.updateTask(next);
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb]);

  const removeTask = useCallback((id: string) => {
    const u = stateRef.current.user!;
    db.removeTask(id);
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb]);

  const setTaskStatus = useCallback((id: string, status: TaskStatus) => {
    updateTask(id, { status });
  }, [updateTask]);

  const applyRoutine = useCallback((r: Routine) => {
    const u = stateRef.current.user!;
    const today = todayKey();
    const dayTasks = db.tasksOf(u.id).filter((t) => t.date === today && t.status !== "skipped");
    let start = clamp(hmToMin(r.timeHint), 6 * 60, 23 * 60 - r.durationMin);
    const overlaps = (s: number, e: number) => dayTasks.some((t) => s < t.endMin && e > t.startMin);
    let guard = 0;
    while (overlaps(start, start + r.durationMin) && guard++ < 60) start += 15;
    if (overlaps(start, start + r.durationMin)) return null;
    addTask({
      title: r.title, description: "", date: today,
      startMin: start, endMin: start + r.durationMin,
      color: r.color, icon: r.icon, tags: ["рутина"], energy: "low",
    });
    return { time: start };
  }, [addTask]);

  /* ---------- mood ---------- */
  const saveMood = useCallback((level: number, note?: string) => {
    const u = stateRef.current.user!;
    const today = todayKey();
    const existing = db.moodsOf(u.id).find((m) => m.date === today);
    if (existing) {
      db.updateMood({ ...existing, mood: level, note: note ?? existing.note, timeMin: nowMin() });
    } else {
      db.insertMood({ id: uid(), userId: u.id, date: today, timeMin: nowMin(), mood: level, note });
    }
    void db.commit();
    refreshFromDb(u.id);
  }, [refreshFromDb]);

  /* ---------- calendar sync ---------- */
  const persistSync = useCallback((sync: SyncState) => {
    try { localStorage.setItem(SYNC_KEY, JSON.stringify({ ...sync, syncing: false })); } catch { /* ignore */ }
  }, []);

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
      const existing = new Set(db.tasksOf(u.id).map((t) => t.externalId).filter(Boolean));
      let pulled = 0;
      for (const ev of events) {
        if (existing.has(ev.externalId)) continue;
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
    const seeded = seedFor(u);
    seeded.tasks.forEach((t) => db.insertTask(t));
    seeded.routines.forEach((r) => db.insertRoutine(r));
    seeded.moods.forEach((m) => db.insertMood(m));
    await db.commit();
    refreshFromDb(u.id);
    toast("success", "Демо-данные пересозданы");
  }, [refreshFromDb, toast]);

  const value: Ctx = {
    ...state,
    toast, dismissToast, setTab: (t) => patch({ tab: t }),
    signIn, signUp, signInWith, signOut, updateUser,
    addTask, updateTask, removeTask, setTaskStatus, applyRoutine,
    saveMood,
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


