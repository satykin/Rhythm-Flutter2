import { describe, it, expect } from "vitest";
import { resolveSlot, findCollisions, freeSlotOptions } from "./conflicts";

const T = (id: string, s: number, e: number) => ({ id, startMin: s, endMin: e });

describe("resolveSlot — разведение задач по слотам (фикс 7)", () => {
  it("свободный день — слот без изменений", () => {
    expect(resolveSlot([], 600, 60)).toEqual({ startMin: 600, endMin: 660, moved: false });
  });

  it("точное пересечение — авто-сдвиг вперёд на ближайший свободный", () => {
    expect(resolveSlot([T("a", 600, 660)], 600, 60)).toEqual({ startMin: 660, endMin: 720, moved: true });
  });

  it("несколько задач подряд — перепрыгивает все занятые", () => {
    expect(resolveSlot([T("a", 600, 660), T("b", 660, 720)], 615, 60)).toEqual({
      startMin: 720,
      endMin: 780,
      moved: true,
    });
  });

  it("ближайший свободный сзади — выбирает его (дистанция меньше)", () => {
    /* занято [615, 810): вперёд до 810 (далеко), сзади 585 (15 мин) */
    expect(resolveSlot([T("a", 615, 810)], 600, 30)).toEqual({ startMin: 585, endMin: 615, moved: true });
  });

  it("нет свободного окна до конца дня — null (вызывающий код предупредит)", () => {
    expect(resolveSlot([T("a", 360, 1425)], 1400, 60)).toBeNull();
  });

  it("длительность сохраняется, шаг 15 мин", () => {
    /* назад всё занято [360,610), вперёд окно только с 655 */
    const r = resolveSlot([T("a", 600, 650), T("b", 360, 610)], 610, 45);
    expect(r).toEqual({ startMin: 655, endMin: 700, moved: true });
    expect(r!.endMin - r!.startMin).toBe(45);
  });

  it("слот, стыкующийся с занятым без пересечения, не сдвигается", () => {
    /* [600,660) и занятое [660,720): касание — не пересечение */
    expect(resolveSlot([T("a", 660, 720)], 600, 60)).toEqual({ startMin: 600, endMin: 660, moved: false });
  });

  it("запрос раньше начала дня — кламп к границе", () => {
    expect(resolveSlot([], 100, 60)).toEqual({ startMin: 360, endMin: 420, moved: false });
  });
});

describe("findCollisions — обнаружение пересечений (фикс 11)", () => {
  const C = (id: string, s: number, e: number) => ({ id, title: `T${id}`, startMin: s, endMin: e });

  it("возвращает только пересекающие задачи", () => {
    const occ = [C("a", 600, 660), C("b", 700, 760)];
    expect(findCollisions(occ, 630, 690).map((c) => c.id)).toEqual(["a"]);
  });

  it("касание границ — не пересечение", () => {
    const occ = [C("a", 600, 660)];
    expect(findCollisions(occ, 660, 720)).toEqual([]);
    expect(findCollisions(occ, 540, 600)).toEqual([]);
  });

  it("несколько пересечений — все в результате", () => {
    const occ = [C("a", 600, 660), C("b", 650, 700), C("c", 800, 900)];
    expect(findCollisions(occ, 640, 680).map((x) => x.id).sort()).toEqual(["a", "b"]);
  });

  it("пустой день — нет коллизий", () => {
    expect(findCollisions([], 600, 660)).toEqual([]);
  });
});

describe("freeSlotOptions — варианты переноса для диалога (фикс 11)", () => {
  const T = (id: string, s: number, e: number) => ({ id, startMin: s, endMin: e });

  it("первый вариант — ближайшее свободное окно вперёд", () => {
    const opts = freeSlotOptions([T("a", 600, 660)], 600, 60);
    expect(opts[0]).toEqual({ startMin: 660, endMin: 720 });
  });

  it("возвращает до 3 неперекрывающихся вариантов", () => {
    const opts = freeSlotOptions([T("a", 600, 660)], 600, 60);
    expect(opts.length).toBeLessThanOrEqual(3);
    expect(opts.length).toBeGreaterThan(0);
    /* варианты не пересекаются между собой */
    for (let i = 1; i < opts.length; i++) {
      expect(opts[i].startMin).toBeGreaterThanOrEqual(opts[i - 1].endMin);
    }
  });

  it("длительность сохраняется во всех вариантах", () => {
    const opts = freeSlotOptions([T("a", 600, 660)], 615, 45);
    opts.forEach((o) => expect(o.endMin - o.startMin).toBe(45));
  });

  it("весь день занят — вариантов нет", () => {
    expect(freeSlotOptions([T("a", 360, 1440)], 600, 60)).toEqual([]);
  });

  it("варианты не пересекают занятые задачи", () => {
    const occ = [T("a", 600, 660), T("b", 720, 780)];
    const opts = freeSlotOptions(occ, 630, 60);
    opts.forEach((o) => {
      expect(findCollisions(occ.map((t) => ({ ...t, title: "x" })), o.startMin, o.endMin)).toEqual([]);
    });
  });
});
