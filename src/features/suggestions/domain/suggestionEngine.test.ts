import { describe, it, expect } from "vitest";
import { generate, durationHint, bestTimeHint } from "./SuggestionEngine";
import type { EngineSignals } from "./types";
import type { Task } from "../../../lib/types";

const TODAY = "2026-02-10";
const YESTERDAY = "2026-02-09";

const mkTask = (p: Partial<Task> & { id: string }): Task => ({
  userId: "u1",
  title: `Задача ${p.id}`,
  description: "",
  date: TODAY,
  startMin: 600,
  endMin: 660,
  color: "violet",
  icon: "target",
  tags: [],
  energy: "medium",
  status: "todo",
  source: "local",
  syncStatus: "local",
  createdAt: "",
  updatedAt: "",
  ...p,
});

const signals = (p: Partial<EngineSignals> = {}): EngineSignals => ({
  tasks: [],
  focusBySlot: [],
  abortedBySlot: [],
  wakingFrom: 480, // 08:00
  wakingTo: 1380, // 23:00
  goldenReady: false,
  ...p,
});

/** Слоты 20–23 = 10:00–12:00 с высоким score. */
const peakSlots = [20, 21, 22, 23].map((slotIndex) => ({ slotIndex, score: 6 }));

const kind = (out: ReturnType<typeof generate>, k: string) => out.find((c) => c.kind === k);

describe("generate — §4.1 golden_hour", () => {
  it("внутри золотого окна предлагает сложную задачу (high-энергия в приоритете)", () => {
    const high = mkTask({ id: "high", startMin: 900, endMin: 960, energy: "high" });
    const low = mkTask({ id: "low", startMin: 1000, endMin: 1060, energy: "low" });
    const out = generate(signals({ tasks: [low, high], slots: peakSlots, goldenReady: true }), 630, TODAY);
    const g = kind(out, "golden_hour");
    expect(g).toBeTruthy();
    expect(g!.context.taskId).toBe("high");
    expect(g!.title).toContain("10:00–12:00");
    expect(g!.ttlMin).toBe(90); // до конца окна
    expect(g!.priority).toBe(9);
  });

  it("cold start (< 7 дней истории) — golden_hour НЕ генерируется, хотя окно есть", () => {
    const out = generate(signals({ slots: peakSlots, goldenReady: false }), 630, TODAY);
    expect(kind(out, "golden_hour")).toBeUndefined();
  });

  it("сейчас вне окна — golden_hour нет", () => {
    const out = generate(signals({ slots: peakSlots, goldenReady: true }), 800, TODAY);
    expect(kind(out, "golden_hour")).toBeUndefined();
  });
});

describe("generate — §4.4 reschedule", () => {
  it("просроченная задача → кандидат с окном сегодня", () => {
    const tasks = [mkTask({ id: "a", date: YESTERDAY })];
    const out = generate(signals({ tasks }), 600, TODAY);
    const r = kind(out, "reschedule");
    expect(r).toBeTruthy();
    expect(r!.context.taskId).toBe("a");
    expect(r!.context.proposedStartMin).toBe(615);
    expect(r!.body).toContain("сегодня");
  });

  it("нет просроченных — кандидата нет", () => {
    const out = generate(signals({ tasks: [mkTask({ id: "a", startMin: 900 })] }), 600, TODAY);
    expect(kind(out, "reschedule")).toBeUndefined();
  });
});

describe("generate — §4.5 overload", () => {
  it("запланировано > 85% бодрствования → перегруз", () => {
    const tasks = [mkTask({ id: "big", startMin: 360, endMin: 1160 })]; // 800 мин
    const out = generate(signals({ tasks }), 600, TODAY);
    const o = kind(out, "overload");
    expect(o).toBeTruthy();
    expect(o!.context.scheduledMin).toBe(800);
  });

  it("≤ 85% — без перегруза", () => {
    const tasks = [mkTask({ id: "ok", startMin: 360, endMin: 1060 })]; // 700 мин ≤ 765
    const out = generate(signals({ tasks }), 600, TODAY);
    expect(kind(out, "overload")).toBeUndefined();
  });
});

describe("generate — §4.6 break_down", () => {
  it("задача переносилась 3+ раз → предложение разбить на 2 шага", () => {
    const tasks = [mkTask({ id: "a", date: YESTERDAY, startMin: 600, endMin: 690, movedCount: 3 })];
    const out = generate(signals({ tasks }), 600, TODAY);
    const b = kind(out, "break_down");
    expect(b).toBeTruthy();
    expect(b!.context.taskId).toBe("a");
    expect(b!.context.subtasks).toHaveLength(2);
    expect(b!.context.subtasks!.map((s) => s.durationMin)).toEqual([45, 45]);
  });
});

describe("generate — брифинги", () => {
  it("утренний — в 06–11 ч при наличии задач на сегодня", () => {
    const tasks = [mkTask({ id: "a", startMin: 700, title: "Дизайн" })];
    expect(kind(generate(signals({ tasks }), 540, TODAY), "briefing_am")).toBeTruthy(); // 09:00
    expect(kind(generate(signals({ tasks }), 1140, TODAY), "briefing_am")).toBeUndefined(); // 19:00
    expect(kind(generate(signals({ tasks: [] }), 540, TODAY), "briefing_am")).toBeUndefined(); // нет задач
  });

  it("вечерний — после 18 ч, считает выполненные", () => {
    const tasks = [mkTask({ id: "a", status: "done" }), mkTask({ id: "b" })];
    const pm = kind(generate(signals({ tasks }), 1140, TODAY), "briefing_pm"); // 19:00
    expect(pm).toBeTruthy();
    expect(pm!.body).toContain("Выполнено 1");
    expect(kind(generate(signals({ tasks }), 540, TODAY), "briefing_pm")).toBeUndefined();
  });
});

describe("инлайн-хелперы (§4.2 / §4.3)", () => {
  it("durationHint без истории → дефолт 30", () => {
    expect(durationHint([], ["работа"])).toBe(30);
  });

  it("bestTimeHint без истории → null", () => {
    expect(bestTimeHint([], { tags: ["работа"] })).toBeNull();
  });
});
