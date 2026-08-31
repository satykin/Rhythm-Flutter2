/* ============================================================
 * Вкладка «Месяц» — исследование паттернов (Фаза C, §10.2).
 * Период по умолчанию 30 дней. У каждого графика — текстовая
 * альтернатива (a11y). Числовой score — только внутри подписей,
 * не главный визуальный элемент.
 * ============================================================ */

import React, { useMemo } from "react";
import { useApp } from "../../../state/store";
import { tagDistribution, weekdayDistribution, weekdayTextAlt } from "../domain/moodAnalytics";
import { mean, median, pearson, MIN_SAMPLE } from "../domain/correlationService";
import { addDaysKey, todayKey, weekdayIdx, WD_SHORT } from "../../../lib/time";
import type { MoodLog } from "../../../lib/types";

const PERIOD = 30;

function inPeriod(m: MoodLog, from: string, to: string) {
  return m.date >= from && m.date <= to;
}

export default function MonthAnalytics() {
  const app = useApp();
  const today = todayKey();
  const from = addDaysKey(today, -(PERIOD - 1));

  const moods = useMemo(() => app.moods.filter((m) => inPeriod(m, from, today)), [app.moods, from, today]);

  const baseline = useMemo(() => median(moods.map((m) => m.mood)), [moods]);
  const wdStats = useMemo(() => weekdayDistribution(moods), [moods]);
  const tagStats = useMemo(() => tagDistribution(moods), [moods]);
  const wdAlt = useMemo(() => weekdayTextAlt(wdStats), [wdStats]);

  /* привычки: медиана настроения в запланированные дни недели против baseline */
  const habitStats = useMemo(
    () =>
      app.routines.map((r) => {
        const group = moods.filter((m) => r.days.includes(weekdayIdx(m.date)));
        return { routine: r, count: group.length, median: group.length ? median(group.map((m) => m.mood)) : 0 };
      }),
    [app.routines, moods]
  );

  /* числовые факторы: дневные пары */
  const numeric = useMemo(() => {
    const byDay = new Map<string, number[]>();
    for (const m of moods) {
      const arr = byDay.get(m.date) ?? [];
      arr.push(m.mood);
      byDay.set(m.date, arr);
    }
    const days = [...byDay.keys()].sort();
    const focusByDay = new Map<string, number>();
    for (const s of app.focusSessions) focusByDay.set(s.date, (focusByDay.get(s.date) ?? 0) + s.focusMin);
    const doneByDay = new Map<string, number>();
    for (const t of app.tasks) if (t.status === "done") doneByDay.set(t.date, (doneByDay.get(t.date) ?? 0) + 1);

    const xs = days.map((d) => focusByDay.get(d) ?? 0);
    const xt = days.map((d) => doneByDay.get(d) ?? 0);
    const ys = days.map((d) => mean(byDay.get(d)!));
    const n = days.length;
    const rFocus = n >= MIN_SAMPLE ? pearson(xs, ys) : null;
    const rTasks = n >= MIN_SAMPLE ? pearson(xt, ys) : null;
    return { n, rFocus, rTasks };
  }, [moods, app.focusSessions, app.tasks]);

  const moodTone = (v: number) => (v >= baseline + 0.3 ? "text-aqua-300" : v <= baseline - 0.3 ? "text-bad" : "text-mist-300");

  if (moods.length < MIN_SAMPLE) {
    return (
      <p className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center text-[13px] font-semibold text-mist-400">
        За последние {PERIOD} дней только {moods.length} записей. Собери чуть больше (минимум {MIN_SAMPLE}), и здесь появятся паттерны.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-[12px] font-semibold text-mist-500">
        Последние {PERIOD} дней · {moods.length} записей · базовый уровень {baseline.toFixed(1)}
      </p>

      {/* -------- по дням недели -------- */}
      <section className="card p-4">
        <h3 className="font-display text-[14px] font-bold text-mist-50">Настроение по дням недели</h3>
        <div className="mt-3 flex items-end justify-between gap-2" role="img" aria-label={wdAlt}>
          {wdStats.map((s) => (
            <div key={s.weekday} className="flex flex-1 flex-col items-center gap-1.5">
              <span className={`text-[11px] font-bold ${s.count ? moodTone(s.median) : "text-mist-600"}`}>
                {s.count ? s.median.toFixed(1) : "·"}
              </span>
              <div
                className="w-full max-w-[34px] rounded-t-md transition-all"
                style={{
                  height: s.count ? `${(s.median / 5) * 72}px` : "3px",
                  background: s.count ? "linear-gradient(180deg,#9D7BFF,#6C7BFF)" : "rgba(255,255,255,0.06)",
                }}
              />
              <span className="text-[10px] font-extrabold text-mist-500">{WD_SHORT[s.weekday]}</span>
              <span className="text-[9px] font-semibold text-mist-600">{s.count ? `${s.count} зап.` : ""}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-white/5 pt-2.5 text-[12px] leading-relaxed text-mist-400">{wdAlt}</p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {/* -------- теги -------- */}
        <section className="card p-4">
          <h3 className="font-display text-[14px] font-bold text-mist-50">Связи с тегами</h3>
          {tagStats.length === 0 ? (
            <p className="mt-3 text-[12px] font-semibold text-mist-500">Теги пока не используются.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {tagStats.slice(0, 6).map((t) => (
                <div key={t.tag} className="flex items-center gap-2.5">
                  <span className="chip !text-[10px]">#{t.tag}</span>
                  <div className="h-[6px] flex-1 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full" style={{ width: `${(t.median / 5) * 100}%`, background: "linear-gradient(90deg,#9D7BFF,#37D6C0)" }} />
                  </div>
                  <span className={`w-8 text-right text-[11px] font-bold ${moodTone(t.median)}`}>{t.median.toFixed(1)}</span>
                  <span className="w-10 text-right text-[10px] font-semibold text-mist-600">{t.count} зап.</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* -------- привычки -------- */}
        <section className="card p-4">
          <h3 className="font-display text-[14px] font-bold text-mist-50">Связи с привычками</h3>
          {habitStats.length === 0 ? (
            <p className="mt-3 text-[12px] font-semibold text-mist-500">Привычки не настроены.</p>
          ) : (
            <div className="mt-3 space-y-2.5">
              {habitStats.map((h) => (
                <div key={h.routine.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-mist-200">{h.routine.title}</span>
                    <span className={`text-[11px] font-bold ${h.count ? moodTone(h.median) : "text-mist-600"}`}>
                      {h.count ? h.median.toFixed(1) : "нет данных"}
                    </span>
                  </div>
                  <p className="text-[10px] font-semibold text-mist-600">
                    {h.count ? `в запланированные дни · ${h.count} зап.` : "в запланированные дни записей нет"}
                  </p>
                </div>
              ))}
              <p className="pt-1 text-[10.5px] font-semibold text-mist-600">
                Сравнивается с базовым уровнем {baseline.toFixed(1)}. Выполнение привычек пока не отслеживается — используются запланированные дни.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* -------- фокус и задачи -------- */}
      <section className="card p-4">
        <h3 className="font-display text-[14px] font-bold text-mist-50">Фокус и задачи ↔ настроение</h3>
        {numeric.n < MIN_SAMPLE ? (
          <p className="mt-3 text-[12px] font-semibold text-mist-500">
            Достаточно данных за {numeric.n} из {MIN_SAMPLE} нужных дней — связь пока не показывается.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              { label: "Время фокуса за день", r: numeric.rFocus },
              { label: "Выполненные задачи за день", r: numeric.rTasks },
            ].map((row) => (
              <div key={row.label} className="rounded-xl border border-white/6 bg-white/[0.02] p-3">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-mist-500">{row.label}</div>
                {row.r === null ? (
                  <div className="mt-1.5 text-[13px] font-bold text-mist-400">Связь не выражена</div>
                ) : (
                  <>
                    <div className={`mt-1.5 font-display text-[22px] font-bold ${row.r > 0 ? "text-aqua-300" : "text-bad"}`}>
                      {row.r > 0 ? "+" : ""}
                      {row.r.toFixed(2)}
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-mist-400">
                      {row.r > 0
                        ? `Дни с большим значением фактора сопровождаются более высоким настроением (n = ${numeric.n}).`
                        : `Дни с большим значением фактора сопровождаются более низким настроением (n = ${numeric.n}).`}
                    </p>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 border-t border-white/5 pt-2.5 text-[11px] font-semibold text-mist-600">
          Это наблюдения о связи, а не о причине. r — коэффициент Пирсона по дневным парам за {PERIOD} дней.
        </p>
      </section>
    </div>
  );
}
