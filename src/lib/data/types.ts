/* ============================================================
 * DataProvider — единый контракт доступа к данным (Фаза 1.5).
 * Две реализации:
 *   · local    — демо-режим (localStorage), используется без env-ключей
 *                и в dev/CI, чтобы текущие тесты не ломались;
 *   · supabase — реальный бэкенд (auth + PostgreSQL + RLS).
 * Переключение — по наличию VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY.
 *
 * Скоуп 1.5a: auth + mood_logs. Задачи/фокус/подсказки переводятся
 * пошагово в 1.5b/1.5c — интерфейс расширяется аддитивно.
 * ============================================================ */

import type { MoodLog } from "../types";

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

/** Источник mood_logs (1.5a); расширяется в 1.5b/1.5c. */
export interface MoodsSource {
  list(userId: string): Promise<MoodLog[]>;
  insert(entry: MoodLog): Promise<MoodLog>;
  update(entry: MoodLog): Promise<MoodLog>;
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
}
