/* ============================================================
 * LocalProvider — демо-режим (localStorage), фолбэк без env-ключей.
 * Поведение 1:1 с прежним демо-путём (db + sessionStore + demoHash),
 * чтобы dev и E2E без секретов работали без изменений.
 * ============================================================ */

import { db, sessionStore } from "../db";
import { demoHash, uid } from "../time";
import { DEFAULT_PREFS } from "./defaults";
import type { RoutineCompletion, User } from "../types";
import type { AuthResult, AuthUser, DataProvider, ProfilePatch } from "./types";

const toAuthUser = (u: User): AuthUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  provider: u.provider,
});

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createLocalProvider(): DataProvider {
  return {
    kind: "local",

    async getSession() {
      const sid = sessionStore.read();
      const u = sid ? db.get().users.find((x) => x.id === sid) ?? null : null;
      return u ? toAuthUser(u) : null;
    },

    /* демо-режим: сессия живёт в localStorage, подписки не нужны */
    onAuthChange() {
      return () => {};
    },

    async signUp(name, email, password): Promise<AuthResult> {
      await delay(700);
      if (db.findUserByEmail(email)) return { error: "Аккаунт с такой почтой уже существует" };
      const user: User = {
        id: uid(), name, email, passHash: demoHash(password), provider: "email",
        accent: "violet", sleepHours: 7.5, createdAt: new Date().toISOString(),
        themePalette: "default", quietFrom: 22 * 60, quietTo: 8 * 60,
        notifications: { ...DEFAULT_PREFS },
      };
      db.insertUser(user);
      await db.commit();
      sessionStore.write(user.id);
      return { user: toAuthUser(user) };
    },

    async signIn(email, password): Promise<AuthResult> {
      await delay(600);
      const user = db.findUserByEmail(email);
      if (!user) return { error: "Аккаунт не найден — создайте новый" };
      if (user.provider === "email" && user.passHash !== demoHash(password)) {
        return { error: "Неверный пароль" };
      }
      sessionStore.write(user.id);
      return { user: toAuthUser(user) };
    },

    async signInWithOAuth(provider): Promise<AuthResult> {
      await delay(1000);
      const email = provider === "google" ? "alex.day@gmail.com" : "alex@icloud.com";
      let user = db.findUserByEmail(email);
      if (!user) {
        user = {
          id: uid(), name: "Alex Day", email, provider,
          accent: provider === "google" ? "indigo" : "aqua", sleepHours: 7.5,
          createdAt: new Date().toISOString(),
          themePalette: "default", quietFrom: 22 * 60, quietTo: 8 * 60,
          notifications: { ...DEFAULT_PREFS },
        };
        db.insertUser(user);
        await db.commit();
      }
      sessionStore.write(user.id);
      return { user: toAuthUser(user) };
    },

    async signOut() {
      sessionStore.clear();
    },

    moods: {
      async list(userId) {
        return db.moodsOf(userId);
      },
      async insert(entry) {
        db.insertMood(entry);
        await db.commit();
        return entry;
      },
      async update(entry) {
        db.updateMood(entry);
        await db.commit();
        return entry;
      },
      async remove(_userId, id) {
        db.removeMood(id);
        await db.commit();
      },
    },

    /* ---------- Фаза 1.5b: делегирование в локальный кэш ---------- */

    tasks: {
      async list(userId) {
        return db.tasksOf(userId);
      },
      async upsert(task) {
        if (db.tasksOf(task.userId).some((t) => t.id === task.id)) db.updateTask(task);
        else db.insertTask(task);
        await db.commit();
        return task;
      },
      async remove(_userId, id) {
        db.removeTask(id);
        await db.commit();
      },
    },

    routines: {
      async list(userId) {
        return db.routinesOf(userId);
      },
      async upsert(routine) {
        if (db.routinesOf(routine.userId).some((r) => r.id === routine.id)) db.updateRoutine(routine);
        else db.insertRoutine(routine);
        await db.commit();
        return routine;
      },
      async remove(_userId, id) {
        db.removeRoutine(id);
        await db.commit();
      },
      /* демо-режим: отметки привычек не персистятся (store их не читает) */
      async listCompletions() {
        return localCompletions;
      },
      async insertCompletion(c: RoutineCompletion) {
        localCompletions = [...localCompletions.filter((x) => x.id !== c.id), c];
      },
      async removeCompletion(_userId, id) {
        localCompletions = localCompletions.filter((x) => x.id !== id);
      },
    },

    focus: {
      async list(userId) {
        return db.focusSessionsOf(userId);
      },
      async insert(session) {
        db.insertFocusSession(session);
        await db.commit();
        return session;
      },
    },

    suggestions: {
      async list(userId) {
        return db.suggestionsOf(userId);
      },
      async upsert(s) {
        if (db.suggestionsOf(s.userId).some((x) => x.id === s.id)) db.updateSuggestion(s);
        else db.insertSuggestion(s);
        await db.commit();
        return s;
      },
      async remove(_userId, id) {
        db.removeSuggestion(id);
        await db.commit();
      },
      async listFeedback(userId) {
        return db.feedbackOf(userId);
      },
      async insertFeedback(f) {
        db.insertFeedback(f);
        await db.commit();
      },
    },

    profiles: {
      async get(userId) {
        const u = db.get().users.find((x) => x.id === userId);
        if (!u) return null;
        return {
          displayName: u.name,
          accent: u.accent,
          themePalette: u.themePalette,
          sleepHours: u.sleepHours,
          quietFrom: u.quietFrom,
          quietTo: u.quietTo,
        } satisfies ProfilePatch;
      },
      async upsert(userId, p) {
        const u = db.get().users.find((x) => x.id === userId);
        if (!u) return;
        db.updateUser({
          ...u,
          name: p.displayName ?? u.name,
          accent: (p.accent as User["accent"]) ?? u.accent,
          themePalette: (p.themePalette as User["themePalette"]) ?? u.themePalette,
          sleepHours: p.sleepHours ?? u.sleepHours,
          quietFrom: p.quietFrom ?? u.quietFrom,
          quietTo: p.quietTo ?? u.quietTo,
        });
        await db.commit();
      },
    },

    slots: {
      async list(userId) {
        return db.slotsOf(userId);
      },
      async upsert(userId, slots) {
        db.upsertSlots(userId, slots);
        await db.commit();
      },
    },

    dailyStats: {
      /* демо-режим: агрегаты не считаются локально */
      async list() {
        return [];
      },
    },

    templates: {
      async list(userId) {
        return db.templatesOf(userId);
      },
      async upsert(t) {
        if (db.templatesOf(t.userId).some((x) => x.id === t.id)) db.removeTemplate(t.id);
        db.insertTemplate(t);
        await db.commit();
        return t;
      },
      async remove(_userId, id) {
        db.removeTemplate(id);
        await db.commit();
      },
    },
  };
}

/* in-memory для демо-режима (вне персиста) */
let localCompletions: RoutineCompletion[] = [];
