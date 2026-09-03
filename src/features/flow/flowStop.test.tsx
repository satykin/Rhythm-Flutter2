import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { HoldStop, buildFocusSession, FLOW_CFG } from "./FlowScreen";

describe("HoldStop — кнопка «Стоп» (фикс 7)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("удержание 1.5 с прерывает сессию — onAbort вызывается ровно один раз", () => {
    const onAbort = vi.fn();
    render(<HoldStop onAbort={onAbort} />);
    const btn = screen.getByRole("button", { name: /Стоп/ });

    act(() => {
      fireEvent.pointerDown(btn);
    });
    expect(onAbort).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(onAbort).toHaveBeenCalledTimes(1);
  });

  it("отпускание раньше 1.5 с — сессия НЕ прерывается", () => {
    const onAbort = vi.fn();
    render(<HoldStop onAbort={onAbort} />);
    const btn = screen.getByRole("button", { name: /Стоп/ });

    act(() => {
      fireEvent.pointerDown(btn);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    act(() => {
      fireEvent.pointerUp(btn);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(onAbort).not.toHaveBeenCalled();
  });
});

describe("buildFocusSession — запись с ФАКТИЧЕСКОЙ длительностью (фикс 7)", () => {
  it("focusMin — факт (273 с → 4.6 мин), а не плановые 50", () => {
    const s = buildFocusSession({
      focusSec: 273,
      breakSec: 0,
      cycles: 0,
      type: "deep",
      durMin: 50,
      startedAt: "2026-02-10T10:00:00.000Z",
      completed: false,
      sounds: ["rain"],
    });
    expect(s.focusMin).toBe(4.6);
    expect(s.plannedFocusMin).toBe(50);
    expect(s.plannedBreakMin).toBe(FLOW_CFG.deep.breakMin);
    expect(s.completed).toBe(false);
    expect(s.startedAt).toBe("2026-02-10T10:00:00.000Z");
    expect(s.sounds).toEqual(["rain"]);
  });

  it("прерванная сессия помечается completed=false", () => {
    const done = buildFocusSession({ focusSec: 3000, breakSec: 600, cycles: 1, type: "deep", durMin: 50, startedAt: "x", completed: true, sounds: [] });
    const aborted = buildFocusSession({ focusSec: 300, breakSec: 0, cycles: 0, type: "deep", durMin: 50, startedAt: "x", completed: false, sounds: [] });
    expect(done.completed).toBe(true);
    expect(aborted.completed).toBe(false);
  });

  it("rest берёт плановую длительность из конфига, а не durMin", () => {
    const s = buildFocusSession({ focusSec: 300, breakSec: 0, cycles: 1, type: "rest", durMin: 99, startedAt: "x", completed: true, sounds: [] });
    expect(s.plannedFocusMin).toBe(FLOW_CFG.rest.focusMin); // 5, а не 99
    expect(s.plannedBreakMin).toBe(0);
    expect(s.focusMin).toBe(5);
  });
});
