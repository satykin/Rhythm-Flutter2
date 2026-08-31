import { describe, it, expect } from "vitest";
import {
  CSV_BOM,
  CSV_COLUMNS,
  buildCsvParts,
  buildJoin,
  buildReportHtml,
  csvEscape,
  csvFileName,
  entryRow,
  stateDistribution,
  periodBounds,
} from "./moodExport";
import { applyFilters, EMPTY_FILTERS, type MoodFilters } from "./moodFilters";
import type { FocusSession, MoodLog, Task } from "../../../lib/types";

const mood = (p: Partial<MoodLog> & { id: string }): MoodLog => ({
  userId: "u1",
  date: "2026-02-10",
  timeMin: 600,
  mood: 4,
  note: undefined,
  tags: [],
  linkedTaskIds: [],
  focusSessionId: undefined,
  source: "manual",
  loggedAt: "2026-02-10T07:00:00.000Z",
  updatedAt: "2026-02-10T07:00:00.000Z",
  ...p,
});

const task = (id: string, title: string): Task => ({
  id, userId: "u1", title, description: "", date: "2026-02-10", startMin: 600, endMin: 630,
  color: "violet", icon: "target", tags: [], energy: "medium", status: "done",
  source: "local", syncStatus: "local", createdAt: "", updatedAt: "",
});

const session = (id: string): FocusSession => ({
  id, userId: "u1", type: "deep", startedAt: "2026-02-10T10:00:00.000Z", date: "2026-02-10",
  plannedFocusMin: 50, plannedBreakMin: 10, focusMin: 48, breakMin: 10, cycles: 1,
  completed: true, sounds: ["rain"],
});

describe("CSV", () => {
  it("колонки в заданном порядке, score помечен служебным", () => {
    expect(CSV_COLUMNS[0]).toBe("logged_at (local)");
    expect(CSV_COLUMNS).toContain("score (service)");
    expect(CSV_COLUMNS[CSV_COLUMNS.length - 2]).toBe("logged_at (utc)");
    expect(CSV_COLUMNS[CSV_COLUMNS.length - 1]).toBe("updated_at (utc)");
  });

  it("экранирование кавычек, запятых и переводов строк (RFC 4180)", () => {
    expect(csvEscape("просто")).toBe("просто");
    expect(csvEscape("а,б")).toBe('"а,б"');
    expect(csvEscape('сказал "привет"')).toBe('"сказал ""привет"""');
    expect(csvEscape("строка1\nстрока2")).toBe('"строка1\nстрока2"');
  });

  it("начинается с UTF-8 BOM (Excel + кириллица + эмодзи)", () => {
    const parts = buildCsvParts([mood({ id: "m1" })], buildJoin([], []));
    expect(parts[0]).toBe(CSV_BOM);
  });

  it("строка содержит эмодзи, подпись, теги, связи и UTC-времена", () => {
    const join = buildJoin([task("t1", "Дизайн, лендинг")], [session("f1")]);
    const row = entryRow(
      mood({ id: "m1", mood: 5, tags: ["прогулка", "спорт"], linkedTaskIds: ["t1"], focusSessionId: "f1" }),
      join
    );
    expect(row).toContain("✨");
    expect(row).toContain("Поток / подъём");
    expect(row).toContain("прогулка; спорт");
    expect(row).toContain('"Дизайн, лендинг"'); // экранировано из-за запятой
    expect(row).toContain("deep; 48 мин; завершена");
    expect(row).toContain("2026-02-10T07:00:00.000Z");
  });

  it("связи подтягиваются батчем: чужие/несуществующие id не попадают в строку", () => {
    const join = buildJoin([task("t1", "Моя задача")], []);
    const row = entryRow(mood({ id: "m1", linkedTaskIds: ["t1", "чужой-id"] }), join);
    expect(row).toContain("Моя задача");
    expect(row).not.toContain("чужой-id");
  });

  it("экспорт учитывает активные фильтры", () => {
    const entries = [mood({ id: "a", mood: 5 }), mood({ id: "b", mood: 1 })];
    const f: MoodFilters = { ...EMPTY_FILTERS, states: [5] };
    const selected = applyFilters(entries, f);
    const csv = buildCsvParts(selected, buildJoin([], [])).join("");
    expect(csv).toContain("✨");
    expect(csv).not.toContain("😩");
  });

  it("большие наборы собираются чанками (несколько частей)", () => {
    const many = Array.from({ length: 1200 }, (_, i) => mood({ id: `m${i}` }));
    const parts = buildCsvParts(many, buildJoin([], []), 500);
    expect(parts.length).toBeGreaterThan(2);
    // filter(Boolean): каждая строка завершается \r\n, поэтому split даёт
    // завершающий пустой элемент — считаем только непустые (шапка + 1200 строк).
    expect(parts.join("").split("\r\n").filter(Boolean).length).toBe(1201);
  });

  it("имя файла включает диапазон дат или дату экспорта", () => {
    expect(csvFileName("2026-02-01", "2026-02-28")).toBe("rhythm-mood-2026-02-01-2026-02-28.csv");
    expect(csvFileName(undefined, undefined, new Date(2026, 1, 10))).toBe("rhythm-mood-2026-02-10.csv");
  });
});

describe("PDF-отчёт (print-based HTML)", () => {
  const data = {
    periodLabel: "с 2026-02-01 по 2026-02-28",
    entries: [mood({ id: "a", mood: 5, note: "хороший день", tags: ["прогулка"] }), mood({ id: "b", mood: 2 })],
    routines: [],
    insights: [{ title: "Наблюдение", body: "В дни с прогулками состояние чаще выше обычного" }],
    generatedAt: "2026-02-28 21:00",
    userName: "Alex",
  };

  it("содержит все обязательные секции", () => {
    const html = buildReportHtml(data);
    expect(html).toContain("отчёт о настроении"); // 1. заголовок
    expect(html).toContain("с 2026-02-01 по 2026-02-28"); // период
    expect(html).toContain("Сводка"); // 2. сводка
    expect(html).toContain("Лента состояний"); // 3. записи по дням
    expect(html).toContain("Наблюдения"); // 4. инсайты
  });

  it("инсайты сопровождаются обязательным дисклеймером", () => {
    const html = buildReportHtml(data);
    expect(html).toContain("Это наблюдения, а не доказательство причины.");
  });

  it("без инсайтов секция наблюдений отсутствует", () => {
    const html = buildReportHtml({ ...data, insights: [] });
    expect(html).not.toContain("Наблюдения");
  });

  it("дисклеймер о чувствительности данных всегда на месте", () => {
    const html = buildReportHtml(data);
    expect(html).toContain("чувствительные личные данные");
    expect(html).toContain("не отправлялся на сервер");
  });

  it("HTML-экранирование заметок (защита от разметки)", () => {
    const html = buildReportHtml({ ...data, entries: [mood({ id: "x", note: "<script>alert(1)</script>" })] });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("вспомогательное", () => {
  it("stateDistribution считает доли", () => {
    const dist = stateDistribution([mood({ id: "a", mood: 5 }), mood({ id: "b", mood: 5 }), mood({ id: "c", mood: 1 })]);
    expect(dist[0]).toMatchObject({ mood: 5, count: 2, share: 67 });
    expect(dist[1]).toMatchObject({ mood: 1, count: 1, share: 33 });
  });

  it("periodBounds задаёт границы периодов", () => {
    expect(periodBounds("month", "2026-02-28", "2026-02-01")).toMatchObject({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodBounds("30d", "2026-02-28", "2026-02-01").from).toBeDefined();
    expect(periodBounds("all", "2026-02-28", "2026-02-01").from).toBeUndefined();
  });
});
