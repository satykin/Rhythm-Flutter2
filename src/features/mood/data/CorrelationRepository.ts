/* ============================================================
 * CorrelationRepository — персист корреляций (Фаза C, §12 шаг 4).
 * Upsert в user_mood_correlations по (userId, signalKey).
 * В проде — Supabase с RLS по user_id; контракт не изменится.
 * ============================================================ */

import { db } from "../../../lib/db";
import { computeCorrelations, type CorrelationInput } from "../domain/correlationService";
import type { MoodCorrelation } from "../../../lib/types";

export const CorrelationRepository = {
  /** Сохранённые корреляции пользователя. */
  stored(userId: string): MoodCorrelation[] {
    return db.correlationsOf(userId);
  },

  /** Полный пересчёт и сохранение. Возвращает свежие строки. */
  recompute(input: CorrelationInput, userId: string): MoodCorrelation[] {
    const rows = computeCorrelations(input).map((c) => ({ ...c, userId }));
    db.clearCorrelations(userId);
    db.upsertCorrelations(userId, rows);
    return rows;
  },
};
