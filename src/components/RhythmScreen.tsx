import React, { useMemo, useRef, useState } from "react";
import { I } from "./icons";
import { Ring } from "./ui";
import { useApp } from "../state/store";
import { bestSlots, dayScore, energyAt, energySeries, restWindows } from "../lib/rhythm";
import { DAY_END, DAY_START, minToHM, todayKey } from "../lib/time";

const W = 720;
const H = 236;
const x = (m: number) => ((m - DAY_START) / (DAY_END - DAY_START)) * W;
const y = (v: number) => H - 14 - (v / 100) * (H - 34);

export default function RhythmScreen({ onPlanSlot }: { onPlanSlot: (start: number, end: number) => void }) {
  const app = useApp();
  const sleep = app.user?.sleepHours ?? 7.5;
  const mood = app.moods.find((m) => m.date === todayKey())?.mood;
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const series = useMemo(() => energySeries(sleep, mood, 10), [sleep, mood]);
  const slots = useMemo(() => bestSlots(sleep, mood), [sleep, mood]);
  const rest = useMemo(() => restWindows(sleep, mood), [sleep, mood]);
  const score = dayScore(sleep, mood);

  const line = series.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.min).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H - 10} L0,${H - 10} Z`;

  const onMove = (e: React.MouseEvent) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect) return;
    const m = DAY_START + ((e.clientX - rect.left) / rect.width) * (DAY_END - DAY_START);
    setHover(Math.round(m / 10) * 10);
  };

  const hv = hover !== null && hover >= DAY_START && hover <= DAY_END ? energyAt(hover, sleep, mood) : null;
  const levelLabel = (v: number) => (v >= 70 ? "высокая" : v >= 45 ? "умеренная" : "низкая");
  const levelColor = (v: number) => (v >= 70 ? "text-aqua-300" : v >= 45 ? "text-mist-200" : "text-warn");

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      {/* -------- прогноз -------- */}
      <section className="anim-rise card p-5">
        <div className="flex flex-wrap items-center gap-5">
          <Ring value={score / 100} size={86} stroke={7}>
            <div className="text-center">
              <div className="font-display text-[21px] font-bold leading-none text-mist-50">{score}</div>
              <div className="mt-0.5 text-[8.5px] font-extrabold uppercase tracking-wider text-mist-500">прогноз</div>
            </div>
          </Ring>
          <div className="min-w-[220px] flex-1">
            <h2 className="font-display text-[17px] font-bold tracking-tight text-mist-50">Кривая энергии на сегодня</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-mist-400">
              Прогноз по циркадному ритму с учётом сна <b className="text-mist-200">{sleep.toFixed(1).replace(".0", "")} ч</b>
              {mood ? <> и настроения <b className="text-mist-200">{mood}/5</b></> : ""}. Подсветка — окна для сложных задач.
            </p>
            <button
              className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-bold text-vio-300 transition hover:text-vio-400"
              onClick={() => app.toast("info", "Сон меняется в настройках (раздел «Сон прошлой ночью»). В Этапе 3 данные придут из HealthKit / Google Fit")}
            >
              <I n="moon" size={13} /> Как уточнить прогноз?
            </button>
          </div>
          <div className="hidden items-center gap-4 text-[11px] font-bold text-mist-500 sm:flex">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-aqua-400/30 ring-1 ring-aqua-400/50" /> пик</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-warn/25 ring-1 ring-warn/45" /> спад</span>
            <span className="flex items-center gap-1.5"><span className="h-[3px] w-4 rounded-full bg-aqua-400" /> энергия</span>
          </div>
        </div>

        {/* -------- график -------- */}
        <div ref={boxRef} className="relative mt-4 cursor-crosshair" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 240 }}>
            <defs>
              <linearGradient id="r-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#9D7BFF" stopOpacity="0.32" />
                <stop offset="0.6" stopColor="#6C7BFF" stopOpacity="0.10" />
                <stop offset="1" stopColor="#37D6C0" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id="r-line" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor="#9D7BFF" />
                <stop offset="0.5" stopColor="#6C7BFF" />
                <stop offset="1" stopColor="#37D6C0" />
              </linearGradient>
            </defs>

            {Array.from({ length: 10 }, (_, i) => DAY_START + i * 120).map((m) => (
              <g key={m}>
                <line x1={x(m)} y1={16} x2={x(m)} y2={H - 10} stroke="rgba(255,255,255,0.05)" />
                <text x={x(m)} y={H - 0.5} textAnchor="middle" fontSize="9.5" fill="#67728C" fontWeight="700" fontFamily="Space Grotesk">
                  {minToHM(m)}
                </text>
              </g>
            ))}

            {slots.map((s, i) => (
              <rect key={`s${i}`} x={x(s.start)} y={16} width={x(s.end) - x(s.start)} height={H - 26} rx="6"
                fill="rgba(55,214,192,0.07)" stroke="rgba(55,214,192,0.35)" strokeDasharray="4 4" />
            ))}
            {rest.map((r, i) => (
              <rect key={`r${i}`} x={x(r.start)} y={16} width={x(r.end) - x(r.start)} height={H - 26} rx="6"
                fill="rgba(240,180,90,0.06)" stroke="rgba(240,180,90,0.3)" strokeDasharray="4 4" />
            ))}

            <path d={area} fill="url(#r-area)" />
            <path d={line} fill="none" stroke="url(#r-line)" strokeWidth="2.4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

            {hover !== null && hv !== null && hover >= DAY_START && hover <= DAY_END && (
              <g>
                <line x1={x(hover)} y1={16} x2={x(hover)} y2={H - 10} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />
                <circle cx={x(hover)} cy={y(hv)} r="4.5" fill="#0C0F16" stroke="#37D6C0" strokeWidth="2.4" />
              </g>
            )}
          </svg>

          {hover !== null && hv !== null && hover >= DAY_START && hover <= DAY_END && (
            <div
              className="anim-fade pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-lg border border-white/10 bg-ink-900/95 px-2.5 py-1.5 shadow-xl"
              style={{ left: `${((hover - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}
            >
              <div className="font-display text-[12px] font-bold text-mist-50">{minToHM(hover)}</div>
              <div className={`text-[10.5px] font-bold ${levelColor(hv)}`}>{hv}% · {levelLabel(hv)}</div>
            </div>
          )}
        </div>
      </section>

      {/* -------- окна -------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map((s, i) => (
          <section key={i} className="anim-rise d-2 card group relative overflow-hidden p-4 transition hover:border-aqua-400/25">
            <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-aqua-400/10 blur-2xl transition group-hover:bg-aqua-400/20" />
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-aqua-400/12 text-aqua-300">
                <I n="bolt" size={14} sw={2.2} />
              </span>
              <span className="label !mb-0">Пик энергии #{i + 1}</span>
            </div>
            <div className="mt-2 font-display text-[21px] font-bold tracking-tight text-mist-50">
              {minToHM(s.start)} – {minToHM(s.end)}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-mist-400">
              Идеально для Deep Work и сложных решений. Энергия до {s.score}%.
            </p>
            <button className="btn btn-aqua mt-3 !px-3 !py-1.5 !text-[11.5px]" onClick={() => onPlanSlot(s.start, s.end)}>
              <I n="plus" size={12} sw={2.6} /> Задача в это окно
            </button>
          </section>
        ))}

        {rest.map((r, i) => (
          <section key={`rest${i}`} className="anim-rise d-3 card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warn/12 text-warn">
                <I n="coffee" size={14} />
              </span>
              <span className="label !mb-0">Окно восстановления</span>
            </div>
            <div className="mt-2 font-display text-[21px] font-bold tracking-tight text-mist-50">
              {minToHM(r.start)} – {minToHM(r.end)}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-mist-400">
              Послеобеденный спад — прогулка или лёгкие задачи вместо force-focus.
            </p>
            <button className="btn btn-ghost mt-3 !px-3 !py-1.5 !text-[11.5px]" onClick={() => onPlanSlot(r.start, r.end)}>
              <I n="plus" size={12} sw={2.6} /> Запланировать отдых
            </button>
          </section>
        ))}

        <section className="anim-rise d-4 card flex flex-col justify-between p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-vio-400/12 text-vio-300">
                <I n="info" size={14} />
              </span>
              <span className="label !mb-0">Как это работает</span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-mist-400">
              Этап 1 использует циркадную модель + твой сон и чек-ины. В Этапе 3 BioSync подключит
              HealthKit / Google Fit — кривая станет персональной.
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="chip">сон</span>
            <span className="chip">настроение</span>
            <span className="chip !text-mist-500">пульс · этап 3</span>
          </div>
        </section>
      </div>
    </div>
  );
}
