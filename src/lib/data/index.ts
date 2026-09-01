/* ============================================================
 * Фабрика DataProvider (Фаза 1.5).
 *   env-ключи есть  → Supabase (реальный бэкенд, RLS);
 *   env-ключей нет  → LocalDemo (localStorage) — dev/CI-фолбэк,
 *                     текущие тесты не ломаются.
 * Данные демо-режима НЕ переносятся в production автоматически
 * (мастер-план: production стартует чистым).
 * ============================================================ */

import { isSupabaseConfigured } from "./client";
import { createLocalProvider } from "./localProvider";
import { createSupabaseProvider } from "./supabaseProvider";
import type { DataProvider } from "./types";

export const data: DataProvider = isSupabaseConfigured
  ? createSupabaseProvider()
  : createLocalProvider();

export const isSupabaseMode: boolean = data.kind === "supabase";

export type { AuthResult, AuthUser, DataProvider, OAuthProvider } from "./types";
