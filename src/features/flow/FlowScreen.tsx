/* ============================================================
 * Flow Sessions — адаптивный фокус-таймер.
 * rAF-прогресс (без ре-рендеров), Web Audio ambient-микшер (1–3 слоя),
 * YouTube-плейлист, skip break / extend, колокольчик + вибрация,
 * «дыхание» на перерывах, fullscreen, статистика в focus_sessions.
 * ============================================================ */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I, iconOf } from "../../components/icons";
import { useApp } from "../../state/store";
import { ambient, AMBIENTS, AmbientId, MAX_LAYERS } from "./audio";
import { addDaysKey, fmtDur, todayKey } from "../../lib/time";
import type { FlowPreset, FlowType } from "../../lib/types";

export const FLOW_PRESETS: FlowPreset[] = [
  { type: "deep", label: "Deep Work", desc: "глубокая работа", focusMin: 50, breakMin: 10 },
  { type: "creative", label: "Creative", desc: "творческий фокус", focusMin: 25, breakMin: 5 },
  { type: "light", label: "Light", desc: "лёгкие задачи", focusMin: 15, breakMin: 3 },
  { type: "rest", label: "Rest", desc: "восстановление", focusMin: 5, breakMin: 0 },
];

type Phase = "idle" | "focus" | "break" | "done";

/* ---------- YouTube ---------- */
function parseYouTube(url: string): { kind: "video" | "playlist"; id: string } | null {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.replace("www.", "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id ? { kind: "video", id } : null;
    }
    if (host.endsWith("youtube.com")) {
      const list = u.searchParams.get("list");
      if (u.pathname === "/playlist" && list) return { kind: "playlist", id: list };
      const v = u.searchParams.get("v");
      if (u.pathname === "/watch") {
        if (list) return { kind: "playlist", id: list };
        if (v) return { kind: "video", id: v };
      }
      if (u.pathname.startsWith("/embed/")) return { kind: "video", id: u.pathname.split("/")[2] };
    }
    return null;
  } catch {
    return null;
  }
}

const RING_R = 118;
const RING_C = 2 * Math.PI * RING_R;

export default function FlowScreen() {
  const app = useApp();
  const [type, setType] = useState<FlowType>("deep");
  const [phase, setPhase] = useState<Phase>("idle");
  const [paused, setPaused] = useState(false);
  const [full, setFull] = useState(false);
  const [volumes, setVolumes] = useState<Record<AmbientId, number>>({
    rain: 0.5, cafe: 0.45, library: 0.5, white_noise: 0.3, forest: 0.5, waves: 0.55,
  });
  const [activeSounds, setActiveSounds] = useState<AmbientId[]>([]);
  const [ytUrl, setYtUrl] = useState("");
  const [ytError, setYtError] = useState(false);
  const [tickUi, setTickUi] = useState(0);

  const preset = FLOW_PRESETS.find((p) => p.type === type)!;

  /* ---------- таймер (refs + rAF, без ре-рендеров) ---------- */
  const phaseEndRef = useRef(0);
  const phaseTotalRef = useRef(1);
  const pausedRef = useRef(false);
  const pauseLeftRef = useRef(0);
  const accRef = useRef({ focusSec: 0, breakSec: 0, cycles: 0, lastTick: 0, startedAt: "" });
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  pausedRef.current = paused;

  const ringRef = useRef<SVGCircleElement>(null);
  const timeRef = useRef<HTMLDivElement>(null);
  const subRef = useRef<HTMLDivElement>(null);

  const presetRef = useRef(preset);
  presetRef.current = preset;
  const typeRef = useRef(type);
  typeRef.current = type;

  const fmtLeft = (sec: number) => {
    const s = Math.max(0, Math.ceil(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
      : `${m}:${String(ss).padStart(2, "0")}`;
  };

  const paint = useCallback(() => {
    const left = phaseEndRef.current - performance.now();
    const frac = Math.max(0, Math.min(1, left / phaseTotalRef.current));
    if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_C * (1 - frac));
    if (timeRef.current) timeRef.current.textContent = fmtLeft(left / 1000);
  }, []);

  const saveSession = useCallback((completed: boolean) => {
    const a = accRef.current;
    if (!a.startedAt || (a.focusSec < 30 && a.breakSec < 30)) return;
    app.logFocusSession({
      startedAt: a.startedAt,
      type: typeRef.current,
      plannedFocusMin: presetRef.current.focusMin,
      plannedBreakMin: presetRef.current.breakMin,
      focusMin: Math.round(a.focusSec / 60),
      breakMin: Math.round(a.breakSec / 60),
      cycles: a.cycles,
      completed,
      sounds: [...activeSoundsRef.current],
    });
  }, [app]);

  /* activeSounds в ref для cleanup-сохранения */
  const activeSoundsRef = useRef<AmbientId[]>([]);
  activeSoundsRef.current = activeSounds;

  const stopAll = useCallback((completed: boolean, silent = false) => {
    const focusMin = Math.round(accRef.current.focusSec / 60);
    const cycles = accRef.current.cycles;
    saveSession(completed);
    accRef.current = { focusSec: 0, breakSec: 0, cycles: 0, lastTick: 0, startedAt: "" };
    setPhase("idle");
    setPaused(false);
    ambient.stopAll();
    setActiveSounds([]);
    if (!silent) {
      ambient.bell("end");
      ambient.haptic();
      app.toast("success", focusMin > 0 ? `Сессия сохранена: ${fmtDur(focusMin)} фокуса, ${cycles} ${cycles === 1 ? "цикл" : "цикла(ов)"}` : "Сессия сохранена");
    }
  }, [app, saveSession]);

  /* фаза завершена — переход дальше */
  const advance = useCallback(() => {
    const p = presetRef.current;
    const cur = phaseRef.current;
    if (cur === "focus") {
      accRef.current.cycles += 1;
      if (p.breakMin === 0) {
        stopAll(true);
        app.toast("success", `Rest-сессия завершена — ${p.focusMin} мин восстановления`);
        return;
      }
      ambient.bell("phase");
      ambient.haptic([40, 30, 40]);
      phaseTotalRef.current = p.breakMin * 60 * 1000;
      phaseEndRef.current = performance.now() + phaseTotalRef.current;
      setPhase("break");
    } else if (cur === "break") {
      ambient.bell("phase");
      phaseTotalRef.current = p.focusMin * 60 * 1000;
      phaseEndRef.current = performance.now() + phaseTotalRef.current;
      setPhase("focus");
    }
  }, [app, stopAll]);

  const advanceRef = useRef(advance);
  advanceRef.current = advance;

  /* ---------- rAF-цикл ---------- */
  useEffect(() => {
    if (phase !== "focus" && phase !== "break") return;
    let raf = 0;
    accRef.current.lastTick = performance.now();
    const loop = () => {
      const now = performance.now();
      if (!pausedRef.current) {
        const dt = (now - accRef.current.lastTick) / 1000;
        if (phaseRef.current === "focus") accRef.current.focusSec += dt;
        else accRef.current.breakSec += dt;
      }
      accRef.current.lastTick = now;
      const left = phaseEndRef.current - now;
      if (left <= 0) {
        advanceRef.current();
        return;
      }
      paint();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, paint]);

  /* сохранить незавершённую сессию при уходе с экрана */
  const saveRef = useRef(saveSession);
  saveRef.current = saveSession;
  useEffect(() => () => {
    if (phaseRef.current === "focus" || phaseRef.current === "break") {
      saveRef.current(false);
      ambient.stopAll();
    }
  }, []);

  /* ---------- управление ---------- */
  const start = () => {
    accRef.current = { focusSec: 0, breakSec: 0, cycles: 0, lastTick: 0, startedAt: new Date().toISOString() };
    phaseTotalRef.current = preset.focusMin * 60 * 1000;
    phaseEndRef.current = performance.now() + phaseTotalRef.current;
    setPaused(false);
    setPhase("focus");
    activeSounds.forEach((id) => ambient.start(id, volumes[id]));
    if (activeSounds.length) app.toast("info", `${activeSounds.length} ${activeSounds.length === 1 ? "звук" : "звука"} в микшере`);
    ambient.bell("phase");
  };

  const togglePause = () => {
    if (!paused) {
      pauseLeftRef.current = phaseEndRef.current - performance.now();
      setPaused(true);
    } else {
      phaseEndRef.current = performance.now() + pauseLeftRef.current;
      setPaused(false);
    }
  };

  const extend = () => {
    phaseEndRef.current += 10 * 60 * 1000;
    phaseTotalRef.current += 10 * 60 * 1000;
    paint();
    app.toast("info", "+10 минут к фазе");
  };

  const skipBreak = () => {
    phaseEndRef.current = performance.now();
  };

  const toggleSound = (id: AmbientId) => {
    if (activeSounds.includes(id)) {
      ambient.stop(id);
      setActiveSounds(activeSounds.filter((x) => x !== id));
    } else {
      if (activeSounds.length >= MAX_LAYERS) {
        app.toast("error", `Максимум ${MAX_LAYERS} звука одновременно`);
        return;
      }
      if (phase === "focus" || phase === "break") ambient.start(id, volumes[id]);
      setActiveSounds([...activeSounds, id]);
    }
  };

  const setVol = (id: AmbientId, v: number) => {
    setVolumes((s) => ({ ...s, [id]: v }));
    ambient.setVolume(id, v);
  };

  /* ---------- статистика ---------- */
  const stats = useMemo(() => {
    const today = todayKey();
    const todays = app.focusSessions.filter((x) => x.date === today);
    const week = app.focusSessions.filter((x) => x.date >= addDaysKey(today, -6));
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDaysKey(today, -(6 - i));
      return week.filter((x) => x.date === d).reduce((a, x) => a + x.focusMin, 0);
    });
    return {
      todayCount: todays.length,
      todayFocus: todays.reduce((a, x) => a + x.focusMin, 0),
      weekFocus: week.reduce((a, x) => a + x.focusMin, 0),
      days,
    };
  }, [app.focusSessions, tickUi]);

  useEffect(() => {
    const t = window.setInterval(() => setTickUi((x) => x + 1), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const yt = ytUrl.trim() ? parseYouTube(ytUrl) : null;

  /* ---------- render ---------- */
  const phaseLabel =
    phase === "focus" ? preset.label : phase === "break" ? "Перерыв" : phase === "done" ? "Готово" : "Готов к фокусу";
  const phaseColor = phase === "break" ? "#37D6C0" : "#9D7BFF";
  const maxDay = Math.max(1, ...stats.days);

  const timerCard = (
    <section className={`card relative overflow-hidden p-6 sm:p-8 ${full ? "flex min-h-[70vh] flex-col items-center justify-center" : ""}`}>
      <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full blur-3xl" style={{ background: `${phaseColor}14` }} />
      <div className="pointer-events-none absolute -bottom-16 -right-16 h-56 w-56 rounded-full blur-3xl" style={{ background: "#6C7BFF12" }} />

      <div className="relative flex flex-col items-center">
        <div className="flex items-center gap-2.5">
          <span
            className={`chip !border-transparent !text-[10.5px]`}
            style={{ color: phaseColor, background: `${phaseColor}1c` }}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${phase === "idle" ? "bg-mist-500" : "now-dot"}`} style={phase !== "idle" ? { background: phaseColor } : undefined} />
            {phase === "idle" ? "ожидание" : paused ? "пауза" : phase === "break" ? "дыхание" : "в потоке"}
          </span>
          <span className="font-display text-[13px] font-bold uppercase tracking-[0.12em] text-mist-400">{phaseLabel}</span>
          <button className="iconbtn" onClick={() => setFull(!full)} aria-label="Во весь экран" title="Fullscreen (Esc)">
            <I n={full ? "minus" : "external"} size={14} />
          </button>
        </div>

        {/* кольцо */}
        <div className={`relative mt-6 ${phase === "break" && !paused ? "anim-breath" : ""}`}>
          <svg width={268} height={268} className="-rotate-90">
            <circle cx={134} cy={134} r={RING_R} stroke="rgba(255,255,255,0.06)" strokeWidth={9} fill="none" />
            <circle
              ref={ringRef}
              cx={134} cy={134} r={RING_R}
              stroke="url(#flow-grad)" strokeWidth={9} strokeLinecap="round" fill="none"
              strokeDasharray={RING_C} strokeDashoffset={phase === "idle" ? 0 : RING_C}
              style={{ transition: "stroke-dashoffset 0.2s linear" }}
            />
            <defs>
              <linearGradient id="flow-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#9D7BFF" />
                <stop offset="0.55" stopColor="#6C7BFF" />
                <stop offset="1" stopColor="#37D6C0" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div ref={timeRef} className="font-display text-[52px] font-bold leading-none tracking-tight text-mist-50 tabular-nums">
              {phase === "idle" ? `${preset.focusMin}:00` : fmtLeft((phaseTotalRef.current) / 1000)}
            </div>
            <div ref={subRef} className="mt-2 text-[11.5px] font-bold text-mist-500">
              {phase === "break" ? "вдох… выдох…" : `${preset.focusMin}/${preset.breakMin} мин · циклов: ${accRef.current.cycles}`}
            </div>
          </div>
        </div>

        {/* контролы */}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
          {phase === "idle" ? (
            <button className="btn btn-primary !px-7 !py-2.5 !text-[14.5px]" onClick={start}>
              <I n="play" size={16} /> Начать сессию
            </button>
          ) : (
            <>
              <button className="btn btn-ghost" onClick={togglePause}>
                <I n={paused ? "play" : "minus"} size={14} /> {paused ? "Продолжить" : "Пауза"}
              </button>
              {phase === "focus" && (
                <button className="btn btn-soft" onClick={extend}>
                  <I n="clock" size={14} /> +10 мин
                </button>
              )}
              {phase === "break" && (
                <button className="btn btn-aqua" onClick={skipBreak}>
                  <I n="arrowRight" size={14} /> Пропустить перерыв
                </button>
              )}
              <button className="btn btn-danger" onClick={() => stopAll(false)}>
                <I n="check" size={14} /> Завершить
              </button>
            </>
          )}
        </div>

        {phase === "idle" && (
          <p className="mt-4 text-center text-[11.5px] font-semibold text-mist-500">
            {type === "rest" ? "Одна фаза восстановления, затем сессия сохранится" : "Фокус и перерывы чередуются автоматически"}
          </p>
        )}
      </div>
    </section>
  );

  return (
    <div className={full ? "fixed inset-0 z-[60] overflow-y-auto bg-ink-950/98 p-4 backdrop-blur-xl sm:p-8" : ""}>
      <div className={full ? "mx-auto flex max-w-[560px] flex-col gap-5" : "mx-auto grid max-w-[1060px] gap-5 lg:grid-cols-[minmax(0,1fr)_360px]"}>
        <div className={full ? "" : "anim-rise"}>{timerCard}</div>

        <div className={`space-y-5 ${full ? "" : "anim-rise d-1"}`}>
          {/* пресеты */}
          <section className="card p-4">
            <span className="label">Тип сессии</span>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {FLOW_PRESETS.map((p) => (
                <button
                  key={p.type}
                  disabled={phase !== "idle"}
                  onClick={() => setType(p.type)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-50 ${
                    type === p.type
                      ? "border-vio-400/45 bg-vio-400/10"
                      : "border-white/7 bg-white/[0.02] hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`font-display text-[13px] font-bold ${type === p.type ? "text-vio-300" : "text-mist-100"}`}>{p.label}</span>
                    <span className="font-display text-[11px] font-bold text-mist-500">{p.focusMin}/{p.breakMin || "—"}</span>
                  </div>
                  <div className="text-[10.5px] font-semibold text-mist-500">{p.desc}</div>
                </button>
              ))}
            </div>
          </section>

          {/* микшер */}
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <span className="label !mb-0">Ambient-микшер</span>
              <span className="chip">{activeSounds.length}/{MAX_LAYERS}</span>
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5">
              {AMBIENTS.map((a) => {
                const on = activeSounds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleSound(a.id)}
                    title={a.desc}
                    className={`flex flex-col items-center gap-1 rounded-xl border px-1 py-2.5 transition ${
                      on
                        ? "border-aqua-400/40 bg-aqua-400/[0.08] text-aqua-300"
                        : "border-white/7 bg-white/[0.02] text-mist-400 hover:border-white/15 hover:text-mist-200"
                    }`}
                  >
                    <I n={a.icon} size={16} />
                    <span className="text-[10px] font-bold">{a.label}</span>
                  </button>
                );
              })}
            </div>
            {activeSounds.length > 0 && (
              <div className="anim-rise mt-3 space-y-2.5 border-t border-white/6 pt-3">
                {activeSounds.map((id) => {
                  const meta = AMBIENTS.find((a) => a.id === id)!;
                  return (
                    <div key={id} className="flex items-center gap-2.5">
                      <I n={meta.icon} size={13} className="w-4 text-aqua-300" />
                      <span className="w-20 text-[11.5px] font-bold text-mist-300">{meta.label}</span>
                      <input
                        type="range" min={0} max={1} step={0.05}
                        value={volumes[id]}
                        onChange={(e) => setVol(id, Number(e.target.value))}
                        className="flex-1 accent-[#37D6C0]"
                        aria-label={`Громкость: ${meta.label}`}
                      />
                      <span className="w-8 text-right font-display text-[10.5px] font-bold text-mist-500">{Math.round(volumes[id] * 100)}%</span>
                    </div>
                  );
                })}
                <p className="text-[10px] font-semibold text-mist-500">Звук синтезируется Web Audio API и стартует с началом сессии</p>
              </div>
            )}
          </section>

          {/* музыка */}
          <section className="card p-4">
            <span className="label">YouTube-плейлист</span>
            <div className="flex gap-1.5">
              <input
                className={`input !py-2 !text-[12px] ${ytError ? "err" : ""}`}
                placeholder="https://youtube.com/playlist?list=…"
                value={ytUrl}
                onChange={(e) => { setYtUrl(e.target.value); setYtError(false); }}
                onBlur={() => setYtError(ytUrl.trim() !== "" && !yt)}
              />
              {ytUrl && (
                <button className="btn btn-ghost !px-2.5" onClick={() => { setYtUrl(""); setYtError(false); }} aria-label="Убрать плейлист">
                  <I n="x" size={13} />
                </button>
              )}
            </div>
            {ytError && <p className="mt-1.5 text-[11.5px] font-semibold text-bad">Не похоже на ссылку YouTube — проверь URL</p>}
            {yt && (
              <div className="anim-rise mt-3 overflow-hidden rounded-xl border border-white/8">
                <iframe
                  title="YouTube-плейлист для фокуса"
                  className="aspect-video w-full"
                  src={`https://www.youtube-nocookie.com/embed/${yt.kind === "playlist" ? `videoseries?list=${yt.id}` : yt.id}`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            )}
          </section>

          {/* статистика */}
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <span className="label !mb-0">Фокус-статистика</span>
              <span className="chip !text-aqua-300 !border-aqua-400/25 !bg-aqua-400/10">{fmtDur(stats.weekFocus)} / 7 дн</span>
            </div>
            <div className="mt-3 flex items-end gap-3">
              <div>
                <div className="font-display text-[26px] font-bold leading-none text-mist-50">{fmtDur(stats.todayFocus)}</div>
                <div className="mt-1 text-[10.5px] font-bold uppercase tracking-wider text-mist-500">сегодня · {stats.todayCount} сессий</div>
              </div>
              <div className="ml-auto flex h-12 items-end gap-1">
                {stats.days.map((m, i) => (
                  <div key={i} className="flex flex-col items-center gap-1" title={`${fmtDur(m)} фокуса`}>
                    <div
                      className="w-3.5 rounded-t-sm transition-all duration-500"
                      style={{
                        height: `${Math.max(6, (m / maxDay) * 40)}px`,
                        background: i === 6 ? "linear-gradient(180deg,#37D6C0,#6C7BFF)" : "rgba(108,123,255,0.35)",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
