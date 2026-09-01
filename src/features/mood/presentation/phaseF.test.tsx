/* ============================================================
 * UI-тесты Фазы F: панель фильтров, диалог экспорта CSV,
 * deep links (своя/чужая запись). Запускаются в jsdom (vitest).
 * Доменная логика покрыта отдельно: moodFilters/moodExport/deeplinks.test.ts.
 * ============================================================ */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import type { MoodLog } from "../../../lib/types";

/* ---------- моки (hoisted, чтобы фабрики vi.mock их видели) ---------- */

const appMock = vi.hoisted(() => ({
  user: { id: "u1", name: "Alex" },
  moods: [] as MoodLog[],
  routines: [],
  consumeDeepLink: vi.fn(),
  clearDeepLink: vi.fn(),
  setDeepLink: vi.fn(),
  openCheckIn: vi.fn(),
  removeMoodLog: vi.fn(),
  restoreMoodLog: vi.fn(),
  toast: vi.fn(),
}));

const dbMock = vi.hoisted(() => ({
  findMood: vi.fn(),
  tasksOf: vi.fn(() => []),
  focusSessionsOf: vi.fn(() => []),
  insertExportLog: vi.fn(),
  commit: vi.fn(async () => undefined),
  correlationsOf: vi.fn(() => []),
  insightFeedbackOf: vi.fn(() => []),
  moodsOf: vi.fn(() => []),
}));

vi.mock("../../../state/store", () => ({ useApp: () => appMock }));
vi.mock("../../../lib/db", () => ({ db: dbMock, sessionStore: { read: () => null, write: vi.fn(), clear: vi.fn() } }));

/* тяжёлые дети журнала — заглушки (DetailView — шпион) */
vi.mock("./NewInsightBanner", () => ({ default: () => null }));
vi.mock("./ExportPdfDialog", () => ({ default: () => null }));
vi.mock("./DetailView", () => ({
  default: ({ entry }: { entry: MoodLog | null }) => (entry ? <div data-testid="detail">{entry.id}</div> : null),
}));

import JournalScreen from "./JournalScreen";
import { EMPTY_FILTERS } from "../domain/moodFilters";

/* ---------- фикстуры ---------- */

const mk = (p: Partial<MoodLog> & { id: string }): MoodLog => ({
  userId: "u1",
  date: "2026-02-10",
  timeMin: 720,
  mood: 3,
  note: undefined,
  tags: [],
  linkedTaskIds: [],
  source: "manual",
  loggedAt: "2026-02-10T12:00:00.000Z",
  updatedAt: "2026-02-10T12:00:00.000Z",
  ...p,
});

const NO_DEEP_LINK = { filters: null, entryId: null, overviewTab: null };

beforeEach(() => {
  vi.clearAllMocks();
  appMock.consumeDeepLink.mockReturnValue(NO_DEEP_LINK);
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

/* ============================================================ */

describe("Панель фильтров журнала", () => {
  /* Запросы к записям скоупим к ленте (within), чтобы не ловить одноимённые
   * чипы фильтров в панели; фикстуры под кликаемый фильтр «Хорошо» = mood 4. */
  it("фильтр по состоянию скрывает остальные записи и обновляет счётчик", async () => {
    appMock.moods = [
      mk({ id: "a", mood: 4, tags: ["прогулка"] }),
      mk({ id: "b", mood: 1, date: "2026-02-09" }),
    ];
    render(<JournalScreen />);
    const feed = screen.getByTestId("journal-list");
    /* запросы по data-testid, не по тексту: «Тяжело» дублируется чипами фильтров вне ленты */
    expect(within(feed).getAllByTestId("journal-entry-mood").some((el) => el.textContent?.includes("Тяжело"))).toBe(true);

    await userEvent.click(screen.getByTitle("Хорошо"));

    const moodsAfter = within(feed).queryAllByTestId("journal-entry-mood");
    expect(moodsAfter.some((el) => el.textContent?.includes("Тяжело"))).toBe(false); // mood=1 скрыта
    expect(moodsAfter.some((el) => el.textContent?.includes("Хорошо"))).toBe(true); // mood=4 видима
    expect(screen.getByText(/Найдено:/)).toHaveTextContent("1");
  });

  it("кнопка «Сбросить» возвращает все записи", async () => {
    appMock.moods = [mk({ id: "a", mood: 4 }), mk({ id: "b", mood: 1 })];
    render(<JournalScreen />);

    await userEvent.click(screen.getByTitle("Хорошо"));
    expect(screen.getByText(/Найдено:/)).toHaveTextContent("1");

    await userEvent.click(screen.getByRole("button", { name: "Сбросить фильтры" }));
    expect(screen.getByText(/Найдено:/)).toHaveTextContent("2");
  });

  it("EMPTY_FILTERS не считается активным (кнопка сброса задизейблена)", () => {
    appMock.moods = [mk({ id: "a" })];
    render(<JournalScreen />);
    expect(screen.getByRole("button", { name: "Сбросить фильтры" })).toBeDisabled();
  });
});

describe("Экспорт CSV", () => {
  it("показывает сводку с числом записей и периодом ДО выгрузки", async () => {
    appMock.moods = [
      mk({ id: "a", mood: 5, note: "заметка", date: "2026-02-01" }),
      mk({ id: "b", mood: 2, date: "2026-02-15", linkedTaskIds: ["t1"] }),
    ];
    render(<JournalScreen />);

    await userEvent.click(screen.getByRole("button", { name: "Экспорт CSV" }));

    expect(screen.getByText("Экспорт CSV")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("2"); // число записей
    expect(screen.getByRole("dialog")).toHaveTextContent("1 февраля"); // период «с … по …»
    expect(screen.getByRole("dialog")).toHaveTextContent("15 февраля");
    // download ещё не вызван — ждём подтверждения
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("по подтверждению скачивает файл и логирует ТОЛЬКО факт (без содержимого)", async () => {
    appMock.moods = [
      mk({ id: "a", mood: 5, note: "секретная заметка" }),
      mk({ id: "b", mood: 2 }),
    ];
    render(<JournalScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Экспорт CSV" }));
    await userEvent.click(screen.getByRole("button", { name: "Скачать CSV" }));

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(dbMock.insertExportLog).toHaveBeenCalledTimes(1);
    const log = dbMock.insertExportLog.mock.calls[0][0];
    expect(log).toMatchObject({ userId: "u1", kind: "csv", count: 2 });
    /* содержимое записей в лог не попадает */
    expect(JSON.stringify(log)).not.toContain("секретная заметка");
  });

  it("Esc закрывает диалог без выгрузки", async () => {
    appMock.moods = [mk({ id: "a" })];
    render(<JournalScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Экспорт CSV" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(dbMock.insertExportLog).not.toHaveBeenCalled();
  });
});

describe("Deep links: доступ к записи", () => {
  it("своя запись по #/mood/entry/:id открывает Detail View", () => {
    appMock.consumeDeepLink.mockReturnValue({ ...NO_DEEP_LINK, entryId: "mine-1" });
    dbMock.findMood.mockReturnValue(mk({ id: "mine-1", userId: "u1" }));
    appMock.moods = [mk({ id: "mine-1", userId: "u1" })];

    render(<JournalScreen />);
    expect(screen.getByTestId("detail")).toHaveTextContent("mine-1");
  });

  it("чужая запись → «Не найдено», данные не отображаются", () => {
    appMock.consumeDeepLink.mockReturnValue({ ...NO_DEEP_LINK, entryId: "foreign-1" });
    dbMock.findMood.mockReturnValue(mk({ id: "foreign-1", userId: "other-user" }));
    /* чужая запись не должна оказаться в app.moods, но проверяем именно защиту */

    render(<JournalScreen />);
    expect(screen.queryByTestId("detail")).not.toBeInTheDocument();
    expect(appMock.toast).toHaveBeenCalledWith("error", "Запись не найдена");
  });

  it("несуществующая запись → «Не найдено» без утечки деталей", () => {
    appMock.consumeDeepLink.mockReturnValue({ ...NO_DEEP_LINK, entryId: "ghost" });
    dbMock.findMood.mockReturnValue(undefined);

    render(<JournalScreen />);
    expect(screen.queryByTestId("detail")).not.toBeInTheDocument();
    expect(appMock.toast).toHaveBeenCalledWith("error", "Запись не найдена");
  });

  it("фильтры из deep link применяются к ленте", () => {
    appMock.consumeDeepLink.mockReturnValue({ ...NO_DEEP_LINK, filters: { ...EMPTY_FILTERS, states: [5] } });
    appMock.moods = [mk({ id: "a", mood: 5 }), mk({ id: "b", mood: 1 })];

    render(<JournalScreen />);
    const feed = screen.getByTestId("journal-list");
    expect(screen.getByText(/Найдено:/)).toHaveTextContent("1");
    /* mood=1 отфильтрована из ленты — в ленте не должно остаться ни одного «Тяжело».
     * Запрос по data-testid: текст «Тяжело» в чипах фильтров рендерится ВНЕ ленты. */
    const moods = within(feed).queryAllByTestId("journal-entry-mood");
    expect(moods.some((el) => el.textContent?.includes("Тяжело"))).toBe(false);
  });
});
