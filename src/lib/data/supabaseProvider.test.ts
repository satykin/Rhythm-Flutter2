import { describe, it, expect } from "vitest";
import { focusToRow, rowToFocus } from "./supabaseProvider";
import type { FocusSession } from "../types";

/* Регрессия продажного бага: focus_sessions были integer, приложение
 * слало дробные минуты → PostgREST 400 → пустая таблица.
 * Тест фиксирует контракт маппинга против колонок миграций 0003+0009. */

const session = (p: Partial<FocusSession> = {}): FocusSession => ({
  id: "s1",
  userId: "u1",
  type: "deep",
  startedAt: "2026-02-10T10:00:00.000Z",
  date: "2026-02-10",
  plannedFocusMin: 50,
  plannedBreakMin: 10,
  focusMin: 4.6,
  breakMin: 0,
  cycles: 0,
  completed: false,
  sounds: ["rain"],
  ...p,
});

describe("focus_sessions: маппинг провайдера (миграции 0003+0009)", () => {
  it("focusToRow шлёт ровно snake_case-колонки таблицы — без лишних полей", () => {
    const row = focusToRow(session());
    expect(Object.keys(row).sort()).toEqual(
      [
        "id", "user_id", "type", "started_at", "date",
        "planned_focus_min", "planned_break_min",
        "focus_min", "break_min", "cycles", "completed", "sounds",
      ].sort()
    );
  });

  it("дробная ФАКТИЧЕСКАЯ длительность проходит как есть (numeric(6,2), не integer)", () => {
    const row = focusToRow(session({ focusMin: 4.6, breakMin: 2.3 }));
    expect(row.focus_min).toBe(4.6);
    expect(row.break_min).toBe(2.3);
    expect(row.completed).toBe(false);
    expect(row.user_id).toBe("u1");
  });

  it("round-trip: rowToFocus(focusToRow(s)) восстанавливает доменную модель", () => {
    const s = session({ focusMin: 49.7, breakMin: 9.9, completed: true, cycles: 1, sounds: ["rain", "cafe"] });
    expect(rowToFocus(focusToRow(s))).toEqual(s);
  });

  it("естественное завершение: целые минуты тоже валидны", () => {
    const row = focusToRow(session({ focusMin: 50, breakMin: 10, cycles: 1, completed: true }));
    expect(row.focus_min).toBe(50);
    expect(row.break_min).toBe(10);
    expect(row.planned_focus_min).toBe(50);
  });
});
