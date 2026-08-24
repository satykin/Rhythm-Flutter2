import React, { useMemo } from "react";
import { I, IconName } from "./icons";
import { useApp } from "../state/store";
import { addDaysKey, todayKey, weekdayIdx, WD_SHORT, plural } from "../lib/time";

const HOURS = Array.from({ length: 15 }, (_, i) => 7 + i); // 07..21

export default function InsightsScreen() {
  const app = useApp();

  const data = useMemo(() => {
    const done = app.tasks.filter((t) => t.status === "done");
    const week = done.filter((t) => t.date >= addDaysKey(todayKey(), -6));

    /* по дням недели (вся история) */
    const byWeekday = [0, 0, 0, 0, 0, 0, 0];
    done.forEach((t) => byWeekday[weekdayIdx(t.date)]++);

    /* по часам */
    const byHour = new Map<number, number>();
    done.forEach((t) => {
      const h = Math.floor(t.startMin / 60);
      byHour.set(h, (byHour.get(h) ?? 0) + 1);
    });
    const hourCounts = HOURS.map((h) => byHour.get(h) ?? 0);
    const maxHour = Math.max(1, ...hourCounts);
    const bestHourIdx = hourCounts.indexOf(Math.max(...hourCounts));

    /* настроение */
    const last7 = app.moods.filter((m) => m.date >= addDaysKey(todayKey(), -6));
    const avgMood = last7.length ? last7.reduce((a, m) => a + m.mood, 0) / last7.length : 0;

    /* корреляция: дни с отдыхом/прогулкой vs без */
    const byDate = new Map<string, { done: number; walk: boolean }>();
    app.tasks.forEach((t) => {
      const rec = byDate.get(t.date) ?? { done: 0, walk: false };
      if (t.status === "done") rec.done++;
      if (t.status === "done" && t.tags.some((x) => ["отдых", "здоровье"].includes(x))) rec.walk = true;
      byDate.set(t.date, rec);
    });
    const walkDays = [...byDate.values()].filter((d) => d.walk);
    const noWalkDays = [...byDate.values()].filter((d) => !d.walk);
    const walkAvg = walkDays.length ? walkDays.reduce((a, d) => a + d.done, 0) / walkDays.length : 0;
    const noWalkAvg = noWalkDays.length ? noWalkDays.reduce((a, d) => a + d.done, 0) / noWalkDays.length : 0;
    const walkBoost = noWalkAvg > 0 ? Math.round(((walkAvg - noWalkAvg) / noWalkAvg) * 100) : 0;

    /* сон ↔ настроение (демо-корреляция от текущего sleepHours) */
    const sleep = app.user?.sleepHours ?? 7.5;

    const focusMin = week.reduce((a, t) => a + (t.endMin - t.startMin), 0);

    return {
      weekCount: week.length,
      avgMood,
      focusMin,
      byWeekday,
      hourCounts,
      maxHour,
      bestHour: HOURS[bestHourIdx],
      bestHourCount: hourCounts[bestHourIdx],
      walkBoost,
      walkDays: walkDays.length,
      sleep,
      totalDone: done.length,
    };
  }, [app.tasks, app.moods, app.user]);

  const maxWd = Math.max(1, ...data.byWeekday);
  const todayWd = weekdayIdx(todayKey());

  const kpis: { icon: IconName; label: string; value: string; sub: string; color: string }[] = [
    { icon: "check", label: "Задач за 7 дней", value: String(data.weekCount), sub: `${data.totalDone} за всё время`, color: "text-aqua-300 bg-aqua-400/12" },
    { icon: "timer", label: "Фокус за неделю", value: `${Math.floor(data.focusMin / 60)} ч ${data.focusMin % 60 ? `${data.focusMin % 60} м` : ""}`.trim(), sub: "по выполненным блокам", color: "text-vio-300 bg-vio-400/12" },
    { icon: "heart", label: "Среднее настроение", value: data.avgMood ? `${data.avgMood.toFixed(1)}/5` : "—", sub: "по чек-инам за 7 дней", color: "text-bad bg-bad/12" },
    { icon: "moon", label: "Сон", value: `${data.sleep.toFixed(1).replace(".0", "")} ч`, sub: "влияет на энергию", color: "text-ind-400 bg-ind-400/12" },
  ];

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      {/* -------- KPI -------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k, i) => (
          <section key={k.label} className={`anim-rise d-${i + 1} card p-4`}>
            <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${k.color}`}>
              <I n={k.icon} size={15} />
            </span>
            <div className="mt-3 font-display text-[22px] font-bold leading-none tracking-tight text-mist-50">{k.value}</div>
            <div className="mt-1 text-[11px] font-extrabold uppercase tracking-wider text-mist-400">{k.label}</div>
            <div className="text-[10.5px] font-semibold text-mist-500">{k.sub}</div>
          </section>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* -------- по дням недели -------- */}
        <section className="anim-rise d-2 card p-5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Выполнено по дням недели</h3>
          <p className="mt-0.5 text-[12px] text-mist-400">Вся история наблюдений</p>
          <div className="mt-5 flex h-[150px] items-end gap-2">
            {data.byWeekday.map((v, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center gap-1.5">
                <span className={`font-display text-[11px] font-bold transition ${i === todayWd ? "text-aqua-300" : "text-mist-500"}`}>{v}</span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full origin-bottom rounded-t-md transition-all duration-500 group-hover:brightness-125"
                    style={{
                      height: `${(v / maxWd) * 100}%`,
                      minHeight: 4,
                      background: i === todayWd ? "linear-gradient(180deg,#37D6C0,#6C7BFF)" : "linear-gradient(180deg,#9D7BFF55,#6C7BFF33)",
                    }}
                  />
                </div>
                <span className={`text-[10px] font-extrabold ${i === todayWd ? "text-aqua-300" : "text-mist-500"}`}>{WD_SHORT[i]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* -------- по часам -------- */}
        <section className="anim-rise d-3 card p-5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Продуктивность по часам</h3>
          <p className="mt-0.5 text-[12px] text-mist-400">
            Пик — <b className="text-aqua-300">{String(data.bestHour).padStart(2, "0")}:00–{String(data.bestHour + 1).padStart(2, "0")}:00</b> ({data.bestHourCount} {plural(data.bestHourCount, "задача", "задачи", "задач")})
          </p>
          <div className="mt-5 flex h-[150px] items-end gap-[5px]">
            {data.hourCounts.map((v, i) => (
              <div key={i} className="group flex flex-1 flex-col items-center gap-1.5" title={`${HOURS[i]}:00 — ${v}`}>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className="w-full origin-bottom rounded-t-[4px] transition-all duration-500 group-hover:brightness-150"
                    style={{
                      height: `${(v / data.maxHour) * 100}%`,
                      minHeight: 3,
                      background: v === data.bestHourCount && v > 0 ? "linear-gradient(180deg,#37D6C0,#37D6C066)" : "linear-gradient(180deg,#6C7BFF66,#6C7BFF22)",
                    }}
                  />
                </div>
                {i % 2 === 0 && <span className="text-[9px] font-bold text-mist-500">{HOURS[i]}</span>}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* -------- паттерны -------- */}
      <section className="anim-rise d-4 card p-5">
        <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Паттерны и корреляции</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-aqua-400/20 bg-aqua-400/[0.05] p-4">
            <div className="flex items-center gap-2 text-aqua-300">
              <I n="bolt" size={15} />
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider">Фокус</span>
            </div>
            <div className="mt-2 font-display text-[24px] font-bold leading-none text-mist-50">
              {String(data.bestHour).padStart(2, "0")}:00–{String(data.bestHour + 2 > 23 ? 23 : data.bestHour + 2).padStart(2, "0")}:00
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-400">твоё самое продуктивное окно — ставь сюда Deep Work</p>
          </div>

          <div className="rounded-xl border border-vio-400/20 bg-vio-400/[0.05] p-4">
            <div className="flex items-center gap-2 text-vio-300">
              <I n="coffee" size={15} />
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider">Отдых</span>
            </div>
            <div className="mt-2 font-display text-[24px] font-bold leading-none text-mist-50">
              {data.walkBoost > 0 ? `+${data.walkBoost}%` : data.walkBoost < 0 ? `${data.walkBoost}%` : "—"}
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-400">
              {data.walkDays > 0
                ? "задач в дни с прогулкой/спортом против остальных"
                : "добавь отдых в план — сравним продуктивность"}
            </p>
          </div>

          <div className="rounded-xl border border-ind-400/20 bg-ind-400/[0.05] p-4">
            <div className="flex items-center gap-2 text-ind-400">
              <I n="moon" size={15} />
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider">Сон</span>
            </div>
            <div className="mt-2 font-display text-[24px] font-bold leading-none text-mist-50">{data.sleep.toFixed(1).replace(".0", "")} ч</div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-mist-400">
              {data.sleep >= 7.5 ? "достаточно для пиковой энергии — так держать" : data.sleep >= 6.5 ? "неплохо, но 7.5+ ч даст заметный прирост" : "дефицит сна — Rhythm снизил планку сложных задач"}
            </p>
          </div>
        </div>
        <p className="mt-3 text-[10.5px] font-semibold text-mist-500">
          Считается локально по твоим данным · в Этапе 3 — ML-модель паттернов и недельные отчёты Rhythm AI
        </p>
      </section>
    </div>
  );
}
