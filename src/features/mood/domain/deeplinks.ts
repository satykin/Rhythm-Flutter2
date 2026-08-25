/* ============================================================
 * Deep links модуля настроения (Фаза F, §4).
 * Маршруты — hash-based (#/mood/...), т.к. приложение раздаётся
 * статически (dist/index.html): прямые URL /mood/... дали бы 404
 * при обновлении страницы, hash-маршруты работают всегда.
 *
 *   #/mood                        → Обзор (таб по умолчанию)
 *   #/mood/journal                → Журнал
 *   #/mood/journal?filters=<enc>  → Журнал с фильтрами
 *   #/mood/entry/:id              → Детальный просмотр записи
 *   #/mood/overview/week|month|insights
 * ============================================================ */

import type { TabId } from "../../../lib/types";

export type OverviewTab = "week" | "month" | "insights";

export type MoodRoute =
  | { kind: "overview"; tab: OverviewTab }
  | { kind: "journal"; filters: string | null }
  | { kind: "entry"; id: string }
  | { kind: "none" };

/** Разбор hash-строки вида "#/mood/journal?filters=...". */
export function parseMoodRoute(hash: string): MoodRoute {
  const clean = hash.replace(/^#/, "");
  if (!clean.startsWith("/mood")) return { kind: "none" };
  const [pathPart, queryPart] = clean.split("?");
  const seg = pathPart.split("/").filter(Boolean); // ["mood", ...]
  const params = new URLSearchParams(queryPart ?? "");

  if (seg.length === 1) return { kind: "overview", tab: "week" };
  if (seg[1] === "journal") return { kind: "journal", filters: params.get("filters") };
  if (seg[1] === "entry" && seg[2]) return { kind: "entry", id: seg[2] };
  if (seg[1] === "overview" && (seg[2] === "week" || seg[2] === "month" || seg[2] === "insights")) {
    return { kind: "overview", tab: seg[2] };
  }
  return { kind: "none" };
}

export function moodRouteToHash(route: MoodRoute): string {
  switch (route.kind) {
    case "overview":
      return route.tab === "week" ? "#/mood" : `#/mood/overview/${route.tab}`;
    case "journal":
      return route.filters ? `#/mood/journal?filters=${route.filters}` : "#/mood/journal";
    case "entry":
      return `#/mood/entry/${route.id}`;
    case "none":
      return "";
  }
}

/** Какой таб приложения соответствует маршруту (для синхронизации). */
export function routeTab(route: MoodRoute): TabId | null {
  if (route.kind === "overview") return "mood";
  if (route.kind === "journal" || route.kind === "entry") return "journal";
  return null;
}

/* ---------- таб приложения → канонический hash (replace, без мусора в истории) ---------- */

export function tabToHash(tab: TabId): string {
  if (tab === "mood") return "#/mood";
  if (tab === "journal") return "#/mood/journal";
  return "";
}

/* ---------- защита доступа (§4): запись должна принадлежать пользователю ---------- */

export function canViewEntry(entryOwnerId: string | null, currentUserId: string): boolean {
  return entryOwnerId !== null && entryOwnerId === currentUserId;
}
