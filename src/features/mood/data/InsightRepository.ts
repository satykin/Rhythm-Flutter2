/* ============================================================
 * InsightRepository — хранилище обратной связи и событий (Фаза E).
 * mood_insight_feedback: состояние инсайта (active/accepted/
 *   dismissed/stale), first_shown_at, dismissed_until.
 * mood_insight_events: журнал shown/explain_opened/accepted/
 *   dismissed для метрик доверия.
 * Все операции — строго по user_id (RLS).
 * ============================================================ */

import { db } from "../../../lib/db";
import { uid } from "../../../lib/time";
import type {
  MoodCorrelation,
  MoodInsightEvent,
  MoodInsightFeedback,
} from "../../../lib/types";
import { DISMISS_DAYS, staleSignalKeys } from "../domain/insights";

const DAY_MS = 86_400_000;

function ensure(userId: string, signalKey: string): MoodInsightFeedback {
  const existing = db
    .insightFeedbackOf(userId)
    .find((f) => f.signalKey === signalKey);
  if (existing) return existing;
  const row: MoodInsightFeedback = {
    userId,
    signalKey,
    status: "active",
    firstShownAt: null,
    feedbackAt: null,
    dismissedUntil: null,
  };
  db.upsertInsightFeedback(row);
  return row;
}

export const InsightRepository = {
  feedbackOf(userId: string): MoodInsightFeedback[] {
    return db.insightFeedbackOf(userId);
  },

  eventsOf(userId: string): MoodInsightEvent[] {
    return db.insightEventsOf(userId);
  },

  /**
   * При показе карточки: пишем событие 'shown' и проставляем
   * first_shown_at (если ещё не задан).
   */
  recordShown(userId: string, signalKey: string, now: number): void {
    const row = ensure(userId, signalKey);
    if (row.firstShownAt == null) {
      row.firstShownAt = now;
      db.upsertInsightFeedback(row);
    }
    db.insertInsightEvent({ id: uid(), userId, signalKey, event: "shown", createdAt: now });
  },

  logEvent(userId: string, signalKey: string, event: MoodInsightEvent["event"], now: number): void {
    db.insertInsightEvent({ id: uid(), userId, signalKey, event, createdAt: now });
  },

  /** [ Это полезно ] → status 'accepted' + событие 'accepted'. */
  accept(userId: string, signalKey: string, now: number): void {
    const row = ensure(userId, signalKey);
    row.status = "accepted";
    row.feedbackAt = now;
    db.upsertInsightFeedback(row);
    db.insertInsightEvent({ id: uid(), userId, signalKey, event: "accepted", createdAt: now });
  },

  /** [ Не показывать ] → status 'dismissed', dismissed_until = now + 14 дней. */
  dismiss(userId: string, signalKey: string, now: number): void {
    const row = ensure(userId, signalKey);
    row.status = "dismissed";
    row.feedbackAt = now;
    row.dismissedUntil = now + DISMISS_DAYS * DAY_MS;
    db.upsertInsightFeedback(row);
    db.insertInsightEvent({ id: uid(), userId, signalKey, event: "dismissed", createdAt: now });
  },

  /**
   * Устаревание (Фаза E, §6): помечаем 'stale' инсайты, для которых
   * больше нет поддерживающей корреляции. Возвращает число помеченных.
   */
  markStale(userId: string, correlations: MoodCorrelation[], now: number): number {
    const stale = staleSignalKeys(correlations, db.insightFeedbackOf(userId));
    for (const signalKey of stale) {
      const row = ensure(userId, signalKey);
      row.status = "stale";
      row.feedbackAt = now;
      db.upsertInsightFeedback(row);
    }
    return stale.length;
  },
};
