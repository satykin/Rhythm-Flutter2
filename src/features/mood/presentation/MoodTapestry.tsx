/* ============================================================
 * Mood Tapestry — вкладка «Неделя» (Фаза C, §10.1).
 * Сетка 7×3: дни (Пн–Вс) × утро/день/вечер. В ячейке — эмодзи
 * ПОСЛЕДНЕЙ записи слота; пуста, если данных нет. Score не
 * показывается. Тап на день → записи этого дня (→ Detail View).
 * ============================================================ */

import React, { useMemo, useState } from "react";
import { I, MoodFace } from "../../../components/icons";
import { useApp } from "../../../state/store";
import { buildTapestry, SLOT_ORDER, weekDates, type DaySlot } from "../domain/moodAnalytics";
import { moodLabel } from "../domain/moodService";
import { addDaysKey, fmtDateShort, keyToDate, minToHM, todayKey, weekdayShort } from "../../../lib/time";
import type { MoodLog } from "../../../lib/types";
import DetailView from "./DetailView";

const SLOT_LABEL: Record<DaySlot, string> = { morning: "Утро", day: "День", evening: "Вечер" };

export default function MoodTapestry() {
  const app = useApp();
  const [anchor, setAnchor] = useState(todayKey());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [detail, setDetail] = useState<MoodLog | null>(null);

  const dates = useMemo(() => weekDates(anchor), [anchor]);
  const grid = useMemo(() => buildTapestry(app.moods, dates), [app.moods, dates]);
  const today = todayKey();
  const isCurrentWeek = dates.includes(today);

  const dayEntries = useMemo(
    () =>
      selectedDay
        ? app.moods
            .filter((m) => m.date === selectedDay)
            .sort((a, b) => b.timeMin - a.timeMin || b.loggedAt.localeCompare(a.loggedAt))
        : [],
    [app.moods, selectedDay]
  );

  const openDay = (d: string) => setSelectedDay((cur) => (cur === d ? null : d));

  return (
    <div className="space-y-4">
      {/* навигация по неделям */}
      <div className="flex items-center justify-between">
        <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => { setAnchor(addDaysKey(dates[0], -7)); setSelectedDay(null); }} aria-label="Предыдущая неделя">
          <I n="chevronRight" size={15} className="rotate-180" />
        </button>
        <div className="text-center">
          <span className="font-display text-[14px] font-bold text-mist-50">
            {fmtDateShort(dates[0])} — {fmtDateShort(dates[6])}
          </span>
          {!isCurrentWeek && (
            <button className="ml-2 text-[11px] font-bold text-vio-300 hover:text-vio-400" onClick={() => { setAnchor(todayKey()); setSelectedDay(null); }}>
              к текущей
            </button>
          )}
        </div>
        <button className="btn btn-ghost !px-2.5 !py-1.5" onClick={() => { setAnchor(addDaysKey(dates[0], 7)); setSelectedDay(null); }} aria-label="Следующая неделя">
          <I n="chevronRight" size={15} />
        </button>
      </div>

      {/* сетка 7×3 */}
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[560px]">
          {/* шапка: дни */}
          <div className="grid grid-cols-[56px_repeat(7,1fr)] gap-1">
            <div />
            {dates.map((d) => {
              const sel = selectedDay === d;
              const isToday = d === today;
              return (
                <button
                  key={d}
                  onClick={() => openDay(d)}
                  aria-pressed={sel}
                  className={`rounded-lg px-1 py-1.5 text-center transition ${
                    sel ? "bg-vio-400/15" : "hover:bg-white/[0.04]"
                  }`}
                >
                  <div className={`text-[10px] font-extrabold uppercase tracking-wider ${isToday ? "text-aqua-300" : "text-mist-500"}`}>
                    {weekdayShort(d)}
                  </div>
                  <div className={`text-[12px] font-bold ${sel ? "text-vio-300" : isToday ? "text-aqua-300" : "text-mist-300"}`}>
                    {keyToDate(d).getDate()}
                  </div>
                </button>
              );
            })}
          </div>

          {/* строки: утро/день/вечер */}
          {SLOT_ORDER.map((slot) => (
            <div key={slot} className="mt-1 grid grid-cols-[56px_repeat(7,1fr)] gap-1">
              <div className="flex items-center text-[10px] font-extrabold uppercase tracking-wider text-mist-500">
                {SLOT_LABEL[slot]}
              </div>
              {dates.map((d) => {
                const m = grid[d][slot];
                return (
                  <div
                    key={d}
                    className={`flex h-[52px] items-center justify-center rounded-lg border transition ${
                      selectedDay === d ? "border-vio-400/25" : "border-white/4"
                    } ${m ? "bg-white/[0.03]" : "bg-white/[0.01]"}`}
                    title={m ? `${weekdayShort(d)}, ${SLOT_LABEL[slot].toLowerCase()}: ${moodLabel(m.mood)} в ${minToHM(m.timeMin)}` : "Нет записи"}
                  >
                    {m ? (
                      <button
                        onClick={() => { openDay(d); setDetail(m); }}
                        aria-label={`${weekdayShort(d)}, ${SLOT_LABEL[slot].toLowerCase()}: ${moodLabel(m.mood)}`}
                        className="transition-transform hover:scale-110"
                      >
                        <MoodFace level={m.mood} size={30} active />
                      </button>
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-white/8" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* записи выбранного дня */}
      {selectedDay && (
        <div className="anim-rise rounded-xl border border-vio-400/20 bg-vio-400/[0.04] p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-display text-[13px] font-bold text-mist-50">
              {fmtDateShort(selectedDay)} · {dayEntries.length ? `${dayEntries.length} зап.` : "нет записей"}
            </span>
            <button className="iconbtn" onClick={() => setSelectedDay(null)} aria-label="Закрыть день">
              <I n="x" size={14} />
            </button>
          </div>
          {dayEntries.length === 0 ? (
            <p className="text-[12px] font-semibold text-mist-500">В этот день записей нет.</p>
          ) : (
            <div className="space-y-1.5">
              {dayEntries.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setDetail(m)}
                  className="flex w-full items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]"
                >
                  <MoodFace level={m.mood} size={26} active />
                  <span className="text-[12.5px] font-bold text-mist-100">{moodLabel(m.mood)}</span>
                  <span className="text-[11px] font-semibold text-mist-500">{minToHM(m.timeMin)}</span>
                  {m.note && <span className="ml-auto truncate text-[11px] text-mist-400">{m.note}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <DetailView entry={detail} onClose={() => setDetail(null)} onOpenEntry={(id) => setDetail(app.moods.find((m) => m.id === id) ?? null)} />
    </div>
  );
}
