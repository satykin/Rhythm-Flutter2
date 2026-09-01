/* ============================================================
 * MoodPromptRepository — слой данных для настроек и лога промптов
 * (Фаза D). Тонкая обёртка над db.*; в проде — Supabase с RLS по
 * user_id. Здесь же считается BudgetState для чистого движка.
 * ============================================================ */

import { db } from "../../../lib/db";
import { keyFor, todayKey, uid } from "../../../lib/time";
import type { MoodPromptSettings, PromptAction, PromptType } from "../../../lib/types";
import { DEFAULT_PROMPT_SETTINGS, type BudgetState, type PromptSettings } from "../domain/promptBudget";

export const MoodPromptRepository = {
  /** Настройки пользователя (или дефолты, если ещё не созданы). */
  getSettings(userId: string): MoodPromptSettings {
    const found = db.promptSettingsOf(userId);
    if (found) return found;
    return { userId, ...DEFAULT_PROMPT_SETTINGS, updatedAt: new Date().toISOString() };
  },

  saveSettings(userId: string, patch: Partial<Omit<MoodPromptSettings, "userId" | "updatedAt">>): MoodPromptSettings {
    const current = this.getSettings(userId);
    const next: MoodPromptSettings = { ...current, ...patch, userId, updatedAt: new Date().toISOString() };
    db.upsertPromptSettings(next);
    return next;
  },

  log(userId: string, promptType: PromptType, action: PromptAction): void {
    db.insertPromptLog({ id: uid(), userId, promptType, action, createdAt: Date.now() });
  },

  /**
   * Снимок состояния бюджета из mood_prompt_log и mood_logs.
   * «Сегодня» — локальный день пользователя.
   */
  computeBudgetState(userId: string, _nowEpoch: number = Date.now()): BudgetState {
    const today = todayKey();
    const log = db.promptLogOf(userId);

    let proactiveShownToday = 0;
    let lastShownAt: number | null = null;
    const consumed = new Set<PromptType>();

    for (const l of log) {
      const dayKey = keyFor(new Date(l.createdAt));
      if (l.action === "shown") {
        if (lastShownAt === null || l.createdAt > lastShownAt) lastShownAt = l.createdAt;
        if (dayKey === today) proactiveShownToday += 1;
      }
      if (dayKey === today) consumed.add(l.promptType);
    }

    /* последний РУЧНОЙ check-in (source='manual') */
    let recentManualCheckInAt: number | null = null;
    for (const m of db.moodsOf(userId)) {
      if (m.source !== "manual") continue;
      const t = Date.parse(m.loggedAt);
      if (Number.isNaN(t)) continue;
      if (recentManualCheckInAt === null || t > recentManualCheckInAt) recentManualCheckInAt = t;
    }

    return {
      proactiveShownToday,
      lastShownAt,
      consumedTypesToday: [...consumed],
      recentManualCheckInAt,
    };
  },

  toPromptSettings(s: MoodPromptSettings): PromptSettings {
    return {
      morningEnabled: s.morningEnabled,
      morningTime: s.morningTime,
      eveningEnabled: s.eveningEnabled,
      eveningTime: s.eveningTime,
      quietStart: s.quietStart,
      quietEnd: s.quietEnd,
      skipIfRecentCheckin: s.skipIfRecentCheckin,
    };
  },
};
