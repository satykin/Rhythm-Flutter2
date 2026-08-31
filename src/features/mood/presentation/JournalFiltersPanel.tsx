/* ============================================================
 * Панель расширенных фильтров Журнала (Фаза F, §1).
 * Вся логика — в домене moodFilters (И между типами, ИЛИ внутри);
 * здесь только контролы, счётчик и сброс. Доступность: подписи,
 * role=group, aria-pressed, клавиатура.
 * ============================================================ */

import React from "react";
import { I, MoodFace } from "../../../components/icons";
import { MOOD_STATES } from "../domain/moodService";
import { EMPTY_FILTERS, isFilterActive, type MoodFilters } from "../domain/moodFilters";
import type { MoodSource } from "../../../lib/types";
import { plural } from "../../../lib/time";

const SOURCE_META: { id: MoodSource; label: string }[] = [
  { id: "manual", label: "вручную" },
  { id: "post_focus", label: "после фокуса" },
  { id: "morning", label: "утро" },
  { id: "evening", label: "вечер" },
];

/** Три-стейт: не важно / есть / нет. */
function TriState({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const opts: { v: boolean | null; label: string }[] = [
    { v: null, label: "не важно" },
    { v: true, label: "есть" },
    { v: false, label: "нет" },
  ];
  return (
    <div>
      <span className="label">{label}</span>
      <div className="inline-flex gap-[3px] rounded-[9px] border border-white/8 bg-ink-800 p-[3px]" role="group" aria-label={label}>
        {opts.map((o) => (
          <button
            key={String(o.v)}
            type="button"
            aria-pressed={value === o.v}
            onClick={() => onChange(value === o.v ? null : o.v)}
            className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition ${
              value === o.v ? "bg-ink-600/80 text-mist-50" : "text-mist-400 hover:text-mist-200"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function JournalFiltersPanel({
  filters,
  onChange,
  availableTags,
  total,
}: {
  filters: MoodFilters;
  onChange: (f: MoodFilters) => void;
  availableTags: string[];
  total: number;
}) {
  const active = isFilterActive(filters);
  const set = (p: Partial<MoodFilters>) => onChange({ ...filters, ...p });

  const toggleState = (score: number) =>
    set({ states: filters.states.includes(score) ? filters.states.filter((x) => x !== score) : [...filters.states, score] });
  const toggleTag = (t: string) =>
    set({ tags: filters.tags.includes(t) ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] });
  const toggleSource = (s: MoodSource) =>
    set({ sources: filters.sources.includes(s) ? filters.sources.filter((x) => x !== s) : [...filters.sources, s] });

  return (
    <section className="anim-rise d-1 card px-4 py-3.5" aria-label="Фильтры журнала">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-vio-400/12 text-vio-300">
            <I n="sliders" size={13} />
          </span>
          <h2 className="font-display text-[13.5px] font-bold tracking-tight text-mist-50">Фильтры</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11.5px] font-bold text-mist-400" aria-live="polite">
            Найдено: <b className="font-display text-[13px] text-mist-50">{total}</b>{" "}
            {plural(total, "запись", "записи", "записей")}
          </span>
          <button className="btn btn-ghost !px-2.5 !py-1 !text-[11px]" onClick={() => onChange(EMPTY_FILTERS)} disabled={!active} aria-label="Сбросить фильтры">
            <I n="x" size={11} /> Сбросить
          </button>
        </div>
      </div>

      <div className="mt-3.5 grid gap-x-6 gap-y-4 lg:grid-cols-[auto_auto_1fr]">
        {/* состояния */}
        <div>
          <span className="label">Состояния</span>
          <div className="flex gap-1.5" role="group" aria-label="Состояния">
            {MOOD_STATES.map((s) => {
              const on = filters.states.includes(s.score);
              return (
                <button
                  key={s.score}
                  type="button"
                  aria-pressed={on}
                  title={s.label}
                  onClick={() => toggleState(s.score)}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border px-1.5 py-1.5 transition ${
                    on ? "border-vio-400/50 bg-vio-400/12" : "border-white/8 bg-white/[0.02] hover:border-white/20"
                  }`}
                >
                  <MoodFace level={s.score} size={20} active={on} />
                  <span className={`text-[8.5px] font-bold ${on ? "text-vio-300" : "text-mist-500"}`}>{s.label.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* даты + источники + три-стейты */}
        <div className="space-y-3">
          <div>
            <span className="label">Даты</span>
            <div className="flex items-center gap-1.5">
              <input type="date" className="input !w-[132px] !py-1 !text-[11.5px]" value={filters.dateFrom ?? ""} aria-label="С даты"
                onChange={(e) => set({ dateFrom: e.target.value || undefined })} />
              <span className="text-[11px] font-bold text-mist-500">—</span>
              <input type="date" className="input !w-[132px] !py-1 !text-[11.5px]" value={filters.dateTo ?? ""} aria-label="По дату"
                onChange={(e) => set({ dateTo: e.target.value || undefined })} />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            <TriState label="Заметка" value={filters.hasNote} onChange={(v) => set({ hasNote: v })} />
            <TriState label="Связи" value={filters.hasLinks} onChange={(v) => set({ hasLinks: v })} />
          </div>
        </div>

        {/* теги + источники */}
        <div className="space-y-3">
          {availableTags.length > 0 && (
            <div>
              <span className="label">Теги (любой из выбранных)</span>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Теги">
                {availableTags.slice(0, 12).map((t) => {
                  const on = filters.tags.includes(t);
                  return (
                    <button key={t} type="button" aria-pressed={on} onClick={() => toggleTag(t)}
                      className={`chip cursor-pointer transition ${on ? "!border-vio-400/45 !bg-vio-400/14 !text-vio-300" : "hover:!border-white/20"}`}>
                      #{t}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <span className="label">Источник</span>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Источник записи">
              {SOURCE_META.map((s) => {
                const on = filters.sources.includes(s.id);
                return (
                  <button key={s.id} type="button" aria-pressed={on} onClick={() => toggleSource(s.id)}
                    className={`chip cursor-pointer transition ${on ? "!border-aqua-400/45 !bg-aqua-400/12 !text-aqua-300" : "hover:!border-white/20"}`}>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
