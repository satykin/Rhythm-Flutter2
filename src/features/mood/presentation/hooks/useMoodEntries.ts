/* ============================================================
 * useMoodEntries — лента Журнала (Фаза A):
 * поиск по заметке/тегам, группировка по датам, бесконечный скролл.
 * ============================================================ */

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../../../../state/store";
import { sortDesc } from "../../domain/moodService";
import { fmtDateLong, relDayLabel, todayKey } from "../../../../lib/time";
import type { MoodLog } from "../../../../lib/types";

export const PAGE_SIZE = 15;

export interface MoodDayGroup {
  date: string;
  label: string;
  entries: MoodLog[];
}

export function useMoodEntries() {
  const app = useApp();
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  /* поиск (заметка + теги), регистронезависимый */
  const filtered = useMemo(() => {
    const all = sortDesc(app.moods);
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (m) =>
        (m.note ?? "").toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [app.moods, query]);

  /* сброс пагинации при смене поиска */
  useEffect(() => setVisible(PAGE_SIZE), [query]);

  const shown = useMemo(() => filtered.slice(0, visible), [filtered, visible]);
  const hasMore = visible < filtered.length;

  /* группировка по датам */
  const groups = useMemo<MoodDayGroup[]>(() => {
    const map = new Map<string, MoodLog[]>();
    for (const m of shown) {
      const arr = map.get(m.date) ?? [];
      arr.push(m);
      map.set(m.date, arr);
    }
    const today = todayKey();
    return [...map.entries()].map(([date, entries]) => ({
      date,
      label: date === today ? "Сегодня" : relDayLabel(date) === "Завтра" ? relDayLabel(date) : `${relDayLabel(date)} · ${fmtDateLong(date).split(", ")[1] ?? ""}`,
      entries,
    }));
  }, [shown]);

  /* бесконечный скролл */
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((v) => v + PAGE_SIZE);
      },
      { rootMargin: "240px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore]);

  return {
    query,
    setQuery,
    groups,
    total: filtered.length,
    hasMore,
    loadMore: () => setVisible((v) => v + PAGE_SIZE),
    sentinelRef,
  };
}
