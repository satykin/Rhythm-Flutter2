import { describe, it, expect } from "vitest";
import {
  canViewEntry,
  moodRouteToHash,
  parseMoodRoute,
  routeTab,
  tabToHash,
} from "./deeplinks";

describe("parseMoodRoute", () => {
  it("#/mood → обзор с табом по умолчанию", () => {
    expect(parseMoodRoute("#/mood")).toEqual({ kind: "overview", tab: "week" });
  });

  it("#/mood/overview/insights → обзор с конкретным табом", () => {
    expect(parseMoodRoute("#/mood/overview/insights")).toEqual({ kind: "overview", tab: "insights" });
    expect(parseMoodRoute("#/mood/overview/month")).toEqual({ kind: "overview", tab: "month" });
  });

  it("неизвестный таб обзора → none", () => {
    expect(parseMoodRoute("#/mood/overview/hack")).toEqual({ kind: "none" });
  });

  it("#/mood/journal → журнал без фильтров", () => {
    expect(parseMoodRoute("#/mood/journal")).toEqual({ kind: "journal", filters: null });
  });

  it("#/mood/journal?filters=... → журнал с сериализованными фильтрами", () => {
    const enc = encodeURIComponent(JSON.stringify({ s: [5] }));
    expect(parseMoodRoute(`#/mood/journal?filters=${enc}`)).toEqual({ kind: "journal", filters: enc });
  });

  it("#/mood/entry/:id → детальная запись", () => {
    expect(parseMoodRoute("#/mood/entry/abc-123")).toEqual({ kind: "entry", id: "abc-123" });
  });

  it("чужие маршруты → none", () => {
    expect(parseMoodRoute("")).toEqual({ kind: "none" });
    expect(parseMoodRoute("#/settings")).toEqual({ kind: "none" });
    expect(parseMoodRoute("#/mood/entry")).toEqual({ kind: "none" });
    expect(parseMoodRoute("#/mood/unknown/x")).toEqual({ kind: "none" });
  });
});

describe("moodRouteToHash — round trip", () => {
  it("все маршруты обратимы", () => {
    const routes = [
      parseMoodRoute("#/mood"),
      parseMoodRoute("#/mood/overview/month"),
      parseMoodRoute("#/mood/journal"),
      parseMoodRoute("#/mood/entry/x1"),
    ];
    for (const r of routes) {
      expect(parseMoodRoute(moodRouteToHash(r))).toEqual(r);
    }
  });
});

describe("routeTab / tabToHash", () => {
  it("маршрут → таб приложения", () => {
    expect(routeTab(parseMoodRoute("#/mood/overview/insights"))).toBe("mood");
    expect(routeTab(parseMoodRoute("#/mood/journal"))).toBe("journal");
    expect(routeTab(parseMoodRoute("#/mood/entry/x"))).toBe("journal");
    expect(routeTab(parseMoodRoute(""))).toBeNull();
  });

  it("таб → канонический hash", () => {
    expect(tabToHash("mood")).toBe("#/mood");
    expect(tabToHash("journal")).toBe("#/mood/journal");
    expect(tabToHash("today")).toBe("");
  });
});

describe("защита доступа к записям", () => {
  it("своя запись доступна", () => {
    expect(canViewEntry("u1", "u1")).toBe(true);
  });

  it("чужая запись недоступна (без утечки деталей)", () => {
    expect(canViewEntry("u2", "u1")).toBe(false);
  });

  it("несуществующая запись (null-владелец) недоступна", () => {
    expect(canViewEntry(null, "u1")).toBe(false);
  });
});
