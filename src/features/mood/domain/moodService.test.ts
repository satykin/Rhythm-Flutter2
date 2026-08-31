import { describe, expect, it } from "vitest";
import {
  MAX_TAGS,
  MOOD_STATES,
  NOTE_LIMIT,
  clampNote,
  latestMoodOfDay,
  moodLabel,
  normalizeTags,
  sortDesc,
  validateMoodDraft,
} from "./moodService";
import type { MoodLog } from "../../../lib/types";

const entry = (over: Partial<MoodLog>): MoodLog => ({
  id: over.id ?? "x",
  userId: "u1",
  date: over.date ?? "2026-01-10",
  timeMin: over.timeMin ?? 600,
  mood: over.mood ?? 3,
  tags: over.tags ?? [],
  linkedTaskIds: over.linkedTaskIds ?? [],
  source: over.source ?? "manual",
  loggedAt: over.loggedAt ?? "2026-01-10T10:00:00.000Z",
  updatedAt: over.updatedAt ?? "2026-01-10T10:00:00.000Z",
  ...over,
});

describe("MOOD_STATES", () => {
  it("ровно 5 состояний со score 1..5 и непустыми подписями", () => {
    expect(MOOD_STATES).toHaveLength(5);
    expect(MOOD_STATES.map((s) => s.score)).toEqual([1, 2, 3, 4, 5]);
    for (const s of MOOD_STATES) {
      expect(s.label.length).toBeGreaterThan(0);
      expect(s.hint.length).toBeGreaterThan(0);
    }
  });

  it("moodLabel возвращает подпись, а не число", () => {
    expect(moodLabel(3)).toBe("Нейтрально");
    expect(moodLabel(5)).toBe("Поток / подъём");
    expect(moodLabel(99)).toBe("Нейтрально");
  });
});

describe("normalizeTags", () => {
  it("обрезает, приводит к нижнему регистру и убирает дубликаты", () => {
    expect(normalizeTags([" Work ", "#work", "SLEEP", "rest"])).toEqual(["work", "sleep", "rest"]);
  });

  it("не больше MAX_TAGS", () => {
    const many = ["a", "b", "c", "d", "e", "f", "g"];
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });

  it("игнорирует пустые", () => {
    expect(normalizeTags(["", "  ", "#"])).toEqual([]);
  });
});

describe("clampNote", () => {
  it("ограничивает длину NOTE_LIMIT", () => {
    expect(clampNote("x".repeat(NOTE_LIMIT + 50))).toHaveLength(NOTE_LIMIT);
  });
});

describe("validateMoodDraft", () => {
  it("принимает валидный score и чистит note/tags", () => {
    const ok = validateMoodDraft({ mood: 4, note: "  привет  ", tags: ["Work", "work"] });
    expect(ok).toEqual({ mood: 4, note: "привет", tags: ["work"] });
  });

  it("отклоняет score вне 1..5", () => {
    expect(validateMoodDraft({ mood: 0 })).toBeNull();
    expect(validateMoodDraft({ mood: 6 })).toBeNull();
  });

  it("пустая заметка → undefined", () => {
    expect(validateMoodDraft({ mood: 3, note: "   " })?.note).toBeUndefined();
  });
});

describe("latestMoodOfDay / sortDesc", () => {
  it("возвращает последнюю запись дня по timeMin", () => {
    const a = entry({ id: "a", timeMin: 500 });
    const b = entry({ id: "b", timeMin: 900 });
    const c = entry({ id: "c", date: "2026-01-11", timeMin: 100 });
    expect(latestMoodOfDay([a, b, c], "2026-01-10")?.id).toBe("b");
    expect(latestMoodOfDay([a, b, c], "2026-01-12")).toBeNull();
  });

  it("сортирует новые сверху", () => {
    const a = entry({ id: "a", date: "2026-01-09", timeMin: 900 });
    const b = entry({ id: "b", date: "2026-01-10", timeMin: 100 });
    const c = entry({ id: "c", date: "2026-01-10", timeMin: 800 });
    expect(sortDesc([a, b, c]).map((m) => m.id)).toEqual(["c", "b", "a"]);
  });
});
