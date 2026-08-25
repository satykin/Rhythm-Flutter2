import { describe, expect, it } from "vitest";
import {
  MAX_PROMPTS_PER_DAY,
  canShow,
  getPromptWindow,
  isWithinQuietHours,
  pickPrompt,
  promptOpensNote,
  type BudgetState,
  type PromptSettings,
} from "./promptBudget";

const H = 3_600_000;

const settings = (over: Partial<PromptSettings> = {}): PromptSettings => ({
  morningEnabled: true,
  morningTime: 8 * 60,
  eveningEnabled: true,
  eveningTime: 20 * 60 + 30,
  quietStart: 22 * 60,
  quietEnd: 8 * 60,
  skipIfRecentCheckin: true,
  ...over,
});

/** «чистое» состояние: ничего сегодня не показывалось, check-in давно. */
const state = (over: Partial<BudgetState> = {}): BudgetState => ({
  proactiveShownToday: 0,
  lastShownAt: null,
  consumedTypesToday: [],
  recentManualCheckInAt: null,
  ...over,
});

/* epoch для 2026-02-10 (вторник), чтобы nowMin и nowEpoch были согласованы */
const epochAt = (min: number) => new Date(2026, 1, 10, Math.floor(min / 60), min % 60).getTime();

describe("isWithinQuietHours", () => {
  it("ночной диапазон (через полночь 22:00→08:00)", () => {
    expect(isWithinQuietHours(23 * 60, 22 * 60, 8 * 60)).toBe(true); // 23:00
    expect(isWithinQuietHours(3 * 60, 22 * 60, 8 * 60)).toBe(true); // 03:00
    expect(isWithinQuietHours(12 * 60, 22 * 60, 8 * 60)).toBe(false); // 12:00
  });
  it("границы ночного диапазона: start включён, end исключён", () => {
    expect(isWithinQuietHours(22 * 60, 22 * 60, 8 * 60)).toBe(true);
    expect(isWithinQuietHours(8 * 60, 22 * 60, 8 * 60)).toBe(false);
  });
  it("дневной диапазон (13:00→15:00)", () => {
    expect(isWithinQuietHours(14 * 60, 13 * 60, 15 * 60)).toBe(true);
    expect(isWithinQuietHours(12 * 60, 13 * 60, 15 * 60)).toBe(false);
    expect(isWithinQuietHours(15 * 60, 13 * 60, 15 * 60)).toBe(false);
  });
});

describe("getPromptWindow", () => {
  it("утро: [08:00, 11:00)", () => {
    expect(getPromptWindow("morning", settings())).toEqual({ start: 480, end: 660 });
  });
  it("вечер: [20:30, 23:30)", () => {
    expect(getPromptWindow("evening", settings())).toEqual({ start: 1230, end: 1410 });
  });
  it("уважает кастомное время", () => {
    expect(getPromptWindow("morning", settings({ morningTime: 9 * 60 + 15 }))).toEqual({ start: 555, end: 735 });
  });
});

describe("canShow — каждое ограничение", () => {
  const ok = () => canShow("morning", 9 * 60, epochAt(9 * 60), settings(), state());

  it("базовый сценарий разрешён", () => {
    expect(ok()).toBe(true);
  });

  it("1. выключен в настройках", () => {
    expect(canShow("morning", 9 * 60, epochAt(9 * 60), settings({ morningEnabled: false }), state())).toBe(false);
    expect(canShow("evening", 21 * 60, epochAt(21 * 60), settings({ eveningEnabled: false }), state())).toBe(false);
  });

  it("2. тихие часы (включая переход через полночь)", () => {
    // 23:30 — внутри ночного quiet, но и внутри вечернего окна → blocked
    expect(canShow("evening", 23 * 60 + 30, epochAt(23 * 60 + 30), settings({ quietStart: 22 * 60, quietEnd: 8 * 60 }), state())).toBe(false);
    // 09:00 при дневном quiet 08:30–11:00 → blocked
    expect(canShow("morning", 9 * 60, epochAt(9 * 60), settings({ quietStart: 8 * 60 + 30, quietEnd: 11 * 60 }), state())).toBe(false);
  });

  it("3. вне окна промпта", () => {
    expect(canShow("morning", 7 * 60, epochAt(7 * 60), settings(), state())).toBe(false); // до окна
    expect(canShow("morning", 11 * 60 + 30, epochAt(11 * 60 + 30), settings(), state())).toBe(false); // после окна
  });

  it("4. максимум 2 проактивных в день", () => {
    expect(canShow("morning", 9 * 60, epochAt(9 * 60), settings(), state({ proactiveShownToday: MAX_PROMPTS_PER_DAY }))).toBe(false);
    expect(canShow("morning", 9 * 60, epochAt(9 * 60), settings(), state({ proactiveShownToday: MAX_PROMPTS_PER_DAY - 1 }))).toBe(true);
  });

  it("5. интервал ≥ 4 часов от последнего показа", () => {
    const now = epochAt(9 * 60);
    expect(canShow("morning", 9 * 60, now, settings(), state({ lastShownAt: now - 3 * H }))).toBe(false);
    expect(canShow("morning", 9 * 60, now, settings(), state({ lastShownAt: now - 5 * H }))).toBe(true);
  });

  it("6. один раз в день на тип", () => {
    expect(canShow("morning", 9 * 60, epochAt(9 * 60), settings(), state({ consumedTypesToday: ["morning"] }))).toBe(false);
    // вечер при потраченном утре — ещё можно
    expect(canShow("evening", 21 * 60, epochAt(21 * 60), settings(), state({ consumedTypesToday: ["morning"] }))).toBe(true);
  });

  it("7. недавний ручной check-in подавляет (только если включено)", () => {
    const now = epochAt(9 * 60);
    const recent = now - 1 * H;
    expect(canShow("morning", 9 * 60, now, settings(), state({ recentManualCheckInAt: recent }))).toBe(false);
    // выключили skip → показываем
    expect(canShow("morning", 9 * 60, now, settings({ skipIfRecentCheckin: false }), state({ recentManualCheckInAt: recent }))).toBe(true);
    // старый check-in (5 ч) не подавляет
    expect(canShow("morning", 9 * 60, now, settings(), state({ recentManualCheckInAt: now - 5 * H }))).toBe(true);
  });
});

describe("pickPrompt", () => {
  it("одновременно максимум один (утро приоритетнее)", () => {
    // пересечение: оба включены и оба «в окне» — искусственно сблизим окна
    const s = settings({ morningTime: 20 * 60, eveningTime: 20 * 60 + 30, quietStart: 23 * 60 + 30, quietEnd: 4 * 60 });
    const now = 21 * 60;
    expect(pickPrompt(now, epochAt(now), s, state())).toBe("morning");
  });
  it("возвращает null, когда ничего не положено", () => {
    expect(pickPrompt(12 * 60, epochAt(12 * 60), settings(), state())).toBeNull();
  });
});

describe("promptOpensNote", () => {
  it("вечер раскрывает заметку, утро — нет", () => {
    expect(promptOpensNote("evening")).toBe(true);
    expect(promptOpensNote("morning")).toBe(false);
  });
});
