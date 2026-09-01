/* ============================================================
 * SupabaseProvider — реальная реализация DataProvider (Фаза 1.5a).
 * Auth: email+пароль (основной путь), Google/Apple — OAuth-редирект
 * (ключи активирует владелец в дашборде, см. docs/supabase-activation.md).
 * mood_logs: CRUD end-to-end; RLS на таблице гарантирует «только свои
 * строки» даже при подмене user_id на клиенте.
 * Конфликты: updated_at обновляется триггером, last-write-wins (спека).
 * ============================================================ */

import type { Session, User as SbUser } from "@supabase/supabase-js";
import type { MoodLog } from "../types";
import type { AuthResult, AuthUser, DataProvider, OAuthProvider } from "./types";
import { supabase } from "./client";

/* ---------- маппинг auth ---------- */

const toAuthUser = (u: SbUser): AuthUser => ({
  id: u.id,
  email: u.email ?? "",
  name:
    (u.user_metadata?.name as string | undefined) ??
    (u.email ? u.email.split("@")[0] : "Пользователь"),
  provider: (u.app_metadata?.provider as AuthUser["provider"] | undefined) ?? "email",
});

const translateAuthError = (message: string): string => {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Неверная почта или пароль";
  if (m.includes("already registered")) return "Аккаунт с такой почтой уже существует";
  if (m.includes("confirm") || m.includes("email not confirmed"))
    return "Подтвердите почту по ссылке из письма — затем войдите снова";
  if (m.includes("rate limit")) return "Слишком много попыток — подождите минуту";
  return message;
};

/* ---------- маппинг mood_logs (camelCase ↔ snake_case) ---------- */

interface MoodRow {
  id: string;
  user_id: string;
  date: string;
  time_min: number;
  mood: number;
  note: string | null;
  tags: string[];
  linked_task_ids: string[];
  focus_session_id: string | null;
  source: MoodLog["source"];
  logged_at: string;
  updated_at: string;
}

const rowToMood = (r: MoodRow): MoodLog => ({
  id: r.id,
  userId: r.user_id,
  date: r.date,
  timeMin: r.time_min,
  mood: r.mood,
  note: r.note ?? undefined,
  tags: r.tags ?? [],
  linkedTaskIds: r.linked_task_ids ?? [],
  focusSessionId: r.focus_session_id ?? undefined,
  source: r.source,
  loggedAt: r.logged_at,
  updatedAt: r.updated_at,
});

const moodToRow = (m: MoodLog): MoodRow => ({
  id: m.id,
  user_id: m.userId,
  date: m.date,
  time_min: m.timeMin,
  mood: m.mood,
  note: m.note ?? null,
  tags: m.tags,
  linked_task_ids: m.linkedTaskIds,
  focus_session_id: m.focusSessionId ?? null,
  source: m.source,
  logged_at: m.loggedAt,
  updated_at: m.updatedAt,
});

/* ---------- провайдер ---------- */

export function createSupabaseProvider(): DataProvider {
  const sb = supabase;
  if (!sb) throw new Error("Supabase не сконфигурирован (нет env-ключей)");

  const sessionToAuthUser = (s: Session | null): AuthUser | null => (s ? toAuthUser(s.user) : null);

  return {
    kind: "supabase",

    async getSession() {
      const { data } = await sb.auth.getSession();
      return sessionToAuthUser(data.session);
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        cb(sessionToAuthUser(session));
      });
      return () => data.subscription.unsubscribe();
    },

    async signUp(name, email, password): Promise<AuthResult> {
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (error) return { error: translateAuthError(error.message) };
      /* Если включено подтверждение почты, сессии ещё нет — это не ошибка. */
      if (!data.session) {
        return { error: "Письмо с подтверждением отправлено — откройте ссылку и войдите" };
      }
      return { user: data.session ? toAuthUser(data.session.user) : undefined };
    },

    async signIn(email, password): Promise<AuthResult> {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { error: translateAuthError(error.message) };
      return { user: toAuthUser(data.user) };
    },

    async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
      /* Редирект на страницу провайдера; после возврата сработает
         detectSessionInUrl → onAuthChange. */
      const { error } = await sb.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin },
      });
      if (error) return { error: translateAuthError(error.message) };
      return {};
    },

    async signOut() {
      await sb.auth.signOut();
    },

    moods: {
      async list(userId) {
        const { data, error } = await sb
          .from("mood_logs")
          .select("*")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .order("time_min", { ascending: false });
        if (error) throw new Error(`mood_logs.list: ${error.message}`);
        return (data as MoodRow[]).map(rowToMood);
      },

      async insert(entry) {
        const { data, error } = await sb
          .from("mood_logs")
          .insert(moodToRow(entry))
          .select()
          .single();
        if (error) throw new Error(`mood_logs.insert: ${error.message}`);
        return rowToMood(data as MoodRow);
      },

      async update(entry) {
        /* last-write-wins по updated_at (спека 2.1, §16) */
        const { data, error } = await sb
          .from("mood_logs")
          .update(moodToRow(entry))
          .eq("id", entry.id)
          .eq("user_id", entry.userId)
          .select()
          .single();
        if (error) throw new Error(`mood_logs.update: ${error.message}`);
        return rowToMood(data as MoodRow);
      },

      async remove(userId, id) {
        const { error } = await sb.from("mood_logs").delete().eq("id", id).eq("user_id", userId);
        if (error) throw new Error(`mood_logs.remove: ${error.message}`);
      },
    },
  };
}
