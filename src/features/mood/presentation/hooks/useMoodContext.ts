/* ============================================================
 * useMoodContext — контекст записи для Detail View (Фаза B).
 * Связывает mood_logs с tasks, focus_sessions и днём в целом.
 * Все выборки — по user_id (RLS) и батчатся в useMemo, без N+1.
 * ============================================================ */

import { useMemo } from "react";
import { useApp } from "../../../../state/store";
import type { FocusSession, MoodLog, Routine, Task } from "../../../../lib/types";
import { weekdayIdx } from "../../../../lib/time";

export interface MoodContext {
  /** Реальные задачи из linked_task_ids. Удалённые задачи отбрасываются — связь просто исчезает. */
  linkedTasks: Task[];
  /** Flow Session из focus_session_id (если есть). */
  session: FocusSession | null;
  /** Контекст дня: задачи, фокус, привычки. */
  day: {
    tasksTotal: number;
    tasksDone: number;
    focusMin: number;
    habits: Routine[];
  };
  /** Остальные mood-записи этого дня (кроме текущей), новые сверху. */
  dayFeed: MoodLog[];
}

export function useMoodContext(entry: MoodLog | null): MoodContext {
  const app = useApp();
  const { tasks, focusSessions, routines, moods } = app;

  return useMemo<MoodContext>(() => {
    if (!entry) {
      return { linkedTasks: [], session: null, day: { tasksTotal: 0, tasksDone: 0, focusMin: 0, habits: [] }, dayFeed: [] };
    }

    /* --- связанные задачи (одним проходом по tasks) --- */
    const byId = new Map(tasks.map((t) => [t.id, t]));
    const linkedTasks = entry.linkedTaskIds
      .map((id) => byId.get(id))
      .filter((t): t is Task => Boolean(t));

    /* --- flow session --- */
    const session = entry.focusSessionId
      ? focusSessions.find((s) => s.id === entry.focusSessionId) ?? null
      : null;

    /* --- контекст дня (батчим: один проход по tasks, один по focusSessions) --- */
    let tasksTotal = 0;
    let tasksDone = 0;
    for (const t of tasks) {
      if (t.date !== entry.date || t.recurrenceRule) continue;
      tasksTotal++;
      if (t.status === "done") tasksDone++;
    }
    let focusMin = 0;
    for (const s of focusSessions) if (s.date === entry.date) focusMin += s.focusMin;

    const habits = routines.filter((r) => r.days.includes(weekdayIdx(entry.date)));

    /* --- лента дня (кроме текущей записи) --- */
    const dayFeed = moods
      .filter((m) => m.date === entry.date && m.id !== entry.id)
      .sort((a, b) => b.timeMin - a.timeMin || b.loggedAt.localeCompare(a.loggedAt));

    return {
      linkedTasks,
      session,
      day: { tasksTotal, tasksDone, focusMin: Math.round(focusMin), habits },
      dayFeed,
    };
  }, [entry, tasks, focusSessions, routines, moods]);
}
