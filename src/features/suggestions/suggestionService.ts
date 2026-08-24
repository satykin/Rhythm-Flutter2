/* ============================================================
 * Smart Suggestions Engine (v1 — эвристики, чистые функции).
 * Анализ последних 14 дней: productivity windows, прокрастинация,
 * типичные часы для похожих задач, windows для отдыха.
 * В Этапе 3 поверх ляжет ML-модель — контракты те же.
 * ============================================================ */

import type { EnergyLevel, FocusSession, SuggestionType, Task } from "../../lib/types";
import { addDaysKey, minToHM, nowMin, todayKey } from "../../lib/time";

export interface HourStat {
  done: number;
  total: number;
  rate: number;
}

export interface ProductivityWindow {
  start: number;
  end: number;
  rate: number;
  done: number;
}

export interface Candidate {
  type: SuggestionType;
  title: string;
  detail: string;
  context: { taskId?: string; date?: string; startMin?: number; endMin?: number };
  dedupKey: string;
}

const HOURS = Array.from({ length: 17 }, (_, i) => 6 + i); // 06..22

/** Статистика выполнения по часам дня за последние `days` дней. */
export function completionByHour(tasks: Task[], days = 14, today = todayKey()): Map<number, HourStat> {
  const from = addDaysKey(today, -(days - 1));
  const map = new Map<number, HourStat>();
  for (const t of tasks) {
    if (t.date < from || t.date > today || t.parentTaskId === undefined && t.recurrenceRule) continue;
    const h = Math.floor(t.startMin / 60);
    const rec = map.get(h) ?? { done: 0, total: 0, rate: 0 };
    rec.total++;
    if (t.status === "done") rec.done++;
    map.set(h, rec);
  }
  map.forEach((rec) => (rec.rate = rec.total ? rec.done / rec.total : 0));
  return map;
}

/** Слитные окна высокой продуктивности (rate ≥ minRate, done ≥ minDone). */
export function productivityWindows(
  tasks: Task[],
  opts: { minRate?: number; minDone?: number; days?: number } = {}
): ProductivityWindow[] {
  const { minRate = 0.6, minDone = 3, days = 14 } = opts;
  const byHour = completionByHour(tasks, days);
  const windows: ProductivityWindow[] = [];
  let cur: ProductivityWindow | null = null;
  for (const h of HOURS) {
    const s = byHour.get(h);
    const ok = s && s.rate >= minRate && s.done >= minDone;
    if (ok && s) {
      if (!cur) cur = { start: h * 60, end: (h + 1) * 60, rate: s.rate, done: s.done };
      else {
        cur.end = (h + 1) * 60;
        cur.rate = Math.max(cur.rate, s.rate);
        cur.done += s.done;
      }
    } else if (cur) {
      windows.push(cur);
      cur = null;
    }
  }
  if (cur) windows.push(cur);
  return windows
    .filter((w) => w.end - w.start >= 60)
    .sort((a, b) => b.rate - a.rate || b.done - a.done)
    .slice(0, 3);
}

/** Текущее «золотое окно», если сейчас внутри. */
export function goldenWindow(windows: ProductivityWindow[], now = nowMin()): ProductivityWindow | null {
  return windows.find((w) => now >= w.start && now < w.end) ?? null;
}

/** Просроченные задачи: прошлые дни или сегодня, но время уже вышло. */
export function procrastinatedTasks(tasks: Task[], today = todayKey(), now = nowMin()): Task[] {
  return tasks.filter(
    (t) =>
      t.status === "todo" &&
      !t.recurrenceRule &&
      (t.date < today || (t.date === today && t.endMin < now - 15))
  );
}

/** Типичный час для похожих задач (пересечение тегов или уровень энергии). */
export function bestHourFor(
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
  let bestCount = 1; // минимум 2 выполнения, чтобы советовать
  byHour.forEach((count, h) => {
    if (count > bestCount) {
      bestCount = count;
      best = h;
    }
  });
  return best === null ? null : best * 60;
}

/** Первый свободный слот длительностью dur после fromMin (среди задач дня). */
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

/** План переноса просроченных задач на сегодня: в productivity windows, затем в любые дыры. */
export function reschedulePlan(
  tasks: Task[],
  windows: ProductivityWindow[],
  today = todayKey(),
  now = nowMin(),
  dayEnd = 23 * 60
): { task: Task; startMin: number; endMin: number }[] {
  const overdue = procrastinatedTasks(tasks, today, now).sort((a, b) => a.date.localeCompare(b.date));
  if (!overdue.length) return [];
  const dayTasks = tasks.filter((t) => t.date === today && !overdue.includes(t));
  const plan: { task: Task; startMin: number; endMin: number }[] = [];
  const busy: Task[] = [...dayTasks];
  for (const t of overdue.slice(0, 4)) {
    const dur = t.endMin - t.startMin;
    let slot: number | null = null;
    for (const w of windows) {
      const from = Math.max(w.start, now + 15);
      const s = nextFreeSlot(busy, from, dur, Math.min(w.end, dayEnd));
      if (s !== null && s + dur <= dayEnd) {
        slot = s;
        break;
      }
    }
    if (slot === null) slot = nextFreeSlot(busy, now + 15, dur, dayEnd);
    if (slot === null) continue;
    plan.push({ task: t, startMin: slot, endMin: slot + dur });
    busy.push({ ...t, startMin: slot, endMin: slot + dur, date: today });
  }
  return plan;
}

/** Кандидаты в подсказки на текущий момент. Дедупликация — по dedupKey. */
export function generateCandidates(
  tasks: Task[],
  opts: { today?: string; now?: number } = {}
): Candidate[] {
  const today = opts.today ?? todayKey();
  const now = opts.now ?? nowMin();
  const out: Candidate[] = [];
  const windows = productivityWindows(tasks);
  const gw = goldenWindow(windows, now);

  /* золотое время */
  if (gw) {
    const hardTodos = tasks.filter(
      (t) => t.date === today && t.status === "todo" && t.energy === "high" && t.startMin > now
    );
    const end = Math.min(gw.end, now + 90);
    if (end - now >= 30) {
      out.push({
        type: "golden_time",
        title: `Сейчас твоё золотое время (${minToHM(gw.start)}–${minToHM(gw.end)})`,
        detail: hardTodos.length
          ? `Исторически в это окно ты закрываешь ${Math.round(gw.rate * 100)}% задач. Начни «${hardTodos[0].title}» сейчас?`
          : `В это окно ты закрываешь ${Math.round(gw.rate * 100)}% задач — идеально для сложной работы.`,
        context: { date: today, startMin: now + 5, endMin: end },
        dedupKey: `golden:${today}:${gw.start}`,
      });
    }
  }

  /* перенос просроченных */
  const plan = reschedulePlan(tasks, windows, today, now);
  if (plan.length) {
    const first = plan[0];
    out.push({
      type: "reschedule",
      title: plan.length === 1 ? `Перенести «${first.task.title}»?` : `Перенести ${plan.length} просроченные задачи?`,
      detail: `Rhythm нашёл окна: «${first.task.title}» → сегодня в ${minToHM(first.startMin)}.`,
      context: { taskId: first.task.id, date: today, startMin: first.startMin, endMin: first.endMin },
      dedupKey: `reschedule:${today}:${plan.map((p) => p.task.id).join(".")}`,
    });
  }

  /* отдых в послеобеденный спад */
  if (now >= 13 * 60 && now <= 15 * 60) {
    const hasRest = tasks.some(
      (t) => t.date === today && t.status !== "skipped" && t.startMin > now && t.startMin < 16 * 60 && t.energy === "low"
    );
    if (!hasRest) {
      out.push({
        type: "rest_window",
        title: "Послеобеденный спад энергии",
        detail: "С 13:30 до 15:00 продуктивность исторически падает. Запланируй прогулку или лёгкие задачи.",
        context: { date: today, startMin: 13 * 60 + 30, endMin: 14 * 60 },
        dedupKey: `rest:${today}`,
      });
    }
  }

  return out;
}

/* ---------- статистика для инсайтов ---------- */

/** Коэффициент корреляции Пирсона (−1..1). */
export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** Суммарный фокус по неделям (ISO-неделя → минуты). */
export function focusByWeek(sessions: FocusSession[], weeks = 6, today = todayKey()): { label: string; min: number }[] {
  const out: { label: string; min: number }[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const end = addDaysKey(today, -w * 7);
    const start = addDaysKey(end, -6);
    const min = sessions
      .filter((s) => s.date >= start && s.date <= end)
      .reduce((a, s) => a + s.focusMin, 0);
    out.push({ label: `${w === 0 ? "эта" : `−${w}`} нед.`, min });
  }
  return out;
}
