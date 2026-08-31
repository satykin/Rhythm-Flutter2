import React, { useEffect, useRef, useState } from "react";
import { I } from "./icons";
import { Bar } from "./ui";
import { useApp } from "../state/store";
import { initials } from "../lib/palette";
import { plural } from "../lib/time";

type FriendStatus = "deep" | "free" | "rest" | "offline";

interface Friend {
  name: string;
  status: FriendStatus;
  note: string;
  color: string;
}

const FRIENDS: Friend[] = [
  { name: "Мария К.", status: "deep", note: "Deep Work до 16:00 · не беспокоить", color: "#9D7BFF" },
  { name: "Дэн Л.", status: "free", note: "Свободен для sync-сессии", color: "#37D6C0" },
  { name: "Саша В.", status: "rest", note: "Обеденный перерыв", color: "#F0B45A" },
  { name: "Тимур Н.", status: "deep", note: "Пишет код · в потоке", color: "#6C7BFF" },
  { name: "Лена П.", status: "offline", note: "Была 2 ч назад", color: "#8792AC" },
];

const STATUS_META: Record<FriendStatus, { label: string; dot: string; text: string }> = {
  deep: { label: "Deep Work", dot: "bg-vio-400", text: "text-vio-300" },
  free: { label: "Доступен", dot: "bg-aqua-400 now-dot", text: "text-aqua-300" },
  rest: { label: "Отдых", dot: "bg-warn", text: "text-warn" },
  offline: { label: "Оффлайн", dot: "bg-ink-500", text: "text-mist-500" },
};

export default function TogetherScreen() {
  const app = useApp();
  const [session, setSession] = useState<{ startedAt: number; joined: string[] } | null>(null);
  const [, tick] = useState(0);
  const joinTimer = useRef<number[]>([]);

  useEffect(() => {
    if (!session) return;
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [session]);

  useEffect(() => () => joinTimer.current.forEach(clearTimeout), []);

  const elapsed = session ? Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)) : 0;

  const startSession = () => {
    setSession({ startedAt: Date.now(), joined: [app.user!.name] });
    joinTimer.current.push(
      window.setTimeout(() => {
        setSession((s) => (s ? { ...s, joined: [...s.joined, "Дэн Л."] } : s));
        app.toast("info", "Дэн Л. присоединился к sync-сессии");
      }, 2600),
      window.setTimeout(() => {
        setSession((s) => (s ? { ...s, joined: [...s.joined, "Мария К."] } : s));
        app.toast("info", "Мария К. присоединилась к sync-сессии");
      }, 6400)
    );
    app.toast("success", "Sync-сессия запущена — фокусируемся вместе");
  };

  const endSession = () => {
    const min = Math.max(1, Math.round(elapsed / 60));
    app.toast("success", `Sync-сессия завершена: ${min} ${plural(min, "минута", "минуты", "минут")} совместного фокуса. +${min * 5} XP`);
    setSession(null);
  };

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const habits = [
    { title: "Утренняя зарядка · 4 участника", prog: 62, c: "linear-gradient(90deg,#F0B45A,#F2687C)" },
    { title: "2 л воды · 6 участников", prog: 38, c: "linear-gradient(90deg,#5AB8F2,#37D6C0)" },
    { title: "Чтение 20 мин · 3 участника", prog: 81, c: "linear-gradient(90deg,#9D7BFF,#6C7BFF)" },
  ];

  return (
    <div className="mx-auto grid max-w-[980px] gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        {/* -------- sync-сессия -------- */}
        <section className="anim-rise card relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full bg-vio-400/12 blur-3xl" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-[17px] font-bold tracking-tight text-mist-50">Sync-сессия</h2>
              <p className="mt-0.5 text-[12.5px] text-mist-400">Фокусируйтесь вместе в реальном времени</p>
            </div>
            {session ? (
              <span className="chip !border-vio-400/30 !bg-vio-400/10 !text-vio-300">
                <span className="h-1.5 w-1.5 rounded-full bg-vio-400 now-dot" /> в эфире
              </span>
            ) : (
              <span className="chip">не запущена</span>
            )}
          </div>

          {!session ? (
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <button className="btn btn-primary" onClick={startSession}>
                <I n="play" size={15} /> Начать sync-сессию
              </button>
              <p className="text-[11.5px] text-mist-500">Друзья со статусом «Доступен» получат приглашение</p>
            </div>
          ) : (
            <div className="anim-rise mt-5">
              <div className="flex flex-wrap items-center gap-5">
                <div className="font-display text-[38px] font-bold leading-none tracking-tight text-mist-50 tabular-nums">{fmt(elapsed)}</div>
                <div className="flex -space-x-2.5">
                  {session.joined.map((j, i) => (
                    <div
                      key={j}
                      className="anim-pop flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink-850 text-[11px] font-extrabold text-white"
                      style={{ background: `linear-gradient(120deg, ${FRIENDS[i % FRIENDS.length].color}, #6C7BFF)`, animationDelay: `${i * 0.1}s` }}
                      title={j}
                    >
                      {initials(j)}
                    </div>
                  ))}
                </div>
                <div className="ml-auto flex gap-2">
                  <button className="btn btn-danger !py-2 !text-[12.5px]" onClick={endSession}>
                    <I n="x" size={14} /> Завершить
                  </button>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 text-[11.5px] font-semibold text-mist-500">
                <I n="users" size={13} className="text-vio-300" />
                {session.joined.length} {plural(session.joined.length, "участник", "участника", "участников")} · статусы скрыты, виден только фокус
              </div>
            </div>
          )}
        </section>

        {/* -------- друзья -------- */}
        <section className="anim-rise d-1 card p-5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Карта активности</h3>
          <p className="mt-0.5 text-[12px] text-mist-400">Только статусы — без деталей расписания. Приватность прежде всего.</p>
          <div className="mt-4 space-y-2">
            {FRIENDS.map((f, i) => {
              const meta = STATUS_META[f.status];
              const canInvite = f.status === "free" && !session;
              return (
                <div key={f.name} className={`anim-rise d-${Math.min(i + 1, 6)} flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3.5 py-2.5 transition hover:bg-white/[0.045]`}>
                  <div className="relative">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-extrabold text-white" style={{ background: `linear-gradient(120deg, ${f.color}, #6C7BFF)` }}>
                      {initials(f.name)}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-ink-850 ${meta.dot}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-bold text-mist-100">{f.name}</span>
                      <span className={`text-[10px] font-extrabold uppercase tracking-wider ${meta.text}`}>{meta.label}</span>
                    </div>
                    <div className="truncate text-[11.5px] text-mist-500">{f.note}</div>
                  </div>
                  {canInvite && (
                    <button className="btn btn-aqua !px-2.5 !py-1 !text-[11px]" onClick={() => app.toast("success", `Приглашение отправлено: ${f.name}`)}>
                      <I n="plus" size={11} sw={2.6} /> позвать
                    </button>
                  )}
                  {f.status === "deep" && (
                    <span className="chip !text-[9.5px]" title="Не беспокоить">
                      <I n="lock" size={9} /> DND
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* -------- групповые привычки -------- */}
      <aside className="space-y-4">
        <section className="anim-rise d-2 card p-5">
          <h3 className="font-display text-[15px] font-bold tracking-tight text-mist-50">Групповые привычки</h3>
          <p className="mt-0.5 text-[12px] text-mist-400">Прогресс команды на этой неделе</p>
          <div className="mt-4 space-y-4">
            {habits.map((h) => (
              <div key={h.title}>
                <div className="mb-1.5 flex justify-between text-[11.5px] font-bold">
                  <span className="text-mist-300">{h.title}</span>
                  <span className="font-display text-mist-100">{h.prog}%</span>
                </div>
                <Bar value={h.prog} color={h.c} />
              </div>
            ))}
          </div>
        </section>

        <section className="anim-rise d-3 card p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ind-400/12 text-ind-400">
              <I n="info" size={14} />
            </span>
            <span className="label !mb-0">Демо-режим</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-mist-400">
            Друзья симулируются локально. В проде — Supabase Realtime: presence-статусы,
            общие блоки времени и live-сессии без опросов сервера.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="chip">presence</span>
            <span className="chip">realtime</span>
            <span className="chip">групповые челленджи</span>
          </div>
        </section>
      </aside>
    </div>
  );
}
