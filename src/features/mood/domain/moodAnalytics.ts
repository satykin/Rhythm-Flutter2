/* ============================================================
 * Агрегации для вкладки «Неделя» (Mood Tapestry) и «Месяц».
 * Чистые функции. Числовой score — не главный визуальный элемент:
 * в Tapestry показывается эмодзи последней записи слота.
 * ============================================================ */

import type { MoodLog } from "../../../lib/types";
import { addDaysKey, todayKey, weekdayIdx } from "../../../lib/time";
import { mean, median } from "./correlationService";

/* ---------- Неделя / Tapestry ---------- */

export type DaySlot = "morning" | "day" | "evening";
export const SLOT_ORDER: DaySlot[] = ["morning", "day", "evening"];

/** утро [5,12) · день [12,18) · вечер [18,24)∪[0,5) — по локальному времени. */
export function slotOf(timeMin: number): DaySlot {
  const h = Math.floor(timeMin / 60) % 24;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "day";
  return "evening";
}

/** Даты недели Пн–Вс, содержащей anchor (по умолчанию сегодня). */
export function weekDates(anchor: string = todayKey()): string[] {
  const monday = addDaysKey(anchor, -weekdayIdx(anchor));
  return Array.from({ length: 7 }, (_, i) => addDaysKey(monday, i));
}

export type TapestryCell = MoodLog | null;
/** date → слот → последняя запись (по loggedAt) или null. */
export type TapestryGrid = Record<string, Record<DaySlot, TapestryCell>>;

export function buildTapestry(moods: MoodLog[], dates: string[]): TapestryGrid {
  const grid: TapestryGrid = {};
  for (const d of dates) grid[d] = { morning: null, day: null, evening: null };
  for (const m of moods) {
    const cell = grid[m.date];
    if (!cell) continue;
    const slot = slotOf(m.timeMin);
    const cur = cell[slot];
    if (!cur || m.loggedAt > cur.loggedAt) cell[slot] = m;
  }
  return grid;
}

/* ---------- Месяц ---------- */

export interface WeekdayStat {
  /** 0=Пн … 6=Вс */
  weekday: number;
  count: number;
  median: number;
}

export function weekdayDistribution(moods: MoodLog[]): WeekdayStat[] {
  const groups: number[][] = Array.from({ length: 7 }, () => []);
  for (const m of moods) groups[weekdayIdx(m.date)].push(m.mood);
  return groups.map((g, weekday) => ({ weekday, count: g.length, median: g.length ? median(g) : 0 }));
}

export interface TagStat {
  tag: string;
  count: number;
  median: number;
}

export function tagDistribution(moods: MoodLog[]): TagStat[] {
  const map = new Map<string, number[]>();
  for (const m of moods) for (const t of m.tags) {
    const arr = map.get(t) ?? [];
    arr.push(m.mood);
    map.set(t, arr);
  }
  return [...map.entries()]
    .map(([tag, g]) => ({ tag, count: g.length, median: median(g) }))
    .sort((a, b) => b.count - a.count);
}

/** Дневные пары «среднее настроение ↔ фактор» — основа числовых графиков. */
export interface DayPoint {
  date: string;
  mood: number;
  x: number;
}

export function dailyPairs(
  moods: MoodLog[],
  xOf: (date: string) => number
): DayPoint[] {
  const byDay = new Map<string, number[]>();
  for (const m of moods) {
    const arr = byDay.get(m.date) ?? [];
    arr.push(m.mood);
    byDay.set(m.date, arr);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, g]) => ({ date, mood: mean(g), x: xOf(date) }));
}

/* ---------- текстовые альтернативы (a11y) ---------- */

const WD_FULL = ["понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам", "воскресеньям"];

/** «По понедельникам настроение в среднем ниже (2.8), по субботам — выше (4.1)». */
export function weekdayTextAlt(stats: WeekdayStat[]): string {
  const filled = stats.filter((s) => s.count > 0);
  if (!filled.length) return "Нет данных по дням недели.";
  const base = median(filled.flatMap((s) => [s.median]));
  const low = [...filled].sort((a, b) => a.median - b.median)[0];
  const high = [...filled].sort((a, b) => b.median - a.median)[0];
  const parts: string[] = [];
  if (low.median < base) parts.push(`по ${WD_FULL[low.weekday]} настроение ниже (${low.median.toFixed(1)})`);
  if (high.median > base) parts.push(`по ${WD_FULL[high.weekday]} — выше (${high.median.toFixed(1)})`);
  return parts.length ? parts.join(", ") + "." : "Настроение по дням недели примерно одинаковое.";
}
