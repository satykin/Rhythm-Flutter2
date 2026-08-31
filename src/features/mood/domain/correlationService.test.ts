import { describe, expect, it } from "vitest";
import {
  MIN_PEARSON,
  MIN_SAMPLE,
  computeCorrelations,
  mean,
  median,
  pearson,
} from "./correlationService";
import { addDaysKey } from "../../../lib/time";
import type { FocusSession, MoodLog } from "../../../lib/types";

const TODAY = "2026-01-30";

const mood = (date: string, value: number, tags: string[] = []): MoodLog => ({
  id: `${date}:${value}:${tags.join("-")}:${Math.random()}`,
  userId: "u1",
  date,
  timeMin: 600,
  mood: value,
  tags,
  linkedTaskIds: [],
  source: "manual",
  loggedAt: `${date}T10:00:00.000Z`,
  updatedAt: `${date}T10:00:00.000Z`,
});

const session = (date: string, focusMin: number): FocusSession => ({
  id: `s-${date}`,
  userId: "u1",
  date,
  startedAt: `${date}T09:00:00.000Z`,
  type: "deep",
  plannedFocusMin: 50,
  plannedBreakMin: 10,
  focusMin,
  breakMin: 10,
  cycles: 1,
  completed: true,
  sounds: [],
});

const run = (moods: MoodLog[], focusSessions: FocusSession[] = []) =>
  computeCorrelations({ moods, tasks: [], focusSessions, routines: [], today: TODAY });

describe("базовая статистика", () => {
  it("median — чётное и нечётное количество", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 3, 5])).toBe(3);
    expect(median([])).toBe(0);
  });

  it("mean", () => {
    expect(mean([1, 2, 3])).toBe(2);
    expect(mean([])).toBe(0);
  });

  it("pearson: идеальная линейная связь = 1", () => {
    const r = pearson([0, 10, 20, 30], [1, 2, 3, 4]);
    expect(r).not.toBeNull();
    expect(Math.abs(r!)).toBeCloseTo(1, 6);
  });

  it("pearson: нулевая дисперсия → null", () => {
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBeNull();
  });
});

describe("категориальные сигналы", () => {
  it("тег выше baseline → direction up, confidence low при n=8", () => {
    const moods: MoodLog[] = [];
    for (let i = 0; i < 12; i++) moods.push(mood(addDaysKey(TODAY, -i), 3));
    for (let i = 12; i < 20; i++) moods.push(mood(addDaysKey(TODAY, -i), 5, ["exercise"]));
    const res = run(moods);
    expect(res).toHaveLength(1);
    const c = res[0];
    expect(c.signalKey).toBe("tag:exercise");
    expect(c.signalType).toBe("categorical");
    expect(c.direction).toBe("up");
    expect(c.baseline).toBe(3);
    expect(c.observedValue).toBe(5);
    expect(c.effectSize).toBe(2);
    expect(c.sampleSize).toBe(8);
    expect(c.confidence).toBe("low");
  });

  it("flat (эффект < 0.3) → отсекается", () => {
    const moods: MoodLog[] = [];
    for (let i = 0; i < 10; i++) moods.push(mood(addDaysKey(TODAY, -i), 3, ["rest"]));
    for (let i = 10; i < 20; i++) moods.push(mood(addDaysKey(TODAY, -i), 3));
    expect(run(moods)).toHaveLength(0);
  });

  it("группа < 7 → пропускается", () => {
    const moods: MoodLog[] = [];
    for (let i = 0; i < 7; i++) moods.push(mood(addDaysKey(TODAY, -i), 3));
    for (let i = 7; i < 13; i++) moods.push(mood(addDaysKey(TODAY, -i), 5, ["stress"]));
    expect(run(moods)).toHaveLength(0);
  });

  it("меньше 7 записей всего → движок молчит", () => {
    const moods = [1, 2, 3, 4, 5].map((v, i) => mood(addDaysKey(TODAY, -i), v, ["x"]));
    expect(run(moods)).toHaveLength(0);
  });
});

describe("числовые сигналы", () => {
  it("фокус коррелирует с настроением → numeric up", () => {
    const moods: MoodLog[] = [];
    const sessions: FocusSession[] = [];
    for (let i = 0; i < 10; i++) {
      const d = addDaysKey(TODAY, -i);
      moods.push(mood(d, 1 + i * 0.4));
      sessions.push(session(d, i * 10));
    }
    const res = run(moods, sessions);
    const focus = res.find((c) => c.signalKey === "num:focus_minutes");
    expect(focus).toBeDefined();
    expect(focus!.signalType).toBe("numeric");
    expect(focus!.direction).toBe("up");
    expect(focus!.sampleSize).toBe(10);
    expect(focus!.confidence).toBe("medium");
    expect(Math.abs(focus!.effectSize)).toBeGreaterThanOrEqual(MIN_PEARSON);
  });

  it("нет фокуса (нулевая дисперсия) → числовой сигнал пропускается", () => {
    const moods: MoodLog[] = [];
    for (let i = 0; i < 10; i++) moods.push(mood(addDaysKey(TODAY, -i), 1 + i * 0.4));
    const res = run(moods, []);
    expect(res.find((c) => c.signalKey === "num:focus_minutes")).toBeUndefined();
  });
});

describe("пороги", () => {
  it("константы соответствуют спеке", () => {
    expect(MIN_SAMPLE).toBe(7);
    expect(MIN_PEARSON).toBe(0.3);
  });
});
