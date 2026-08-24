/* ============================================================
 * Rhythm Core — модель энергии дня.
 * Циркадная кривая + поправки на сон и настроение.
 * (Этап 3 заменит формулу на ML-модель поверх BioSync-данных.)
 * ============================================================ */

import { clamp } from "./time";
import { DAY_END, DAY_START } from "./time";

/** Энергия в момент min (0..100) */
export function energyAt(min: number, sleepHours: number, mood?: number): number {
  const h = min / 60;
  const circ =
    50 +
    32 * Math.exp(-((h - 10.7) ** 2) / 3.1) + // утренний пик
    15 * Math.exp(-((h - 17.9) ** 2) / 4.6) - // вечерний подъём
    17 * Math.exp(-((h - 14.2) ** 2) / 1.15); // послеобеденный спад
  const sleepAdj = (sleepHours - 7) * 4.2;
  const moodAdj = mood ? (mood - 3) * 3.2 : 0;
  const late = h >= 21.5 ? (h - 21.5) * -7 : 0;
  const early = h < 7 ? (7 - h) * -6 : 0;
  return clamp(Math.round(circ + sleepAdj + moodAdj + late + early), 4, 98);
}

export interface Point {
  min: number;
  v: number;
}

export function energySeries(sleepHours: number, mood?: number, step = 15): Point[] {
  const pts: Point[] = [];
  for (let m = DAY_START; m <= DAY_END; m += step) pts.push({ min: m, v: energyAt(m, sleepHours, mood) });
  return pts;
}

export interface Slot {
  start: number;
  end: number;
  score: number;
}

function runs(series: Point[], test: (v: number) => boolean): Slot[] {
  const out: Slot[] = [];
  let cur: Slot | null = null;
  for (const p of series) {
    if (test(p.v)) {
      if (!cur) cur = { start: p.min, end: p.min, score: 0 };
      cur.end = p.min;
      cur.score = Math.max(cur.score, p.v);
    } else if (cur) {
      out.push(cur);
      cur = null;
    }
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.end - s.start >= 45);
}

/** Лучшие окна для сложных задач (пики энергии) */
export function bestSlots(sleepHours: number, mood?: number): Slot[] {
  return runs(energySeries(sleepHours, mood), (v) => v >= 70).sort((a, b) => b.score - a.score).slice(0, 2);
}

/** Окна, когда стоит отдохнуть */
export function restWindows(sleepHours: number, mood?: number): Slot[] {
  const day = energySeries(sleepHours, mood).filter((p) => p.min >= 12 * 60 && p.min <= 17 * 60);
  return runs(day, (v) => v <= 48).slice(0, 1);
}

/** Прогноз продуктивности на день (0..100) — средний уровень энергии */
export function dayScore(sleepHours: number, mood?: number): number {
  const s = energySeries(sleepHours, mood, 30);
  return Math.round(s.reduce((a, p) => a + p.v, 0) / s.length);
}
