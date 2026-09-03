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

/**
 * Золотые часы (спека §4.1): все смежные слоты со score выше порога
 * сливаются в ОДНО окно без ограничения длины; окно короче 60 мин
 * отбрасывается; возвращается до 3 самых сильных окон за день.
 */
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

/* ============================================================
 * GAP-1: персистентные слоты (user_productivity_slots, §8).
 * Формула score — та же (§4.1), переиспользуется scoreSlots;
 * здесь — упаковка в записи и выбор окон по адаптивному порогу.
 * ============================================================ */

/** 48 записей (slot_index 0..47) для upsert в user_productivity_slots. */
export function computeSlots(
  tasks: Task[],
  sessions: FocusSession[],
  opts: { days?: number; today?: string } = {}
): SlotScore[] {
  return scoreSlots(tasks, sessions, opts).map((score, slotIndex) => ({ slotIndex, score }));
}

/**
 * Золотые часы из СОХРАНЁННЫХ слотов.
 * Порог = max(2, медиана ненулевых слотов) — документированный выбор:
 *  • медиана адаптируется к объёму данных пользователя (у активного
 *    scores выше, у спокойного ниже — пики выявляются относительно
 *    собственной нормы, а не абсолютной константы);
 *  • пол 2 сохранён от прежнего фиксированного порога, чтобы случайный
 *    слабый сигнал (например, 20 мин фокуса → 0.67) не стал «золотым часом».
 */
export function goldenWindowsFromSlots(slots: SlotScore[]): ProductivityWindow[] {
  const scores = new Array<number>(SLOT_COUNT).fill(0);
  for (const s of slots) {
    if (s.slotIndex >= 0 && s.slotIndex < SLOT_COUNT) scores[s.slotIndex] = s.score;
  }
  const nonzero = scores.filter((v) => v > 0);
  if (!nonzero.length) return [];
  const sorted = [...nonzero].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return productivityWindows(scores, { minScore: Math.max(2, median) });
}

/**
 * Cold start (GAP-1): golden_hour генерируется только при ≥ `minDays`
 * днях с данными (завершённые задачи ИЛИ фокус-сессии) за окно 14 дней.
 * Слоты при этом считать можно — они просто не порождают подсказку.
 */
export function hasGoldenHistory(
  tasks: Task[],
  sessions: FocusSession[],
  today = todayKey(),
  minDays = 7
): boolean {
  const from = addDaysKey(today, -13);
  const days = new Set<string>();
  for (const t of tasks) {
    if (t.status === "done" && t.date >= from && t.date <= today) days.add(t.date);
  }
  for (const fs of sessions) {
    if (fs.date >= from && fs.date <= today) days.add(fs.date);
  }
  return days.size >= minDays;
}
