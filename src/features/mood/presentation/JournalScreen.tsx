/* ============================================================
 * Журнал — история записей (Журнал 2.1, Фаза A).
 * Только лента: группировка по датам, поиск, бесконечный скролл,
 * редактирование и удаление (Undo). Аналитика — отдельно (Фаза C).
 * ============================================================ */

import React, { useEffect, useMemo, useState } from "react";
import { I, MoodFace } from "../../../components/icons";
import { useApp } from "../../../state/store";
import { db } from "../../../lib/db";
import { useMoodEntries } from "./hooks/useMoodEntries";
import { moodLabel } from "../domain/moodService";
import { fmtDateShort, minToHM } from "../../../lib/time";
import type { MoodLog } from "../../../lib/types";
import DetailView from "./DetailView";
import NewInsightBanner from "./NewInsightBanner";
import JournalFiltersPanel from "./JournalFiltersPanel";
import ExportCsvDialog from "./ExportCsvDialog";
import ExportPdfDialog from "./ExportPdfDialog";
import { EMPTY_FILTERS, isFilterActive, serializeFilters, type MoodFilters } from "../domain/moodFilters";
import { canViewEntry } from "../domain/deeplinks";

const SOURCE_LABEL: Record<MoodLog["source"], string> = {
  manual: "вручную",
  post_focus: "после фокуса",
  morning: "утро",
  evening: "вечер",
};

export default function JournalScreen() {
  const app = useApp();
  const [filters, setFilters] = useState<MoodFilters>(EMPTY_FILTERS);
  const j = useMoodEntries(filters);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  /* ---------- deep link: filters / entry (Фаза F, §4) ---------- */
  useEffect(() => {
    const d = app.consumeDeepLink();
    if (d.filters) setFilters(d.filters);
    if (d.entryId && app.user) {
      /* защита: только своя запись; чужая/несуществующая → «Не найдено» без деталей */
      const ownerId = db.findMood(d.entryId)?.userId ?? null;
      if (canViewEntry(ownerId, app.user.id)) setDetailId(d.entryId);
      else app.toast("error", "Запись не найдена");
    }
    // потребление — однократное при входе на экран
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* сериализация фильтров в hash (replace — не ломает историю браузера) */
  useEffect(() => {
    const s = serializeFilters(filters);
    const target = s ? `#/mood/journal?filters=${s}` : "#/mood/journal";
    if (window.location.hash !== target) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${target}`);
    }
  }, [filters]);

  /* Запись для Detail View (ищется по id, чтобы правки отражались live). */
  const detailEntry = useMemo(
    () => (detailId ? app.moods.find((m) => m.id === detailId) ?? null : null),
    [detailId, app.moods]
  );

  /* уникальные теги для панели фильтров (по убыванию частоты) */
  const availableTags = useMemo(() => {
    const freq = new Map<string, number>();
    for (const m of app.moods) for (const t of m.tags) freq.set(t, (freq.get(t) ?? 0) + 1);
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [app.moods]);

  /* период для сводки экспорта — из фактических дат отфильтрованных записей */
  const periodLabel = useMemo(() => {
    if (!j.filtered.length) return "нет записей";
    const dates = j.filtered.map((m) => m.date).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    return from === to ? fmtDateShort(from) : `с ${from} по ${to}`;
  }, [j.filtered]);

  const doDelete = (m: MoodLog) => {
    const needsConfirm = Boolean(m.note) || m.linkedTaskIds.length > 0;
    if (needsConfirm && armedDelete !== m.id) {
      setArmedDelete(m.id);
      window.setTimeout(() => setArmedDelete((v) => (v === m.id ? null : v)), 2500);
      return;
    }
    setArmedDelete(null);
    const removed = app.removeMoodLog(m.id);
    if (removed) {
      app.toast("info", `Запись от ${minToHM(removed.timeMin)} удалена`, [
        { label: "Вернуть", run: () => app.restoreMoodLog(removed) },
      ]);
    }
  };

  return (
    <div className="mx-auto max-w-[720px] space-y-5" data-testid="journal-feed">
      {/* мягкое проактивное появление нового инсайта (Фаза E, §8) */}
      <NewInsightBanner />

      {/* шапка + поиск */}
      <section className="anim-rise flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-[20px] font-bold tracking-tight text-mist-50">Журнал</h1>
          <p className="mt-0.5 text-[12px] font-semibold text-mist-500">
            {j.total > 0 ? `${j.total} записей` : "Пока нет записей"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <I n="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mist-500" />
            <input
              className="input !w-[200px] !pl-8 !text-[12.5px]"
              placeholder="Поиск по заметкам и тегам"
              value={j.query}
              onChange={(e) => j.setQuery(e.target.value)}
              aria-label="Поиск по журналу"
            />
          </div>
          <button className="btn btn-ghost !px-2.5 !py-2" onClick={() => setCsvOpen(true)} title="Экспорт CSV" aria-label="Экспорт CSV" data-testid="export-csv-btn">
            <I n="download" size={15} />
          </button>
          <button className="btn btn-ghost !px-2.5 !py-2" onClick={() => setPdfOpen(true)} title="Отчёт за период (PDF)" aria-label="Отчёт за период">
            <I n="file" size={15} />
          </button>
          <button className="btn btn-primary !px-3 !py-2" onClick={() => app.openCheckIn()} title="Отметить состояние (M)" data-testid="checkin-open-btn">
            <I n="plus" size={15} sw={2.4} /> Отметить
          </button>
        </div>
      </section>

      {/* расширенные фильтры (Фаза F, §1) */}
      <JournalFiltersPanel filters={filters} onChange={setFilters} availableTags={availableTags} total={j.total} />

      {/* пустые состояния */}
      {j.total === 0 && !j.query && !isFilterActive(filters) && (
        <section className="anim-rise d-1 flex flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-14 text-center">
          <MoodFace level={3} size={44} />
          <h2 className="mt-4 font-display text-[16px] font-semibold text-mist-50">Здесь появятся твои состояния</h2>
          <p className="mt-1.5 max-w-[380px] text-[13px] leading-relaxed text-mist-400">
            Отметь, как ты сейчас, — это занимает пару секунд. Возвращайся, когда захочешь: пропуски — это нормально.
          </p>
          <button className="btn btn-primary mt-5" onClick={() => app.openCheckIn()}>
            <I n="plus" size={15} sw={2.4} /> Первый чек-ин
          </button>
        </section>
      )}

      {j.total === 0 && (j.query || isFilterActive(filters)) && (
        <section className="anim-rise rounded-2xl border border-dashed border-white/10 px-6 py-12 text-center">
          <p className="text-[13px] font-semibold text-mist-400">
            {j.query ? `По запросу «${j.query}» ничего не нашлось` : "Под текущие фильтры не попало ни одной записи"}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {j.query && <button className="btn btn-ghost" onClick={() => j.setQuery("")}>Сбросить поиск</button>}
            {isFilterActive(filters) && <button className="btn btn-ghost" onClick={() => setFilters(EMPTY_FILTERS)}>Сбросить фильтры</button>}
          </div>
        </section>
      )}

      {/* лента */}
      {j.groups.map((g, gi) => (
        <section key={g.date} className={`anim-rise d-${Math.min(gi + 1, 6)}`}>
          <h2 className="mb-2 px-1 text-[11px] font-extrabold uppercase tracking-wider text-mist-500">{g.label}</h2>
          <div className="space-y-2.5">
            {g.entries.map((m) => (
              <EntryRow
                key={m.id}
                m={m}
                armed={armedDelete === m.id}
                onOpen={() => setDetailId(m.id)}
                onEdit={() => app.openCheckIn(m.id)}
                onDelete={() => doDelete(m)}
              />
            ))}
          </div>
        </section>
      ))}

      {/* бесконечный скролл */}
      {j.hasMore && (
        <div ref={j.sentinelRef} className="flex justify-center py-2">
          <button className="btn btn-ghost !text-[12px]" onClick={j.loadMore}>
            Показать ещё
          </button>
        </div>
      )}

      {/* Detail View (Фаза B) */}
      <DetailView entry={detailEntry} onClose={() => setDetailId(null)} onOpenEntry={(id) => setDetailId(id)} />

      {/* Экспорт (Фаза F): только по явному действию, с подтверждением */}
      <ExportCsvDialog open={csvOpen} onClose={() => setCsvOpen(false)} entries={j.filtered} periodLabel={periodLabel} />
      <ExportPdfDialog open={pdfOpen} onClose={() => setPdfOpen(false)} />
    </div>
  );
}

function EntryRow({
  m,
  armed,
  onOpen,
  onEdit,
  onDelete,
}: {
  m: MoodLog;
  armed: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      data-testid="journal-entry"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`Запись: ${moodLabel(m.mood)}, ${minToHM(m.timeMin)}`}
      className="group cursor-pointer rounded-xl border border-white/6 bg-white/[0.02] px-4 py-3 transition hover:border-white/12 hover:bg-white/[0.045]"
    >
      <div className="flex items-start gap-3">
        <MoodFace level={m.mood} size={32} active />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-[13px] font-extrabold text-mist-50">{moodLabel(m.mood)}</span>
            <span className="text-[10.5px] font-bold text-mist-500">{minToHM(m.timeMin)}</span>
            <span className="text-[9.5px] font-bold uppercase tracking-wider text-mist-500/70">{SOURCE_LABEL[m.source]}</span>
          </div>
          {m.note && <p className="mt-1 text-[12.5px] leading-relaxed text-mist-300">{m.note}</p>}
          {m.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {m.tags.map((t) => (
                <span key={t} className="chip !text-[9.5px]">#{t}</span>
              ))}
            </div>
          )}
          {m.linkedTaskIds.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-mist-500">
              <I n="target" size={10} /> связано с задачами: {m.linkedTaskIds.length}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            className="iconbtn"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label="Редактировать запись"
            title="Редактировать"
          >
            <I n="edit" size={14} />
          </button>
          <button
            className={`iconbtn ${armed ? "!bg-bad/15 !text-bad" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={armed ? "Подтвердить удаление" : "Удалить запись"}
            title={armed ? "Нажми ещё раз для удаления" : "Удалить"}
          >
            <I n="trash" size={14} />
          </button>
        </div>
      </div>
    </article>
  );
}
