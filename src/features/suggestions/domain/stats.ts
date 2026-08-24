/* ============================================================
 * Статистические примитивы (используются Insights / Journal).
 * ============================================================ */

import type { FocusSession } from "../../../lib/types";
import { addDaysKey, todayKey } from "../../../lib/time";

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
    const min = sessions.filter((s) => s.date >= start && s.date <= end).reduce((a, s) => a + s.focusMin, 0);
    out.push({ label: `${w === 0 ? "эта" : `−${w}`} нед.`, min });
  }
  return out;
}
