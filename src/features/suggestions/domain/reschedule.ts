/* ============================================================
 * §4.3 best_time · §4.4 reschedule · §4.5 overload · §4.6 break_down.
 * Чистые функции поверх задач и продуктивных окон.
 * ============================================================ */

import type { EnergyLevel, Task } from "../../../lib/types";
import { addDaysKey, minToHM, nowMin, todayKey } from "../../../lib/time";
import type { ProductivityWindow } from "./productivity";

/** Просроченные задачи: прошлые дни или сегодня, но время уже вышло. */
export function procrastinatedTasks(tasks: Task[], today = todayKey(), now = nowMin()): Task[] {
  return tasks.filter(
    (t) => t.status === "todo" && !t.recurrenceRule && (t.date < today || (t.date === today && t.endMin < now - 15))
  );
}

/** Первый свободный слот длительностью dur после fromMin среди задач дня. */
export function nextFreeSlot(dayTasks: Task[], fromMin: number, dur: number, dayEnd: number): number | null {
  const sorted = dayTasks.filter((t) => t.status !== "skipped").sort((a, b) => a.startMin - b.startMin);
  let cursor = Math.max(fromMin, 6 * 60);
  for (const t of sorted) {
    if (t.endMin <= cursor) continue;
    if (t.startMin - cursor >= dur) return cursor;
    cursor = Math.max(cursor, t.endMin);
  }
  return dayEnd - cursor >= dur ? cursor : null;
}

/**
 * §4.4 План переноса просроченных: в продуктивные окна (где совпадает
 * energy_level), затем в любые дыры. Учитывает 48 ч вперёд.
 */
export function reschedulePlan(
  tasks: Task[],
  windows: ProductivityWindow[],
  today = todayKey(),
  now = nowMin(),
  dayEnd = 23 * 60
): { task: Task; date: string; startMin: number; endMin: number }[] {
  const overdue = procrastinatedTasks(tasks, today, now).sort((a, b) => a.date.localeCompare(b.date));
  if (!overdue.length) return [];

  const plan: { task: Task; date: string; startMin: number; endMin: number }[] = [];
  let busy = tasks.filter((t) => t.date === today && !overdue.includes(t));

  for (const t of overdue.slice(0, 4)) {
    const dur = t.endMin - t.startMin;
    let slot: number | null = null;
    let date = today;

    // 1) пробуем продуктивные окна сегодня, где энергия совпадает
    for (const w of windows) {
      const energyMatch = t.energy === "high" ? w.score >= 4 : true;
      if (!energyMatch) continue;
      const s = nextFreeSlot(busy, Math.max(w.start, now + 15), dur, Math.min(w.end, dayEnd));
      if (s !== null && s + dur <= dayEnd) {
        slot = s;
        break;
      }
    }
    // 2) любая дыра сегодня
    if (slot === null) slot = nextFreeSlot(busy, now + 15, dur, dayEnd);
    // 3) день перегружен → на завтра
    if (slot === null) {
      date = addDaysKey(today, 1);
      const tomorrow = tasks.filter((x) => x.date === date);
      slot = nextFreeSlot(tomorrow, 9 * 60, dur, dayEnd) ?? 9 * 60;
    }

    plan.push({ task: t, date, startMin: slot, endMin: slot + dur });
    busy = [...busy, { ...t, date: today, startMin: slot, endMin: slot + dur }];
  }
  return plan;
}

/** §4.3 Исторически типичный час для похожих задач (теги/энергия) → минута. */
export function bestTimeFor(
  tasks: Task[],
  criteria: { tags?: string[]; energy?: EnergyLevel },
  today = todayKey()
): number | null {
  const from = addDaysKey(today, -13);
  const byHour = new Map<number, number>();
  for (const t of tasks) {
    if (t.date < from || t.status !== "done") continue;
    const tagHit = criteria.tags?.length && t.tags.some((x) => criteria.tags!.includes(x));
    const energyHit = criteria.energy && t.energy === criteria.energy;
    if (!tagHit && !energyHit) continue;
    const h = Math.floor(t.startMin / 60);
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 1;
  byHour.forEach((count, h) => {
    if (count > bestCount) {
      bestCount = count;
      best = h;
    }
  });
  return best === null ? null : best * 60;
}

/** §4.2 Медианная длительность похожих задач (по тегам), дефолт 30. */
export function estimateDuration(tasks: Task[], tags: string[], fallback = 30): number {
  const from = addDaysKey(todayKey(), -13);
  const durations = tasks
    .filter((t) => t.date >= from && t.status === "done" && tags.length && t.tags.some((x) => tags.includes(x)))
    .map((t) => t.endMin - t.startMin)
    .sort((a, b) => a - b);
  if (!durations.length) return fallback;
  const mid = Math.floor(durations.length / 2);
  return durations.length % 2 ? durations[mid] : Math.round((durations[mid - 1] + durations[mid]) / 2);
}

/** §4.5 Сумма запланированных минут на день (без пропущенных и повторов-родителей). */
export function scheduledMinutes(dayTasks: Task[]): number {
  return dayTasks
    .filter((t) => t.status !== "skipped" && !t.recurrenceRule)
    .reduce((a, t) => a + (t.endMin - t.startMin), 0);
}

/** §4.6 Задачи, которые переносили 3+ раз (признак «зависания»). */
export function stuckTasks(tasks: Task[], today = todayKey()): Task[] {
  return tasks.filter((t) => t.status === "todo" && !t.recurrenceRule && t.date < today && (t.movedCount ?? 0) >= 3);
}

export const fmtWindow = (w: ProductivityWindow) => `${minToHM(w.start)}–${minToHM(w.end)}`;
