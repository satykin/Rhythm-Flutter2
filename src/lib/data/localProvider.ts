/* ============================================================
 * LocalProvider — демо-режим (localStorage), фолбэк без env-ключей.
 * Поведение 1:1 с прежним демо-путём (db + sessionStore + demoHash),
 * чтобы dev и E2E без секретов работали без изменений.
 * ============================================================ */

import { db, sessionStore } from "../db";
import { demoHash, uid } from "../time";
import { DEFAULT_PREFS } from "./defaults";
import type { User } from "../types";
import type { AuthResult, AuthUser, DataProvider } from "./types";

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
  };
}
