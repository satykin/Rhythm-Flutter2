/* ============================================================
 * Insights — дашборд продуктивности (Этап 2):
 * heatmap «часы × дни недели», сравнение недель, фокус-часы,
 * корреляция настроения и продуктивности, экспорт CSV/PDF.
 * ============================================================ */

import React, { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import { I, IconName } from "../../components/icons";
import { useApp } from "../../state/store";
import { focusByWeek, pearson, productivityWindows } from "../suggestions/suggestionService";
import { addDaysKey, fmtDur, minToHM, todayKey, WD_SHORT, weekdayIdx, plural } from "../../lib/time";

const HOURS = Array.from({ length: 15 }, (_, i) => 7 + i);

export default function InsightsScreen() {
  const app = useApp();

  const data = useMemo(() => {
    const done = app.tasks.filter((t) => t.status === "done");
    const week = done.filter((t) => t.date >= addDaysKey(todayKey(), -6));

    /* heatmap: весь период, часы 7..21 */
    const heat = WD_SHORT.map(() => HOURS.map(() => 0));
    done.forEach((t) => {
      const h = Math.floor(t.startMin / 60);
      const hi = HOURS.indexOf(h);
      if (hi >= 0) heat[weekdayIdx(t.date)][hi]++;
    });
    const heatMax = Math.max(1, ...heat.flat());

    /* сравнение недель */
    const monday = addDaysKey(todayKey(), -weekdayIdx(todayKey()));
    const cmp = WD_SHORT.map((d, i) => {
      const thisKey = addDaysKey(monday, i);
      const prevKey = addDaysKey(thisKey, -7);
      return {
        day: d,
        prev: done.filter((t) => t.date === prevKey).length,
        cur: done.filter((t) => t.date === thisKey).length,
      };
    });

    /* фокус по неделям */
    const focus = focusByWeek(app.focusSessions, 6);
    const weekFocus = focus[focus.length - 1]?.min ?? 0;
    const prevFocus = focus[focus.length - 2]?.min ?? 0;
    const focusDelta = prevFocus ? Math.round(((weekFocus - prevFocus) / prevFocus) * 100) : 0;

    /* настроение ↔ продуктивность (по дням) */
    const dates = [...new Set(app.moods.map((m) => m.date))].sort();
    const scatter = dates.map((d) => {
      const logs = app.moods.filter((m) => m.date === d);
      const mood = logs.reduce((a, m) => a + m.mood, 0) / logs.length;
      const cnt = app.tasks.filter((t) => t.date === d && t.status === "done").length;
      return { mood: Number(mood.toFixed(2)), cnt };
    });
    const r = pearson(scatter.map((p) => p.mood), scatter.map((p) => p.cnt));

    const windows = productivityWindows(app.tasks);

    return {
      weekCount: week.length,
      totalDone: done.length,
      heat, heatMax, cmp, focus, weekFocus, focusDelta, scatter, r, windows,
      avgMood: scatter.length ? scatter.reduce((a, p) => a + p.mood, 0) / scatter.length : 0,
      sessions: app.focusSessions.filter((s) => s.date >= addDaysKey(todayKey(), -6)).length,
    };
  }, [app.tasks, app.moods, app.focusSessions]);

  /* ---------- экспорт ---------- */
  const exportCsv = () => {
    const rows: string[] = ["type;date;title;value1;value2"];
    app.tasks.forEach((t) =>
      rows.push(`task;${t.date};${csvSafe(t.title)};${t.status};${minToHM(t.startMin)}-${minToHM(t.endMin)}`)
    );
    app.moods.forEach((m) => rows.push(`mood;${m.date};${csvSafe(m.note ?? "")};${m.mood};${m.tags.join(",")}`));
    app.focusSessions.forEach((s) => rows.push(`focus;${s.date};${s.type};${s.focusMin};${s.completed ? "done" : "partial"}`));
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `rhythm-insights-${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    app.toast("success", "CSV выгружен");
  };

  const kpis: { icon: IconName; label: string; value: string; sub: string; tone: string }[] = [
    { icon: "check", label: "Задач за 7 дней", value: String(data.weekCount), sub: `${data.totalDone} за всё время`, tone: "text-aqua-300 bg-aqua-400/12" },
    { icon: "timer", label: "Фокус за неделю", value: fmtDur(data.weekFocus), sub: `${data.focusDelta >= 0 ? "+" : ""}${data.focusDelta}% к прошлой`, tone: "text-vio-300 bg-vio-400/12" },
    { icon: "play", label: "Flow-сессий", value: String(data.sessions), sub: "за 7 дней", tone: "text-ind-400 bg-ind-400/12" },
    { icon: "heart", label: "Среднее настроение", value: data.avgMood ? `${data.avgMood.toFixed(1)}/5` : "—", sub: `корреляция с делами ${data.r >= 0 ? "+" : ""}${data.r.toFixed(2)}`, tone: "text-warn bg-warn/12" },
  ];

  return (
    <div id="insights" className="mx-auto max-w-[1060px] space-y-5">
      {/* ---------- KPI + экспорт ---------- */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-3 lg:grid-cols-4">
          {kpis.map((k, i) => (
            <section key={k.label} className={`anim-rise d-${i + 1} card p-4`}>
              <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${k.tone}`}><I n={k.icon} size={15} /></span>
              <div className="mt-3 font-display text-[22px] font-bold leading-none tracking-tight text-mist-50">{k.value}</div>
              <div className="mt-1 text-[10.5px] font-extrabold uppercase tracking-wider text-mist-400">{k.label}</div>
              <div className="text-[10.5px] font-semibold text-mist-500">{k.sub}</div>
            </section>
          ))}
        </div>
        <div className="flex gap-2 print:hidden">
          <button className="btn btn-ghost !px-3 !py-2 !text-[12px]" onClick={exportCsv}><I n="download" size={14} /> CSV</button>
          <button className="btn btn-ghost !px-3 !py-2 !text-[12px]" onClick={() => window.print()}><I n="file" size={14} /> PDF</button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------- heatmap ---------- */}
        <section className="anim-rise d-2 card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Продуктивность: часы × дни недели</h3>
              <p className="mt-0.5 text-[12px] text-mist-400">
                Лучшие окна: {data.windows.slice(0, 2).map((w) => `${minToHM(w.start)}–${minToHM(w.end)}`).join(" и ") || "копим данные"}
              </p>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-mist-500">
              меньше
              {[0.12, 0.3, 0.5, 0.75, 1].map((o) => (
                <span key={o} className="h-3 w-3 rounded-[4px]" style={{ background: `rgba(55,214,192,${o})` }} />
              ))}
              больше
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="ml-9 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${HOURS.length}, 1fr)` }}>
                {HOURS.map((h) => (
                  <span key={h} className="text-center text-[9px] font-bold text-mist-500">{h}</span>
                ))}
              </div>
              {WD_SHORT.map((d, di) => (
                <div key={d} className="mt-[3px] flex items-center gap-2">
                  <span className={`w-7 text-right text-[10px] font-extrabold ${di === weekdayIdx(todayKey()) ? "text-aqua-300" : "text-mist-500"}`}>{d}</span>
                  <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: `repeat(${HOURS.length}, 1fr)` }}>
                    {data.heat[di].map((v, hi) => (
                      <div
                        key={hi}
                        title={`${d}, ${HOURS[hi]}:00 — ${v} ${plural(v, "задача", "задачи", "задач")}`}
                        className="h-6 rounded-[5px] transition-transform hover:scale-110"
                        style={{ background: v === 0 ? "rgba(255,255,255,0.035)" : `rgba(55,214,192,${0.15 + (v / data.heatMax) * 0.85})` }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- сравнение недель ---------- */}
        <section className="anim-rise d-3 card p-5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Эта неделя против прошлой</h3>
          <div className="mt-4 h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.cmp} margin={{ top: 5, right: 5, left: -22, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "#67728c", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
                <YAxis tick={{ fill: "#67728c", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} contentStyle={{ background: "#141927", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, fontFamily: "Manrope" }} formatter={(v: number | string, n: string) => [v, n === "cur" ? "эта неделя" : "прошлая"]} />
                <Bar dataKey="prev" fill="rgba(135,146,172,0.35)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="cur" fill="url(#bar-grad)" radius={[3, 3, 0, 0]} />
                <defs>
                  <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#9D7BFF" />
                    <stop offset="1" stopColor="#6C7BFF" />
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ---------- фокус ---------- */}
        <section className="anim-rise d-4 card p-5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Фокус-часы по неделям</h3>
          <p className="mt-0.5 text-[12px] text-mist-400">из Flow Sessions · {fmtDur(data.weekFocus)} на этой</p>
          <div className="mt-4 h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.focus} margin={{ top: 5, right: 5, left: -18, bottom: 0 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#67728c", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
                <YAxis tick={{ fill: "#67728c", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${Math.round(v / 60)}ч`} />
                <Tooltip contentStyle={{ background: "#141927", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, fontFamily: "Manrope" }} formatter={(v: number | string) => [fmtDur(Number(v)), "фокус"]} />
                <Area dataKey="min" stroke="#37D6C0" strokeWidth={2.2} fill="rgba(55,214,192,0.13)" type="monotone" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* ---------- корреляция ---------- */}
        <section className="anim-rise d-5 card p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Настроение ↔ выполненные задачи</h3>
              <p className="mt-0.5 text-[12px] text-mist-400">Каждая точка — день. r = {data.r >= 0 ? `+${data.r.toFixed(2)}` : data.r.toFixed(2)}</p>
            </div>
            <span className={`chip ${Math.abs(data.r) >= 0.4 ? "!border-aqua-400/30 !bg-aqua-400/10 !text-aqua-300" : ""}`}>
              {Math.abs(data.r) >= 0.6 ? "сильная связь" : Math.abs(data.r) >= 0.3 ? "заметная связь" : "слабая связь"}
            </span>
          </div>
          <div className="mt-4 h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 5, right: 12, left: -14, bottom: 2 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                <XAxis type="number" dataKey="mood" name="настроение" domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: "#67728c", fontSize: 10, fontWeight: 700 }} tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
                <YAxis type="number" dataKey="cnt" name="задачи" tick={{ fill: "#67728c", fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.15)" }} contentStyle={{ background: "#141927", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, fontSize: 12, fontFamily: "Manrope" }} formatter={(v: number | string, n: string) => [v, n === "mood" ? "настроение" : "задач"]} />
                <Scatter data={data.scatter} fill="#9D7BFF" fillOpacity={0.75} shape="circle" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}

function csvSafe(s: string) {
  return `"${s.replace(/"/g, '""').replace(/;/g, ",")}"`;
}
