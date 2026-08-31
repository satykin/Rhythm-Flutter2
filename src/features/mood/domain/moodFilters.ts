/* ============================================================
 * MoodFilters — расширенные фильтры Журнала (Фаза F, §1).
 * Чистая доменная логика: И между типами фильтров, ИЛИ внутри типа.
 * Комбинируется с текстовым поиском. Сериализация — для deep links.
 * ============================================================ */

import type { MoodLog, MoodSource } from "../../../lib/types";

export interface MoodFilters {
  /** скрытые score состояний, напр. [1,3,5] */
  states: number[];
  /** теги (совпадение любого) */
  tags: string[];
  /** ISO-даты включительно */
  dateFrom?: string;
  dateTo?: string;
  /** источники записей */
  sources: MoodSource[];
  /** null = не важно */
  hasNote: boolean | null;
  /** есть связанные задачи или фокус-сессия */
  hasLinks: boolean | null;
}

export const EMPTY_FILTERS: MoodFilters = {
  states: [],
  tags: [],
  dateFrom: undefined,
  dateTo: undefined,
  sources: [],
  hasNote: null,
  hasLinks: null,
};

export const isFilterActive = (f: MoodFilters): boolean =>
  f.states.length > 0 ||
  f.tags.length > 0 ||
  Boolean(f.dateFrom) ||
  Boolean(f.dateTo) ||
  f.sources.length > 0 ||
  f.hasNote !== null ||
  f.hasLinks !== null;

const hasLinksOf = (m: MoodLog): boolean => m.linkedTaskIds.length > 0 || Boolean(m.focusSessionId);

/**
 * Применение фильтров. И между типами, ИЛИ внутри типа.
 * `query` — существующий текстовый поиск (заметка + теги).
 */
export function applyFilters(entries: MoodLog[], f: MoodFilters, query = ""): MoodLog[] {
  const q = query.trim().toLowerCase();
  return entries.filter((m) => {
    /* текстовый поиск */
    if (q && !(m.note ?? "").toLowerCase().includes(q) && !m.tags.some((t) => t.toLowerCase().includes(q))) {
      return false;
    }
    /* ИЛИ внутри состояний */
    if (f.states.length && !f.states.includes(m.mood)) return false;
    /* ИЛИ внутри тегов */
    if (f.tags.length && !f.tags.some((t) => m.tags.includes(t))) return false;
    /* диапазон дат (ISO-строки корректно сравниваются лексикографически) */
    if (f.dateFrom && m.date < f.dateFrom) return false;
    if (f.dateTo && m.date > f.dateTo) return false;
    /* ИЛИ внутри источников */
    if (f.sources.length && !f.sources.includes(m.source)) return false;
    /* наличие заметки */
    if (f.hasNote !== null && Boolean(m.note) !== f.hasNote) return false;
    /* наличие связей */
    if (f.hasLinks !== null && hasLinksOf(m) !== f.hasLinks) return false;
    return true;
  });
}

export const countFiltered = (entries: MoodLog[], f: MoodFilters, query = ""): number =>
  applyFilters(entries, f, query).length;

/* ---------- сериализация для deep links (?filters=...) ---------- */

interface SerializedFilters {
  s?: number[];
  t?: string[];
  f?: string;
  o?: string;
  r?: MoodSource[];
  n?: 0 | 1;
  l?: 0 | 1;
}

export function serializeFilters(f: MoodFilters): string | null {
  if (!isFilterActive(f)) return null;
  const s: SerializedFilters = {};
  if (f.states.length) s.s = [...f.states].sort();
  if (f.tags.length) s.t = f.tags;
  if (f.dateFrom) s.f = f.dateFrom;
  if (f.dateTo) s.o = f.dateTo;
  if (f.sources.length) s.r = f.sources;
  if (f.hasNote !== null) s.n = f.hasNote ? 1 : 0;
  if (f.hasLinks !== null) s.l = f.hasLinks ? 1 : 0;
  return encodeURIComponent(JSON.stringify(s));
}

/** Возвращает null, если строка пустая или повреждена (защита от мусора в URL). */
export function deserializeFilters(raw: string | null | undefined): MoodFilters | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(decodeURIComponent(raw)) as SerializedFilters;
    const sources: MoodSource[] = Array.isArray(s.r)
      ? s.r.filter((x): x is MoodSource => x === "manual" || x === "post_focus" || x === "morning" || x === "evening")
      : [];
    return {
      states: Array.isArray(s.s) ? s.s.filter((x) => typeof x === "number" && x >= 1 && x <= 5) : [],
      tags: Array.isArray(s.t) ? s.t.filter((x) => typeof x === "string") : [],
      dateFrom: typeof s.f === "string" ? s.f : undefined,
      dateTo: typeof s.o === "string" ? s.o : undefined,
      sources,
      hasNote: s.n === 1 ? true : s.n === 0 ? false : null,
      hasLinks: s.l === 1 ? true : s.l === 0 ? false : null,
    };
  } catch {
    return null;
  }
}
