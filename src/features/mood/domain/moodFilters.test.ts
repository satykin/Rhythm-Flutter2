import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS,
  applyFilters,
  countFiltered,
  isFilterActive,
  serializeFilters,
  deserializeFilters,
  type MoodFilters,
} from "./moodFilters";
import type { MoodLog } from "../../../lib/types";

const entry = (p: Partial<MoodLog> & { id: string }): MoodLog => ({
  userId: "u1",
  date: "2026-02-10",
  timeMin: 720,
  mood: 3,
  note: undefined,
  tags: [],
  linkedTaskIds: [],
  focusSessionId: undefined,
  source: "manual",
  loggedAt: "2026-02-10T12:00:00.000Z",
  updatedAt: "2026-02-10T12:00:00.000Z",
  ...p,
});

const DATA: MoodLog[] = [
  entry({ id: "a", mood: 5, tags: ["прогулка"], note: "отличный день", source: "manual", date: "2026-02-01" }),
  entry({ id: "b", mood: 3, tags: ["работа"], note: "обычно", source: "post_focus", date: "2026-02-10" }),
  entry({ id: "c", mood: 1, tags: ["работа", "стресс"], source: "evening", date: "2026-02-15", linkedTaskIds: ["t1"] }),
  entry({ id: "d", mood: 3, tags: ["прогулка"], source: "morning", date: "2026-02-20", focusSessionId: "f1" }),
];

describe("applyFilters: И между типами, ИЛИ внутри типа", () => {
  it("без фильтров возвращает всё", () => {
    expect(applyFilters(DATA, EMPTY_FILTERS)).toHaveLength(4);
  });

  it("ИЛИ внутри состояний", () => {
    const f: MoodFilters = { ...EMPTY_FILTERS, states: [1, 5] };
    expect(applyFilters(DATA, f).map((m) => m.id).sort()).toEqual(["a", "c"]);
  });

  it("ИЛИ внутри тегов", () => {
    const f: MoodFilters = { ...EMPTY_FILTERS, tags: ["прогулка", "стресс"] };
    expect(applyFilters(DATA, f).map((m) => m.id).sort()).toEqual(["a", "c", "d"]);
  });

  it("И между типами: состояние И тег", () => {
    const f: MoodFilters = { ...EMPTY_FILTERS, states: [3], tags: ["работа"] };
    expect(applyFilters(DATA, f).map((m) => m.id)).toEqual(["b"]);
  });

  it("диапазон дат включительно", () => {
    const f: MoodFilters = { ...EMPTY_FILTERS, dateFrom: "2026-02-10", dateTo: "2026-02-15" };
    expect(applyFilters(DATA, f).map((m) => m.id).sort()).toEqual(["b", "c"]);
  });

  it("ИЛИ внутри источников", () => {
    const f: MoodFilters = { ...EMPTY_FILTERS, sources: ["morning", "evening"] };
    expect(applyFilters(DATA, f).map((m) => m.id).sort()).toEqual(["c", "d"]);
  });

  it("hasNote / hasLinks", () => {
    expect(applyFilters(DATA, { ...EMPTY_FILTERS, hasNote: true }).map((m) => m.id).sort()).toEqual(["a", "b"]);
    expect(applyFilters(DATA, { ...EMPTY_FILTERS, hasLinks: true }).map((m) => m.id).sort()).toEqual(["c", "d"]);
    expect(applyFilters(DATA, { ...EMPTY_FILTERS, hasLinks: false }).map((m) => m.id).sort()).toEqual(["a", "b"]);
  });

  it("комбинируется с текстовым поиском", () => {
    const f: MoodFilters = { ...EMPTY_FILTERS, states: [3] };
    expect(applyFilters(DATA, f, "обычн").map((m) => m.id)).toEqual(["b"]);
  });

  it("countFiltered совпадает с длиной результата", () => {
    const f: MoodFilters = { ...EMPTY_FILTERS, tags: ["работа"] };
    expect(countFiltered(DATA, f)).toBe(applyFilters(DATA, f).length);
  });
});

describe("сброс и активность", () => {
  it("EMPTY_FILTERS не активен", () => {
    expect(isFilterActive(EMPTY_FILTERS)).toBe(false);
  });
  it("любой заполненный фильтр активен", () => {
    expect(isFilterActive({ ...EMPTY_FILTERS, states: [2] })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, hasNote: false })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTERS, dateFrom: "2026-01-01" })).toBe(true);
  });
  it("сброс возвращает полную выборку", () => {
    const f: MoodFilters = { ...EMPTY_FILTERS, states: [1] };
    expect(applyFilters(DATA, f)).toHaveLength(1);
    expect(applyFilters(DATA, EMPTY_FILTERS)).toHaveLength(4);
  });
});

describe("сериализация для deep links", () => {
  it("пустые фильтры → null", () => {
    expect(serializeFilters(EMPTY_FILTERS)).toBeNull();
  });

  it("round-trip сохраняет значения", () => {
    const f: MoodFilters = {
      states: [1, 3, 5],
      tags: ["работа"],
      dateFrom: "2026-02-01",
      dateTo: "2026-02-28",
      sources: ["manual", "evening"],
      hasNote: true,
      hasLinks: false,
    };
    const back = deserializeFilters(serializeFilters(f));
    expect(back).toEqual(f);
  });

  it("повреждённая строка → null (защита от мусора в URL)", () => {
    expect(deserializeFilters("%zz-not-json")).toBeNull();
    expect(deserializeFilters(null)).toBeNull();
  });

  it("отбрасывает некорректные score и источники", () => {
    const back = deserializeFilters(encodeURIComponent(JSON.stringify({ s: [0, 3, 9], r: ["manual", "hack"] })));
    expect(back?.states).toEqual([3]);
    expect(back?.sources).toEqual(["manual"]);
  });
});
