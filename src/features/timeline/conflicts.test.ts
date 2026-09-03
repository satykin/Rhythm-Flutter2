import { describe, it, expect } from "vitest";
import { resolveSlot } from "./conflicts";

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
