import { describe, it, expect } from "vitest";
import {
  procrastinatedTasks,
  nextFreeSlot,
  reschedulePlan,
  bestTimeFor,
  estimateDuration,
  scheduledMinutes,
  stuckTasks,
} from "./reschedule";
import { addDaysKey, todayKey } from "../../../lib/time";
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

describe("procrastinatedTasks — детекция просроченных", () => {
  it("прошлый день + статус todo → просрочена", () => {
    const tasks = [mkTask({ id: "a", date: YESTERDAY })];
    expect(procrastinatedTasks(tasks, TODAY, 600).map((t) => t.id)).toEqual(["a"]);
  });

  it("сегодня, время вышло (>15 мин назад) → просрочена; только что закончилась → нет", () => {
    const tasks = [
      mkTask({ id: "late", endMin: 580 }), // 580 < 600−15
      mkTask({ id: "fresh", endMin: 590 }), // 590 ≥ 585
    ];
    expect(procrastinatedTasks(tasks, TODAY, 600).map((t) => t.id)).toEqual(["late"]);
  });

  it("выполненные и повторяющиеся-родители не считаются", () => {
    const tasks = [
      mkTask({ id: "done", date: YESTERDAY, status: "done" }),
      mkTask({ id: "rec", date: YESTERDAY, recurrenceRule: "FREQ=DAILY" }),
    ];
    expect(procrastinatedTasks(tasks, TODAY, 600)).toEqual([]);
  });
});

describe("nextFreeSlot — поиск свободного окна", () => {
  it("пустой день → запрошенное время (не раньше 06:00)", () => {
    expect(nextFreeSlot([], 615, 60, 1380)).toBe(615);
    expect(nextFreeSlot([], 300, 60, 1380)).toBe(360);
  });

  it("перепрыгивает всю цепочку смежных занятых задач", () => {
    const busy = [mkTask({ id: "a", startMin: 600, endMin: 660 }), mkTask({ id: "b", startMin: 660, endMin: 720 })];
    expect(nextFreeSlot(busy, 615, 60, 1380)).toBe(720);
  });

  it("стык без пересечения — окно до задачи", () => {
    const busy = [mkTask({ id: "a", startMin: 720, endMin: 780 })];
    expect(nextFreeSlot(busy, 615, 60, 1380)).toBe(615);
  });

  it("нет окна до конца дня → null", () => {
    expect(nextFreeSlot([], 1350, 60, 1380)).toBeNull();
  });

  it("skipped-задачи не занимают время", () => {
    const busy = [mkTask({ id: "a", startMin: 600, endMin: 660, status: "skipped" })];
    expect(nextFreeSlot(busy, 600, 60, 1380)).toBe(600);
  });
});

describe("reschedulePlan — план умного переноса (§4.4)", () => {
  it("просроченная задача → ближайшее окно сегодня", () => {
    const tasks = [mkTask({ id: "a", date: YESTERDAY, startMin: 600, endMin: 660 })];
    const plan = reschedulePlan(tasks, [], TODAY, 600);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ date: TODAY, startMin: 615, endMin: 675 });
  });

  it("high-энергия попадает только в окно с score ≥ 4", () => {
    const tasks = [mkTask({ id: "a", date: YESTERDAY, startMin: 600, endMin: 660, energy: "high" })];
    const weak = [{ start: 600, end: 720, score: 3 }];
    const strong = [{ start: 840, end: 960, score: 5 }];
    /* слабое окно игнорируется → falls through на любую дыру (615) */
    expect(reschedulePlan(tasks, weak, TODAY, 600)[0].startMin).toBe(615);
    /* сильное окно с энергией совпало → 840 */
    expect(reschedulePlan(tasks, strong, TODAY, 600)[0].startMin).toBe(840);
  });

  it("день перегружен → перенос на завтра 09:00", () => {
    const tasks = [
      mkTask({ id: "busy", startMin: 360, endMin: 1380 }),
      mkTask({ id: "a", date: YESTERDAY, startMin: 600, endMin: 660 }),
    ];
    const plan = reschedulePlan(tasks, [], TODAY, 600);
    expect(plan[0]).toMatchObject({ date: addDaysKey(TODAY, 1), startMin: 540, endMin: 600 });
  });

  it("за раз переносится не более 4 задач", () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      mkTask({ id: `t${i}`, date: YESTERDAY, startMin: 600 + i * 15, endMin: 630 + i * 15 })
    );
    expect(reschedulePlan(tasks, [], TODAY, 600)).toHaveLength(4);
  });

  it("две переносимые задачи не накладываются друг на друга", () => {
    const tasks = [
      mkTask({ id: "a", date: YESTERDAY, startMin: 600, endMin: 660 }),
      mkTask({ id: "b", date: YESTERDAY, startMin: 630, endMin: 690 }),
    ];
    const plan = reschedulePlan(tasks, [], TODAY, 600);
    const [p1, p2] = plan;
    expect(p2.startMin).toBeGreaterThanOrEqual(p1.endMin);
  });
});

describe("bestTimeFor — исторически типичный час (§4.3)", () => {
  it("мода часа среди похожих выполненных задач", () => {
    const tasks = [
      mkTask({ id: "a", date: addDaysKey(TODAY, -2), startMin: 600, status: "done", tags: ["работа"] }),
      mkTask({ id: "b", date: addDaysKey(TODAY, -3), startMin: 620, status: "done", tags: ["работа"] }),
      mkTask({ id: "c", date: addDaysKey(TODAY, -4), startMin: 900, status: "done", tags: ["работа"] }),
    ];
    expect(bestTimeFor(tasks, { tags: ["работа"] }, TODAY)).toBe(600); // 10:00
  });

  it("нет похожих данных → null (единичных совпадений недостаточно)", () => {
    const tasks = [mkTask({ id: "a", date: addDaysKey(TODAY, -2), status: "done", tags: ["спорт"] })];
    expect(bestTimeFor(tasks, { tags: ["спорт"] }, TODAY)).toBeNull();
    expect(bestTimeFor(tasks, { tags: ["учёба"] }, TODAY)).toBeNull();
  });
});

describe("estimateDuration — медианная длительность (§4.2)", () => {
  const realToday = todayKey();
  it("медиана по нечётной и чётной выборке", () => {
    const odd = [30, 45, 90].map((d, i) =>
      mkTask({ id: `o${i}`, date: addDaysKey(realToday, -1), startMin: 600, endMin: 600 + d, status: "done", tags: ["x"] })
    );
    expect(estimateDuration(odd, ["x"])).toBe(45);

    const even = [30, 50].map((d, i) =>
      mkTask({ id: `e${i}`, date: addDaysKey(realToday, -1), startMin: 600, endMin: 600 + d, status: "done", tags: ["x"] })
    );
    expect(estimateDuration(even, ["x"])).toBe(40);
  });

  it("нет данных / пустые теги → дефолт 30", () => {
    expect(estimateDuration([], ["x"])).toBe(30);
    expect(estimateDuration([mkTask({ id: "a", status: "done" })], [])).toBe(30);
  });
});

describe("scheduledMinutes и stuckTasks", () => {
  it("считает только реальные задачи дня (без skipped и повторов-родителей)", () => {
    const tasks = [
      mkTask({ id: "a", startMin: 600, endMin: 660 }),
      mkTask({ id: "b", startMin: 700, endMin: 760, status: "skipped" }),
      mkTask({ id: "c", startMin: 800, endMin: 860, recurrenceRule: "FREQ=DAILY" }),
    ];
    expect(scheduledMinutes(tasks)).toBe(60);
  });

  it("«зависшая» = переносили 3+ раз и дата в прошлом", () => {
    const tasks = [
      mkTask({ id: "stuck", date: YESTERDAY, movedCount: 3 }),
      mkTask({ id: "fresh", date: YESTERDAY, movedCount: 2 }),
      mkTask({ id: "todayish", date: TODAY, movedCount: 5 }),
    ];
    expect(stuckTasks(tasks, TODAY).map((t) => t.id)).toEqual(["stuck"]);
  });
});
