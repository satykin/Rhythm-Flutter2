import { describe, it, expect } from "vitest";
import {
  SLOT_COUNT,
  minToSlot,
  slotToMin,
  scoreSlots,
  productivityWindows,
  goldenWindow,
  goldenWindowsFromSlots,
  hasGoldenHistory,
} from "./productivity";
import { addDaysKey } from "../../../lib/time";
import type { FocusSession, Task } from "../../../lib/types";

const TODAY = "2026-02-10";

const mkTask = (p: Partial<Task> & { id: string }): Task => ({
  userId: "u1",
  title: "T",
  description: "",
  date: TODAY,
  startMin: 600,
  endMin: 660,
  color: "violet",
  icon: "target",
  tags: [],
  energy: "medium",
  status: "done",
  source: "local",
  syncStatus: "local",
  createdAt: "",
  updatedAt: "",
  ...p,
});

const mkSession = (p: Partial<FocusSession> & { id: string }): FocusSession => ({
  userId: "u1",
  date: TODAY,
  startedAt: `${TODAY}T10:00:00`, // локальное 10:00 → слот 20
  type: "deep",
  plannedFocusMin: 50,
  plannedBreakMin: 10,
  focusMin: 45,
  breakMin: 10,
  cycles: 1,
  completed: true,
  sounds: [],
  ...p,
});

describe("границы слотов (48 × 30 мин)", () => {
  it("minToSlot/slotToMin не выходят за 0..47", () => {
    expect(minToSlot(0)).toBe(0);
    expect(minToSlot(599)).toBe(19);
    expect(minToSlot(600)).toBe(20);
    expect(minToSlot(1439)).toBe(SLOT_COUNT - 1);
    expect(slotToMin(0)).toBe(0);
    expect(slotToMin(47)).toBe(1410);
  });
});

describe("scoreSlots — формула §4.1", () => {
  it("выполненная задача +2, фокус +минуты/30, прерванная сессия −1.5", () => {
    const tasks = [mkTask({ id: "a", startMin: 600, status: "done" })];
    const sessions = [
      mkSession({ id: "f1", focusMin: 45, completed: true }),
      mkSession({ id: "f2", focusMin: 30, completed: false }),
    ];
    const scores = scoreSlots(tasks, sessions, { today: TODAY });
    // слот 20: 2 + 45/30 + 30/30 − 1.5 = 3.0
    expect(scores[20]).toBeCloseTo(3.0);
    expect(scores[19]).toBe(0);
  });

  it("только выполненные задачи дают вклад; даты вне 14-дневного окна игнорируются", () => {
    const tasks = [
      mkTask({ id: "todo", startMin: 600, status: "todo" }),
      mkTask({ id: "old", date: addDaysKey(TODAY, -20), startMin: 600, status: "done" }),
      mkTask({ id: "rec", startMin: 600, status: "done", recurrenceRule: "FREQ=DAILY" }),
    ];
    const scores = scoreSlots(tasks, [], { today: TODAY });
    expect(scores[20]).toBe(0);
  });

  it("сессии разносятся по слотам локального времени начала", () => {
    const sessions = [mkSession({ id: "s", startedAt: `${TODAY}T07:15:00`, focusMin: 60 })]; // слот 14
    const scores = scoreSlots([], sessions, { today: TODAY });
    expect(scores[14]).toBeCloseTo(2); // 60/30
  });
});

describe("productivityWindows — выбор пиков", () => {
  it("смежные слоты выше порога сливаются в окно ≥ 60 мин", () => {
    const scores = new Array(SLOT_COUNT).fill(0);
    scores[20] = 4;
    scores[21] = 6;
    scores[22] = 4;
    const wins = productivityWindows(scores);
    expect(wins).toHaveLength(1);
    // Правило: все смежные слоты выше порога сливаются в ОДНО окно без
    // ограничения длины (фильтр — только ≥60 мин). 3 слота (20,21,22) × 30 мин
    // = 90 мин → end = 20*30 + 3*30 = 690, а не 750 (750 потребовало бы 5 слотов).
    expect(wins[0]).toMatchObject({ start: 600, end: 690, score: 6 });
  });

  it("одиночный слот (30 мин) — не золотое окно", () => {
    const scores = new Array(SLOT_COUNT).fill(0);
    scores[20] = 5;
    expect(productivityWindows(scores)).toEqual([]);
  });

  it("не больше трёх окон, отсортированы по силе", () => {
    const scores = new Array(SLOT_COUNT).fill(0);
    [6, 7].forEach((i) => (scores[i] = 3)); // 03:00
    [20, 21].forEach((i) => (scores[i] = 8)); // 10:00
    [32, 33].forEach((i) => (scores[i] = 5)); // 16:00
    [40, 41].forEach((i) => (scores[i] = 4)); // 20:00 — четвёртое, отсекается
    const wins = productivityWindows(scores);
    expect(wins).toHaveLength(3);
    /* топ-3 по score: 8 → 600, 5 → 960, 4 → 1200; окно 180 (score 3) отсекается */
    expect(wins.map((w) => w.start)).toEqual([600, 960, 1200]);
  });
});

describe("goldenWindow — текущее окно", () => {
  const wins = [{ start: 600, end: 720, score: 6 }];
  it("внутри → окно; снаружи и на границе конца → null (полуинтервал)", () => {
    expect(goldenWindow(wins, 630)).toEqual(wins[0]);
    expect(goldenWindow(wins, 599)).toBeNull();
    expect(goldenWindow(wins, 720)).toBeNull();
  });
});

describe("goldenWindowsFromSlots — адаптивный порог (GAP-1)", () => {
  it("порог = max(2, медиана ненулевых): слабый сигнал не становится пиком", () => {
    const weak = [{ slotIndex: 20, score: 0.67 }, { slotIndex: 21, score: 0.67 }];
    expect(goldenWindowsFromSlots(weak)).toEqual([]); // порог 2, score ниже
  });

  it("сильные слоты относительно собственной нормы выделяются", () => {
    const slots = [
      ...[10, 11].map((slotIndex) => ({ slotIndex, score: 2.5 })),
      ...[20, 21, 22, 23].map((slotIndex) => ({ slotIndex, score: 6 })),
    ];
    // медиана ненулевых = 6 → порог 6 → только слоты 20–23
    const wins = goldenWindowsFromSlots(slots);
    expect(wins).toHaveLength(1);
    expect(wins[0]).toMatchObject({ start: 600, end: 720 });
  });

  it("все нули → пусто", () => {
    expect(goldenWindowsFromSlots([0, 1, 2].map((slotIndex) => ({ slotIndex, score: 0 })))).toEqual([]);
  });
});

describe("hasGoldenHistory — cold start", () => {
  it("≥ 7 дней с данными → готов; 6 → ещё нет", () => {
    const days = (n: number) =>
      Array.from({ length: n }, (_, i) => mkTask({ id: `d${i}`, date: addDaysKey(TODAY, -i), status: "done" }));
    expect(hasGoldenHistory(days(7), [], TODAY)).toBe(true);
    expect(hasGoldenHistory(days(6), [], TODAY)).toBe(false);
  });

  it("фокус-сессии тоже засчитываются как дни активности", () => {
    const tasks = Array.from({ length: 6 }, (_, i) => mkTask({ id: `d${i}`, date: addDaysKey(TODAY, -i), status: "done" }));
    const sessions = [mkSession({ id: "s", date: addDaysKey(TODAY, -10) })];
    expect(hasGoldenHistory(tasks, sessions, TODAY)).toBe(true);
  });
});
