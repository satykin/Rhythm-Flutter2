import React, { useMemo } from "react";
import { I, IconName } from "./icons";
import { Bar } from "./ui";
import { useApp } from "../state/store";
import { addDaysKey, plural, todayKey, weekdayIdx } from "../lib/time";
import { initials } from "../lib/palette";

const XP_PER_TASK = 25;

export default function CharacterScreen() {
  const app = useApp();
  const user = app.user!;

  const stats = useMemo(() => {
    const done = app.tasks.filter((t) => t.status === "done");
    const last7 = app.moods.filter((m) => m.date >= addDaysKey(todayKey(), -6));
    const avgMood = last7.length ? last7.reduce((a, m) => a + m.mood, 0) / last7.length : 3;

    const highDone = done.filter((t) => t.energy === "high").length;
    const restDone = done.filter((t) => t.tags.some((x) => ["отдых", "здоровье"].includes(x))).length;
    const byDay = new Map<string, number>();
    done.forEach((t) => byDay.set(t.date, (byDay.get(t.date) ?? 0) + 1));
    const growthDays = [...byDay.values()].filter((n) => n >= 3).length;

    /* streak: подряд идущие дни с выполненными задачами */
    let streak = 0;
    let d = todayKey();
    if (!byDay.has(d)) d = addDaysKey(d, -1);
    while (byDay.has(d)) {
      streak++;
      d = addDaysKey(d, -1);
    }

    const xp = done.length * XP_PER_TASK + app.moods.length * 5;
    const level = Math.floor(Math.sqrt(xp / 60)) + 1;
    const curBase = 60 * (level - 1) ** 2;
    const nextBase = 60 * level ** 2;
    const progress = (xp - curBase) / (nextBase - curBase);

    return {
      xp, level, progress, streak, doneCount: done.length,
      focus: Math.min(100, highDone * 9),
      energy: Math.round(avgMood * 20),
      balance: Math.min(100, restDone * 8),
      growth: Math.min(100, growthDays * 12),
      focusHours: Math.round(done.reduce((a, t) => a + (t.endMin - t.startMin), 0) / 60),
    };
  }, [app.tasks, app.moods]);

  const achievements = useMemo(() => {
    const done = app.tasks.filter((t) => t.status === "done");
    const early = done.some((t) => t.endMin <= 9 * 60);
    const deep = done.filter((t) => t.energy === "high").length;
    const list: { icon: IconName; title: string; desc: string; ok: boolean; prog: string }[] = [
      { icon: "spark", title: "Первый шаг", desc: "Выполни первую задачу", ok: stats.doneCount >= 1, prog: `${Math.min(1, stats.doneCount)}/1` },
      { icon: "target", title: "Десятка", desc: "10 выполненных задач", ok: stats.doneCount >= 10, prog: `${Math.min(10, stats.doneCount)}/10` },
      { icon: "flame", title: "В ритме", desc: "Серия 5 дней подряд", ok: stats.streak >= 5, prog: `${Math.min(5, stats.streak)}/5` },
      { icon: "sun", title: "Ранняя пташка", desc: "Задача закрыта до 09:00", ok: early, prog: early ? "1/1" : "0/1" },
      { icon: "bolt", title: "Глубокий фокус", desc: "15 задач с high-энергией", ok: deep >= 15, prog: `${Math.min(15, deep)}/15` },
      { icon: "heart", title: "Баланс", desc: "10 задач отдыха и здоровья", ok: stats.balance >= 80, prog: `${Math.min(10, Math.round(stats.balance / 8))}/10` },
      { icon: "users", title: "Вместе", desc: "Проведи sync-сессию", ok: false, prog: "0/1" },
      { icon: "chart", title: "Аналитик", desc: "Неделя с 20+ задачами", ok: false, prog: `${Math.min(20, stats.doneCount)}/20` },
    ];
    return list;
  }, [app.tasks, stats]);

  const weekTasks = useMemo(() => {
    const monday = addDaysKey(todayKey(), -weekdayIdx(todayKey()));
    return app.tasks.filter((t) => t.date >= monday && t.status === "done").length;
  }, [app.tasks]);

  const statRows: { label: string; v: number; icon: IconName; color: string }[] = [
    { label: "Focus", v: stats.focus, icon: "target", color: "linear-gradient(90deg,#9D7BFF,#6C7BFF)" },
    { label: "Energy", v: stats.energy, icon: "bolt", color: "linear-gradient(90deg,#F0B45A,#F2687C)" },
    { label: "Balance", v: stats.balance, icon: "heart", color: "linear-gradient(90deg,#37D6C0,#8FD07E)" },
    { label: "Growth", v: stats.growth, icon: "spark", color: "linear-gradient(90deg,#6C7BFF,#5AB8F2)" },
  ];

  return (
    <div className="mx-auto grid max-w-[980px] gap-5 lg:grid-cols-[340px_1fr]">
      {/* -------- аватар -------- */}
      <section className="anim-rise card relative overflow-hidden p-6 text-center">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-vio-400/12 to-transparent" />
        <div className="relative mx-auto h-[132px] w-[132px]">
          <div className="absolute inset-0 rounded-full" style={{ background: "conic-gradient(#9D7BFF,#6C7BFF,#37D6C0,#9D7BFF)", animation: "spin360 14s linear infinite", opacity: 0.85 }} />
          <div className="absolute inset-[5px] flex items-center justify-center rounded-full bg-ink-900">
            <div className="grad-brand flex h-[104px] w-[104px] items-center justify-center rounded-full font-display text-[34px] font-bold text-white shadow-2xl">
              {initials(user.name)}
            </div>
          </div>
          <div className="grad-brand absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 font-display text-[12px] font-bold text-white shadow-lg">
            ур. {stats.level}
          </div>
        </div>

        <h2 className="mt-5 font-display text-[19px] font-bold tracking-tight text-mist-50">{user.name}</h2>
        <p className="text-[12px] font-semibold text-mist-500">Life Character · {user.email}</p>

        <div className="mt-4">
          <div className="mb-1.5 flex justify-between text-[11px] font-bold">
            <span className="text-mist-500">{stats.xp} XP</span>
            <span className="text-vio-300">до ур. {stats.level + 1}: {Math.max(0, 60 * stats.level ** 2 - stats.xp)} XP</span>
          </div>
          <Bar value={stats.progress * 100} h={8} />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2">
          {[
            { v: stats.doneCount, l: "задач" },
            { v: stats.streak, l: plural(stats.streak, "день", "дня", "дней") },
            { v: stats.focusHours, l: "ч фокуса" },
          ].map((s, i) => (
            <div key={i} className="rounded-xl border border-white/6 bg-white/[0.02] py-2.5">
              <div className="font-display text-[18px] font-bold text-mist-50">{s.v}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-mist-500">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="space-y-5">
        {/* -------- статы -------- */}
        <section className="anim-rise d-1 card p-5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Статы персонажа</h3>
          <p className="mt-0.5 text-[12px] text-mist-400">Растут от реальных действий: задач, чек-инов, фокуса.</p>
          <div className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {statRows.map((s) => (
              <div key={s.label}>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-mist-300">
                    <I n={s.icon} size={13} /> {s.label}
                  </span>
                  <span className="font-display text-[13px] font-bold text-mist-100">{s.v}</span>
                </div>
                <Bar value={s.v} color={s.color} h={7} />
              </div>
            ))}
          </div>
        </section>

        {/* -------- челлендж -------- */}
        <section className="anim-rise d-2 card flex items-center gap-4 p-5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warn/12 text-warn">
            <I n="flame" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h3 className="font-display text-[14.5px] font-bold text-mist-50">Челлендж недели</h3>
              <span className="chip !text-warn !border-warn/25 !bg-warn/10">+150 XP</span>
            </div>
            <p className="text-[12px] text-mist-400">Выполни 20 задач до воскресенья</p>
            <Bar className="mt-2" value={(weekTasks / 20) * 100} color="linear-gradient(90deg,#F0B45A,#F2687C)" />
          </div>
          <div className="text-right">
            <div className="font-display text-[22px] font-bold text-mist-50">{weekTasks}<span className="text-[13px] text-mist-500">/20</span></div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mist-500">задач</div>
          </div>
        </section>

        {/* -------- ачивки -------- */}
        <section className="anim-rise d-3 card p-5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">
            Достижения <span className="ml-1 text-[12px] font-semibold text-mist-500">{achievements.filter((a) => a.ok).length} из {achievements.length}</span>
          </h3>
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {achievements.map((a) => (
              <div
                key={a.title}
                className={`group rounded-xl border p-3 text-center transition ${
                  a.ok
                    ? "border-aqua-400/25 bg-aqua-400/[0.06] hover:bg-aqua-400/[0.1]"
                    : "border-white/6 bg-white/[0.015] opacity-60 hover:opacity-80"
                }`}
                title={a.desc}
              >
                <div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-xl ${a.ok ? "bg-aqua-400/15 text-aqua-300" : "bg-white/5 text-mist-500"}`}>
                  <I n={a.icon} size={18} />
                </div>
                <div className="mt-2 text-[11.5px] font-extrabold text-mist-100">{a.title}</div>
                <div className="text-[9.5px] font-bold text-mist-500">{a.ok ? "получено" : a.prog}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
