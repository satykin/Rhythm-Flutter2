/* ============================================================
 * §4.1 Productivity Windows («золотые часы»).
 * День = 48 слотов по 30 мин. score = done*2 + focus/30 − aborted*1.5.
 * Чистые функции — полностью тестируемы.
 * ============================================================ */

import type { FocusSession, Task } from "../../../lib/types";
import { addDaysKey, nowMin, todayKey } from "../../../lib/time";

export const SLOT_COUNT = 48;
export const SLOT_MIN = 30;

export const minToSlot = (min: number) => Math.min(SLOT_COUNT - 1, Math.max(0, Math.floor(min / SLOT_MIN)));
export const slotToMin = (i: number) => i * SLOT_MIN;

export interface SlotScore {
  slotIndex: number;
  score: number;
}

/** Заполняет массив 48 слотов из задач и фокус-сессий за `days` дней. */
export function scoreSlots(
  tasks: Task[],
  sessions: FocusSession[],
  opts: { days?: number; today?: string } = {}
): number[] {
  const { days = 14, today = todayKey() } = opts;
  const from = addDaysKey(today, -(days - 1));
  const scores = new Array<number>(SLOT_COUNT).fill(0);

  for (const t of tasks) {
    if (t.date < from || t.date > today || t.recurrenceRule) continue;
    const s = minToSlot(t.startMin);
    if (t.status === "done") scores[s] += 2;
  }

  for (const fs of sessions) {
    if (fs.date < from || fs.date > today) continue;
    const start = new Date(fs.startedAt);
    const mins = start.getHours() * 60 + start.getMinutes();
    const s = minToSlot(mins);
    scores[s] += fs.focusMin / 30;
    if (!fs.completed) scores[s] -= 1.5;
  }

  return scores;
}

export interface ProductivityWindow {
  start: number;
  end: number;
  score: number;
}

/** Топ-3 смежных слота со score выше порога = золотые часы. */
export function productivityWindows(scores: number[], opts: { minScore?: number } = {}): ProductivityWindow[] {
  const { minScore = 2 } = opts;
  const windows: ProductivityWindow[] = [];
  let cur: ProductivityWindow | null = null;

  for (let i = 0; i < SLOT_COUNT; i++) {
    const ok = scores[i] >= minScore;
    if (ok) {
      if (!cur) cur = { start: slotToMin(i), end: slotToMin(i) + SLOT_MIN, score: scores[i] };
      else {
        cur.end = slotToMin(i) + SLOT_MIN;
        cur.score = Math.max(cur.score, scores[i]);
      }
    } else if (cur) {
      windows.push(cur);
      cur = null;
    }
  }
  if (cur) windows.push(cur);

  return windows
    .filter((w) => w.end - w.start >= 60)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/** Текущее золотое окно, если сейчас внутри него. */
export function goldenWindow(windows: ProductivityWindow[], now = nowMin()): ProductivityWindow | null {
  return windows.find((w) => now >= w.start && now < w.end) ?? null;
}
