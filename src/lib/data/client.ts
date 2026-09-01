/* ============================================================
 * Инициализация Supabase-клиента (Фаза 1.5).
 * Ключи — только из env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY);
 * без них клиент null → приложение работает в LocalDemo-режиме.
 * Никогда не коммитьте реальные ключи в .env.
 * ============================================================ */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured: boolean = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        /* важно для OAuth-редиректов Google/Apple */
        detectSessionInUrl: true,
      },
    })
  : null;
