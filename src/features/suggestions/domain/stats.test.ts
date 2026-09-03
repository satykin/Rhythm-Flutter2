import { describe, it, expect } from "vitest";
import { pearson, focusByWeek } from "./stats";
import type { FocusSession } from "../../../lib/types";

const mkSession = (p: Partial<FocusSession> & { id: string; date: string; focusMin: number }): FocusSession => ({
  userId: "u1",
  startedAt: `${p.date}T10:00:00`,
  type: "deep",
  plannedFocusMin: 50,
  plannedBreakMin: 10,
  breakMin: 0,
  cycles: 1,
  completed: true,
  sounds: [],
  ...p,
});

describe("pearson — корреляция Пирсона", () => {
  it("идеальная положительная/отрицательная связь", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });

  it("константа (нулевая дисперсия) → 0, а не NaN", () => {
    expect(pearson([1, 2, 3], [5, 5, 5])).toBe(0);
  });

  it("недостаточно данных (n < 3) → 0", () => {
    expect(pearson([1, 2], [1, 2])).toBe(0);
    expect(pearson([], [])).toBe(0);
  });

  it("несовпадающие длины — берётся общая часть", () => {
    expect(pearson([1, 2, 3, 99], [2, 4, 6])).toBeCloseTo(1);
  });
});

describe("focusByWeek — суммарный фокус по неделям", () => {
  const TODAY = "2026-02-10";

  it("раскладывает минуты по 6 неделям, текущая — последняя", () => {
    const sessions = [
      mkSession({ id: "a", date: TODAY, focusMin: 50 }), // эта неделя
      mkSession({ id: "b", date: "2026-02-02", focusMin: 25 }), // −8 дней → «−1 нед.»
    ];
    const out = focusByWeek(sessions, 6, TODAY);
    expect(out).toHaveLength(6);
    expect(out[5].min).toBe(50);
    expect(out[4].min).toBe(25);
    expect(out[0].min).toBe(0);
    expect(out[5].label).toContain("нед.");
  });

  it("сессии вне окна (старше 6 недель) не учитываются", () => {
    const sessions = [mkSession({ id: "old", date: "2025-12-01", focusMin: 100 })];
    const out = focusByWeek(sessions, 6, TODAY);
    expect(out.reduce((a, w) => a + w.min, 0)).toBe(0);
  });
});
