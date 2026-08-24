/* ============================================================
 * Mood Journal 2.0 — история чек-инов: график за 2 недели,
 * авто-инсайты, заметки, теги и привязка к задачам дня.
 * ============================================================ */

import React, { useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { I, MoodFace } from "../../components/icons";
import { useApp } from "../../state/store";
import { pearson } from "../suggestions/suggestionService";
import { addDaysKey, fmtDateShort, minToHM, todayKey } from "../../lib/time";
import type { MoodLog } from "../../lib/types";

const TAG_PRESETS = ["прогулка", "фокус", "встречи", "спорт", "стресс", "спокойствие", "сон"];

export default function JournalScreen() {
  const app = useApp();

  const chart = useMemo(() => {
    const today = todayKey();
    const days = Array.from({ length: 14 }, (_, i) => addDaysKey(today, -(13 - i)));
    return days.map((d) => {
      const logs = app.moods.filter((m) => m.date === d);
      const mood = logs.length ? logs.reduce((a, m) => a + m.mood, 0) / logs.length : null;
      const done = app.tasks.filter((t) => t.date === d && t.status === "done").length;
      return { date: fmtDateShort(d), mood: mood !== null ? Number(mood.toFixed(1)) : null, done };
    });
  }, [app.moods, app.tasks]);

  const insights = useMemo(() => {
    const pts = chart.filter((c) => c.mood !== null);
    const r = pearson(pts.map((p) => p.mood!), pts.map((p) => p.done));
    const walkDays = app.moods.filter((m) => m.tags.includes("прогулка") || m.tags.includes("спорт")).map((m) => m.date);
    const walkMood = app.moods.filter((m) => walkDays.includes(m.date));
    const noWalkMood = app.moods.filter((m) => !walkDays.includes(m.date));
    const avg = (arr: MoodLog[]) => (arr.length ? arr.reduce((a, m) => a + m.mood, 0) / arr.length : 0);
    const delta = avg(walkMood) - avg(noWalkMood);

    let streak = 0;
    let d = todayKey();
    if (!app.moods.some((m) => m.date === d)) d = addDaysKey(d, -1);
    while (app.moods.some((m) => m.date === d)) {
      streak++;
      d = addDaysKey(d, -1);
    }

    return {
      r,
      delta,
      hasWalkData: walkDays.length > 0 && noWalkMood.length > 0,
      streak,
      total: app.moods.length,
    };
  }, [app.moods, chart]);

  const entries = useMemo(() => [...app.moods].sort((a, b) => b.date.localeCompare(a.date) || b.timeMin - a.timeMin), [app.moods]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, { id: string; title: string; status: string }[]>();
    for (const t of app.tasks) {
      if (t.recurrenceRule) continue;
      const arr = map.get(t.date) ?? [];
      arr.push({ id: t.id, title: t.title, status: t.status });
      map.set(t.date, arr);
    }
    return map;
  }, [app.tasks]);

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      {/* ---------- график ---------- */}
      <section className="anim-rise card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[16px] font-bold tracking-tight text-mist-50">Дневник настроения</h2>
            <p className="mt-0.5 text-[12px] text-mist-400">{insights.total} чек-инов · серия {insights.streak} дн.</p>
          </div>
          <div className="flex gap-3 text-[11px] font-bold">
            <span className="flex items-center gap-1.5 text-vio-300"><span className="h-[3px] w-4 rounded-full bg-vio-400" /> настроение</span>
            <span className="flex items-center gap-1.5 text-mist-400"><span className="h-2.5 w-2.5 rounded-sm bg-ind-400/50" /> задачи</span>
          </div>
        </div>
        <div className="mt-4 h-[210px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#67728c", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} interval={2} />
              <YAxis yAxisId="mood" domain={[0, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: "#67728c", fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="done" orientation="right" hide domain={[0, (max: number) => Math.max(4, max)]} />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.04)" }}
                contentStyle={{ background: "#141927", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, fontFamily: "Manrope" }}
                labelStyle={{ color: "#e8ecf6", fontWeight: 800 }}
                itemStyle={{ padding: 0 }}
                formatter={(value: number | string, name: string) => [value, name === "mood" ? "настроение" : "задач выполнено"]}
              />
              <Bar yAxisId="done" dataKey="done" fill="rgba(108,123,255,0.32)" radius={[3, 3, 0, 0]} barSize={12} />
              <Line yAxisId="mood" dataKey="mood" stroke="#9D7BFF" strokeWidth={2.4} dot={{ r: 3, fill: "#9D7BFF", strokeWidth: 0 }} connectNulls type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ---------- инсайты ---------- */}
      <section className="anim-rise d-1 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 text-vio-300"><I n="spark" size={14} /><span className="text-[10.5px] font-extrabold uppercase tracking-wider">Настроение ↔ задачи</span></div>
          <div className="mt-2 font-display text-[22px] font-bold text-mist-50">{insights.r >= 0 ? `+${insights.r.toFixed(2)}` : insights.r.toFixed(2)}</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-mist-400">
            {Math.abs(insights.r) >= 0.5 ? "сильная связь: в хорошие дни ты делаешь заметно больше" : Math.abs(insights.r) >= 0.25 ? "умеренная связь между настроением и продуктивностью" : "прямой связи пока не видно — накопи больше данных"}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-aqua-300"><I n="heart" size={14} /><span className="text-[10.5px] font-extrabold uppercase tracking-wider">Активные дни</span></div>
          <div className="mt-2 font-display text-[22px] font-bold text-mist-50">
            {insights.hasWalkData ? `${insights.delta >= 0 ? "+" : ""}${insights.delta.toFixed(1)}` : "—"}
          </div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-mist-400">
            {insights.hasWalkData
              ? "к среднему настроению в дни с прогулкой/спортом"
              : "отмечай теги «прогулка» и «спорт» — сравним настроение"}
          </p>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-2 text-warn"><I n="flame" size={14} /><span className="text-[10.5px] font-extrabold uppercase tracking-wider">Серия чек-инов</span></div>
          <div className="mt-2 font-display text-[22px] font-bold text-mist-50">{insights.streak} дн.</div>
          <p className="mt-1 text-[11.5px] leading-relaxed text-mist-400">{insights.streak >= 5 ? "отличный ритм самонаблюдения" : "3 секунды в день — и Rhythm понимает тебя лучше"}</p>
        </div>
      </section>

      {/* ---------- записи ---------- */}
      <section className="anim-rise d-2 card p-5">
        <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Записи</h3>
        {entries.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-mist-400">Записей пока нет — пройди чек-ин на экране «Сегодня».</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {entries.slice(0, 24).map((m) => (
              <EntryRow key={m.id} log={m} dayTasks={tasksByDate.get(m.date) ?? []} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EntryRow({ log, dayTasks }: { log: MoodLog; dayTasks: { id: string; title: string; status: string }[] }) {
  const app = useApp();
  const [editNote, setEditNote] = useState<string | null>(null);

  const toggleTag = (t: string) => {
    const tags = log.tags.includes(t) ? log.tags.filter((x) => x !== t) : [...log.tags, t];
    app.updateMoodLog(log.id, { tags });
  };

  const toggleLink = (id: string) => {
    const linked = log.linkedTaskIds.includes(id) ? log.linkedTaskIds.filter((x) => x !== id) : [...log.linkedTaskIds, id];
    app.updateMoodLog(log.id, { linkedTaskIds: linked });
  };

  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.02] px-3.5 py-3 transition hover:bg-white/[0.04]">
      <div className="flex items-center gap-3">
        <MoodFace level={log.mood} size={30} active />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[13px] font-bold text-mist-50">{fmtDateShort(log.date)}</span>
            <span className="text-[10.5px] font-bold text-mist-500">{minToHM(log.timeMin)}</span>
          </div>
          {editNote === null ? (
            <button
              className="mt-0.5 block max-w-full truncate text-left text-[12px] text-mist-400 transition hover:text-mist-200"
              onClick={() => setEditNote(log.note ?? "")}
            >
              {log.note || <span className="text-mist-500">+ добавить заметку</span>}
            </button>
          ) : (
            <div className="mt-1 flex gap-1.5">
              <input
                className="input !py-1 !text-[12px]"
                value={editNote}
                autoFocus
                placeholder="Пара слов о дне…"
                onChange={(e) => setEditNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    app.updateMoodLog(log.id, { note: editNote.trim() || undefined });
                    setEditNote(null);
                  }
                  if (e.key === "Escape") setEditNote(null);
                }}
              />
              <button
                className="btn btn-soft !px-2 !py-1"
                onClick={() => {
                  app.updateMoodLog(log.id, { note: editNote.trim() || undefined });
                  setEditNote(null);
                }}
              >
                <I n="check" size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* теги */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {TAG_PRESETS.map((t) => {
          const on = log.tags.includes(t);
          return (
            <button
              key={t}
              onClick={() => toggleTag(t)}
              className={`chip cursor-pointer transition ${on ? "!border-vio-400/45 !bg-vio-400/14 !text-vio-300" : "hover:!border-white/20"}`}
            >
              {t}
            </button>
          );
        })}
      </div>

      {/* связанные задачи */}
      {dayTasks.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-mist-500">С задачами дня:</span>
          {dayTasks.slice(0, 5).map((t) => {
            const on = log.linkedTaskIds.includes(t.id);
            return (
              <button
                key={t.id}
                onClick={() => toggleLink(t.id)}
                title={t.title}
                className={`chip cursor-pointer transition ${on ? "!border-aqua-400/40 !bg-aqua-400/10 !text-aqua-300" : "hover:!border-white/20"}`}
              >
                {t.status === "done" && <I n="check" size={9} />} {t.title.length > 22 ? `${t.title.slice(0, 22)}…` : t.title}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
