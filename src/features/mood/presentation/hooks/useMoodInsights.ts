/* ============================================================
 * useMoodInsights — инсайты поверх СОХРАНЁННЫХ корреляций Фазы C.
 * Корреляции НЕ пересчитываются здесь (это работа Фазы C); мы только
 * читаем user_mood_correlations и применяем отбор/обратную связь.
 *
 * Имена привычек для 'habit:<id>' подтягиваются одним батчем из
 * app.routines (без N+1).
 * ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../../../state/store";
import { db } from "../../../../lib/db";
import type { MoodCorrelation, MoodInsightFeedback } from "../../../../lib/types";
import { getActiveInsights, type InsightText, describeInsight } from "../../domain/insights";
import { InsightRepository } from "../../data/InsightRepository";

export interface InsightView {
  correlation: MoodCorrelation;
  text: InsightText;
  /** 'accepted' — пользователь отметил «Это полезно». */
  accepted: boolean;
}

export function useMoodInsights() {
  const app = useApp();
  const userId = app.user?.id ?? null;

  const [feedback, setFeedback] = useState<MoodInsightFeedback[]>([]);
  const [ready, setReady] = useState(false);

  /* уже залогированные 'shown' за эту сессию — защита от дублей */
  const shownRef = useRef<Set<string>>(new Set());

  /* --- читаем сохранённые корреляции Фазы C (без пересчёта) --- */
  const correlations = useMemo<MoodCorrelation[]>(() => {
    if (!userId) return [];
    return db.correlationsOf(userId);
    // пересматриваем, когда Фазa C могла обновить хранилище
  }, [userId, app.moods, app.tasks, app.focusSessions, app.routines]);

  /* --- имена привычек одним батчем (без N+1) --- */
  const habitNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of app.routines) map.set(r.id, r.title);
    return map;
  }, [app.routines]);

  /* --- при загрузке: устаревание + снимок feedback --- */
  useEffect(() => {
    if (!userId) return;
    InsightRepository.markStale(userId, correlations, Date.now());
    setFeedback(InsightRepository.feedbackOf(userId));
    setReady(true);
  }, [userId, correlations]);

  /* --- отбор активных (макс 3, с частотным гейтом) --- */
  const selection = useMemo(
    () => getActiveInsights(Date.now(), correlations, feedback),
    [correlations, feedback]
  );

  /* --- пишем 'shown' + first_shown_at один раз за сессию на сигнал --- */
  useEffect(() => {
    if (!userId || !ready) return;
    let changed = false;
    for (const c of selection.active) {
      if (shownRef.current.has(c.signalKey)) continue;
      shownRef.current.add(c.signalKey);
      InsightRepository.recordShown(userId, c.signalKey, Date.now());
      changed = true;
    }
    if (changed) {
      void db.commit();
      setFeedback(InsightRepository.feedbackOf(userId));
    }
  }, [userId, ready, selection]);

  const acceptedKeys = useMemo(
    () => new Set(feedback.filter((f) => f.status === "accepted").map((f) => f.signalKey)),
    [feedback]
  );

  const insights = useMemo<InsightView[]>(
    () =>
      selection.active.map((c) => ({
        correlation: c,
        text: describeInsight(c, c.signalKey.startsWith("habit:") ? habitNames.get(c.signalKey.slice(6)) : undefined),
        accepted: acceptedKeys.has(c.signalKey),
      })),
    [selection, habitNames, acceptedKeys]
  );

  /* --- действия обратной связи --- */
  const accept = useCallback((signalKey: string) => {
    if (!userId) return;
    InsightRepository.accept(userId, signalKey, Date.now());
    void db.commit();
    setFeedback(InsightRepository.feedbackOf(userId));
  }, [userId]);

  const dismiss = useCallback((signalKey: string) => {
    if (!userId) return;
    InsightRepository.dismiss(userId, signalKey, Date.now());
    void db.commit();
    setFeedback(InsightRepository.feedbackOf(userId));
  }, [userId]);

  const explainOpened = useCallback((signalKey: string) => {
    if (!userId) return;
    InsightRepository.logEvent(userId, signalKey, "explain_opened", Date.now());
    void db.commit();
  }, [userId]);

  return {
    ready,
    insights,
    /** сколько всего корреляций сохранено (для пустых состояний) */
    totalCorrelations: correlations.length,
    /** сколько слотов свободно (для подписи «больше наблюдений появится…») */
    freeSlots: Math.max(0, 3 - selection.active.length),
    accept,
    dismiss,
    explainOpened,
  };
}
