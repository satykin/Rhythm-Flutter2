/* ============================================================
 * SuggestionEngine — генерация кандидатов из сигналов (§4).
 * Чистая функция: (signals, now) → SuggestionCandidate[].
 * Не знает ни о персисте, ни о правилах частоты — это слой репозитория.
 * ============================================================ */

import { minToHM, nowMin, todayKey, addDaysKey } from "../../../lib/time";
import type { EngineSignals, SuggestionCandidate } from "./types";
import { goldenWindow, goldenWindowsFromSlots, productivityWindows, slotToMin } from "./productivity";
import {
  bestTimeFor,
  estimateDuration,
  procrastinatedTasks,
  reschedulePlan,
  scheduledMinutes,
  stuckTasks,
} from "./reschedule";

export function generate(signals: EngineSignals, now = nowMin(), today = todayKey()): SuggestionCandidate[] {
  const out: SuggestionCandidate[] = [];
  /* focusBySlot/abortedBySlot нужны только внутри productivitySlots (фолбэк),
   * здесь достаточно tasks — слоты приходят из signals.slots (GAP-1). */
  const { tasks } = signals;

  /* ---------- §4.1 golden_hour ---------- */
  /* GAP-1: приоритет — сохранённые слоты (user_productivity_slots, пересчёт
   * раз в сутки в репозитории); нет слотов → фолбэк на on-the-fly расчёт. */
  const windows =
    signals.slots && signals.slots.length
      ? goldenWindowsFromSlots(signals.slots)
      : productivityWindows(productivitySlots(signals));
  /* GAP-1: cold start — при <7 днях истории golden_hour не генерируется. */
  const gw = signals.goldenReady ? goldenWindow(windows, now) : null;
  if (gw) {
    const hard = tasks.filter((t) => t.date === today && t.status === "todo" && !t.recurrenceRule && t.startMin > now);
    const highEnergy = hard.filter((t) => t.energy === "high");
    const target = highEnergy[0] ?? hard[0];
    const ttl = Math.max(5, Math.round((gw.end - now)));
    out.push({
      kind: "golden_hour",
      priority: 9,
      ttlMin: ttl,
      title: `Золотое время: ${minToHM(gw.start)}–${minToHM(gw.end)}`,
      body: target
        ? `Сейчас твой пик продуктивности. Начать «${target.title}» (${target.energy === "high" ? "сложная" : "задача"})?`
        : "Сейчас твой пик продуктивности — лучшее время для сложной работы.",
      context: { date: today, startMin: gw.start, endMin: gw.end, taskId: target?.id },
      dedupKey: `golden:${today}:${gw.start}`,
    });
  }

  /* ---------- §4.4 reschedule ---------- */
  const plan = reschedulePlan(tasks, windows, today, now);
  if (plan.length) {
    const first = plan[0];
    out.push({
      kind: "reschedule",
      priority: 8,
      title: plan.length === 1 ? `Перенести «${first.task.title}»?` : `Перенести ${plan.length} просроченные задачи?`,
      body:
        first.date === today
          ? `Нашлось окно сегодня в ${minToHM(first.startMin)}.`
          : `День перегружен — перенести на завтра, ${minToHM(first.startMin)}?`,
      context: {
        taskId: first.task.id,
        proposedDate: first.date,
        proposedStartMin: first.startMin,
        endMin: first.endMin,
      },
      dedupKey: `reschedule:${today}:${plan.map((p) => p.task.id).join(".")}`,
    });
  }

  /* ---------- §4.5 overload ---------- */
  const dayTasks = tasks.filter((t) => t.date === today);
  const scheduled = scheduledMinutes(dayTasks);
  const wakingMin = signals.wakingTo - signals.wakingFrom;
  if (wakingMin > 0 && scheduled > 0.85 * wakingMin) {
    out.push({
      kind: "overload",
      priority: 7,
      title: "Сегодня перегруз",
      body: `Запланировано ${Math.round(scheduled / 60)} ч из ${Math.round(wakingMin / 60)} ч бодрствования. Освободить вечер?`,
      context: { date: today, scheduledMin: scheduled },
      dedupKey: `overload:${today}`,
    });
  }

  /* ---------- §4.6 break_down ---------- */
  const stuck = stuckTasks(tasks, today);
  if (stuck.length) {
    const t = stuck[0];
    const dur = t.endMin - t.startMin;
    const half = Math.max(15, Math.round(dur / 2));
    out.push({
      kind: "break_down",
      priority: 6,
      title: `«${t.title}» буксует`,
      body: `Задачу переносили ${(t.movedCount ?? 0)} раз. Разбить на 2 шага по ${Math.round(half / 60 * 10) / 10} ч?`,
      context: {
        taskId: t.id,
        subtasks: [
          { title: `${t.title} — шаг 1`, durationMin: half },
          { title: `${t.title} — шаг 2`, durationMin: dur - half },
        ],
      },
      dedupKey: `breakdown:${today}:${t.id}`,
    });
  }

  /* ---------- §4.2 duration (для новой задачи — генерируется при создании, см. hook) ---------- */
  // duration не генерируется здесь: он показывается инлайн в редакторе задачи.

  /* ---------- §D briefing_am / briefing_pm ---------- */
  const hour = Math.floor(now / 60);
  const todosToday = tasks.filter((t) => t.date === today && t.status === "todo" && !t.recurrenceRule);
  if (hour >= 6 && hour < 11 && todosToday.length) {
    const first = [...todosToday].sort((a, b) => a.startMin - b.startMin)[0];
    out.push({
      kind: "briefing_am",
      priority: 5,
      title: "Доброе утро",
      body: `Сегодня ${todosToday.length} задач. Первая — «${first.title}» в ${minToHM(first.startMin)}.`,
      context: { date: today },
      dedupKey: `brief_am:${today}`,
    });
  }
  if (hour >= 18 && todosToday.length >= 0) {
    const done = tasks.filter((t) => t.date === today && t.status === "done").length;
    out.push({
      kind: "briefing_pm",
      priority: 3,
      title: "Итоги дня",
      body: `Выполнено ${done} задач. Отметь настроение — это уточнит план на завтра.`,
      context: { date: today },
      dedupKey: `brief_pm:${today}`,
    });
  }

  return out;
}

/** Scores по 48 слотам из сигналов (обёртка над scoreSlots для переиспользания). */
function productivitySlots(signals: EngineSignals): number[] {
  const { tasks, focusBySlot, abortedBySlot } = signals;
  const today = todayKey();
  const from = addDaysKey(today, -13);
  const scores = new Array<number>(48).fill(0);
  for (const t of tasks) {
    if (t.date < from || t.date > today || t.recurrenceRule) continue;
    const s = Math.min(47, Math.floor(t.startMin / 30));
    if (t.status === "done") scores[s] += 2;
  }
  for (let i = 0; i < 48; i++) {
    scores[i] += (focusBySlot[i] ?? 0) / 30 - (abortedBySlot[i] ?? 0) * 1.5;
  }
  return scores;
}

/* ---------- helpers для инлайн-подсказок (duration / best_time) ---------- */

export function durationHint(tasks: import("../../../lib/types").Task[], tags: string[]): number {
  return estimateDuration(tasks, tags);
}

export function bestTimeHint(
  tasks: import("../../../lib/types").Task[],
  criteria: { tags?: string[]; energy?: import("../../../lib/types").EnergyLevel }
): number | null {
  return bestTimeFor(tasks, criteria);
}

export { procrastinatedTasks, slotToMin };
