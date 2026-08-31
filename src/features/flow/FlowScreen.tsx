/* ============================================================
 * Flow Sessions — адаптивный фокус-таймер Rhythm (UX-спека v1.0).
 *
 * Машина состояний:
 *   SETUP → COUNTDOWN(3s) → FOCUS ⇄ PAUSED
 *   FOCUS → BREAK → (SKIP | авто | «Дальше») → COUNTDOWN → FOCUS
 *   FOCUS/BREAK → COMPLETE · FOCUS →(удержание «Стоп»)→ ABORTED
 *
 * Таймер считается от timestamp (performance.now()), а не от
 * интервалов — фоновый троттлинг вкладок не ломает сессию.
 * ============================================================ */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { I, iconOf, type IconName } from "../../components/icons";
import { Modal } from "../../components/ui";
import { useApp } from "../../state/store";
import { ambient, AMBIENTS, MAX_LAYERS, type AmbientId } from "./audio";
import { clearFlowLink, readFlowLink } from "./flowLink";
import { notify } from "../notify/notify";
import MoodFacePicker from "../mood/presentation/MoodFacePicker";
import { db } from "../../lib/db";
import { energyAt } from "../../lib/rhythm";
import { addDaysKey, clamp, fmtDur, minToHM, nowMin, todayKey } from "../../lib/time";
import type { FlowType, Task } from "../../lib/types";

type Phase = "setup" | "countdown" | "focus" | "paused" | "break" | "complete" | "aborted";

interface Cfg {
  label: string;
  desc: string;
  focusMin: number;
  breakMin: number;
  color: string;
  xp: number;
  icon: IconName;
}

export const FLOW_CFG: Record<FlowType, Cfg> = {
  deep: { label: "Deep Work", desc: "Код, текст, сложные задачи", focusMin: 50, breakMin: 10, color: "#6366F1", xp: 20, icon: "target" },
  creative: { label: "Creative", desc: "Дизайн, брейншторм", focusMin: 25, breakMin: 5, color: "#D946EF", xp: 12, icon: "music" },
  light: { label: "Light", desc: "Почта, рутина", focusMin: 15, breakMin: 3, color: "#2DD4BF", xp: 8, icon: "bolt" },
  rest: { label: "Rest", desc: "Пауза, дыхание, медитация", focusMin: 5, breakMin: 0, color: "#34D399", xp: 4, icon: "moon" },
};
const ORDER: FlowType[] = ["deep", "creative", "light", "rest"];

const MIX_KEY = "rhythm.flowmix.v1";
const ZERO_MIX: Record<AmbientId, number> = { rain: 0, cafe: 0, library: 0, white_noise: 0, forest: 0, waves: 0 };

const BREAK_TIPS = [
  "Выпей воды",
  "Потянись — плечи и шея",
  "Посмотри в окно на дальнее",
  "Разомни кисти и запястья",
  "Сделай 10 глубоких вдохов",
  "Встань и пройдись по комнате",
];

interface SessionResult {
  focusSec: number;
  breakSec: number;
  cycles: number;
  xp: number;
  leftoverSec: number;
}

/* ================= Компонент ================= */

export default function FlowScreen() {
  const app = useApp();
  const reduceMotion = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false),
    []
  );

  /* ---------- smart-предвыбор (спека §9): время дня + энергия + история ---------- */
  const smart = useMemo(() => {
    const today = todayKey();
    const s14 = app.focusSessions.filter((s) => s.date >= addDaysKey(today, -13));
    const hour = new Date().getHours();
    const energy = energyAt(nowMin(), app.user?.sleepHours ?? 7.5, app.moods.find((m) => m.date === today)?.mood);
    const rate = (t: FlowType) => {
      const a = s14.filter((s) => s.type === t);
      return a.length ? a.filter((s) => s.completed).length / a.length : 0.55;
    };
    const score: Record<FlowType, number> = { deep: 0, creative: 0, light: 0, rest: 0 };
    ORDER.forEach((t) => (score[t] += rate(t) * 40));
    if (hour >= 7 && hour < 12) { score.deep += 30; score.creative += 12; }
    else if (hour < 15) { score.light += 24; score.rest += 12; }
    else if (hour < 19) { score.creative += 26; score.deep += 16; }
    else { score.rest += 26; score.light += 14; }
    score.deep += Math.max(0, energy - 55) * 0.5;
    score.rest += Math.max(0, 45 - energy) * 0.6;
    const best = ORDER.slice().sort((a, b) => score[b] - score[a])[0];
    const durs = s14.filter((s) => s.type === best && s.completed && s.focusMin > 0).map((s) => s.focusMin).sort((a, b) => a - b);
    let duration = durs.length ? clamp(Math.round(durs[Math.floor(durs.length / 2)] / 5) * 5, 5, 120) : FLOW_CFG[best].focusMin;
    let advice: string | null = null;
    const aborted = s14.filter((s) => !s.completed).length;
    if (aborted >= 3) {
      const shorter = Math.max(5, Math.round((FLOW_CFG[best].focusMin * 0.7) / 5) * 5);
      if (shorter < duration) {
        duration = shorter;
        advice = `Попробуй ${shorter} мин вместо ${FLOW_CFG[best].focusMin} — так ты завершаешь чаще`;
      }
    }
    const reason =
      energy >= 65 && hour >= 9 && hour < 13
        ? "Сейчас золотое время — энергия на пике"
        : `Подобрано по времени дня, энергии (${Math.round(energy)}%) и истории сессий`;
    return { type: best, duration, advice, reason };
    // считается один раз при входе на экран
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- состояние настройки ---------- */
  const [type, setType] = useState<FlowType>(smart.type);
  const [duration, setDuration] = useState(smart.duration);
  const [blocks, setBlocks] = useState(1);
  const [autoNext, setAutoNext] = useState(false);
  const [linkedTask, setLinkedTask] = useState<Task | null>(() => readFlowLink(app.tasks));
  const [sheet, setSheet] = useState<"none" | "sounds" | "tasks">("none");
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsOn, setControlsOn] = useState(true);
  const [countdown, setCountdown] = useState(3);
  const [moodPicked, setMoodPicked] = useState(false);
  const [taskQuery, setTaskQuery] = useState("");
  const [mix, setMix] = useState<Record<AmbientId, number>>(() => {
    try {
      const raw = localStorage.getItem(MIX_KEY);
      if (raw) return { ...ZERO_MIX, ...(JSON.parse(raw) as Partial<Record<AmbientId, number>>) };
    } catch { /* ignore */ }
    return { ...ZERO_MIX };
  });

  /* ---------- живое состояние ---------- */
  const [phase, setPhaseState] = useState<Phase>("setup");
  const [result, setResult] = useState<SessionResult | null>(null);
  const [pulse, setPulse] = useState(false);
  const [breath, setBreath] = useState<"in" | "out">("in");
  const [xpShown, setXpShown] = useState(0);
  const [, force] = useState(0);

  const phaseRef = useRef<Phase>("setup");
  const setPhase = useCallback((p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  }, []);

  /* зеркала настроек для стабильных колбэков */
  const typeRef = useRef(type); typeRef.current = type;
  const durRef = useRef(duration); durRef.current = duration;
  const blocksRef = useRef(blocks); blocksRef.current = blocks;
  const autoRef = useRef(autoNext); autoRef.current = autoNext;
  const linkedRef = useRef(linkedTask); linkedRef.current = linkedTask;
  const mixRef = useRef(mix); mixRef.current = mix;

  /* тайминги фаз (timestamp-based) */
  const tRef = useRef({ startedAt: 0, plannedMs: 60_000, carriedMs: 0 });
  const blockRef = useRef(1);
  const accRef = useRef({ focusSec: 0, breakSec: 0, cycles: 0 });
  const extRef = useRef(0);
  const halfRef = useRef(false);
  const breakDoneRef = useRef(false);
  const pendingNextRef = useRef(false);
  const startedAtRef = useRef("");
  const abortLeftoverRef = useRef(0);
  /* id записанной focus-сессии — для post-focus чек-ина (Фаза B) */
  const sessionRef = useRef<string | undefined>(undefined);
  const titleRef = useRef(typeof document !== "undefined" ? document.title : "Rhythm");
  const hideT = useRef(0);
  const previewT = useRef<number[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const cfg = FLOW_CFG[type];

  /* ---------- расчёт времени ---------- */
  /* На паузе время заморожено: учитываем только накопленное до паузы. */
  const elapsedMs = () =>
    phaseRef.current === "paused"
      ? tRef.current.carriedMs
      : tRef.current.carriedMs + (performance.now() - tRef.current.startedAt);
  const remainingMs = () => Math.max(0, tRef.current.plannedMs - elapsedMs());
  const fmtLeft = () => {
    const s = Math.ceil(remainingMs() / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  };

  /* ---------- звук ---------- */
  const persistMix = (m: Record<AmbientId, number>) => {
    try { localStorage.setItem(MIX_KEY, JSON.stringify(m)); } catch { /* ignore */ }
  };

  const applyMix = useCallback(() => {
    (Object.keys(mixRef.current) as AmbientId[]).forEach((id) => {
      const v = mixRef.current[id];
      if (v > 0) {
        if (ambient.isPlaying(id)) ambient.setVolume(id, v);
        else ambient.start(id, v);
      } else if (ambient.isPlaying(id)) {
        ambient.stop(id);
      }
    });
  }, []);

  useEffect(() => {
    ambient.duck(muted ? 0 : phase === "paused" ? 0.2 : phase === "break" ? 0.8 : 1);
  }, [phase, muted]);

  /* ---------- запись сессии в focus_sessions ---------- */
  const logSession = useCallback(
    (completed: boolean) => {
      const acc = accRef.current;
      if (acc.focusSec < 60) return; // < 1 минуты — не попадает в статистику (спека §10)
      const session = app.logFocusSession({
        startedAt: startedAtRef.current || new Date().toISOString(),
        type: typeRef.current,
        plannedFocusMin: typeRef.current === "rest" ? FLOW_CFG.rest.focusMin : durRef.current,
        plannedBreakMin: FLOW_CFG[typeRef.current].breakMin,
        focusMin: Math.round((acc.focusSec / 60) * 10) / 10,
        breakMin: Math.round((acc.breakSec / 60) * 10) / 10,
        cycles: acc.cycles,
        completed,
        sounds: ambient.active(),
      });
      sessionRef.current = session.id;
    },
    [app]
  );
  const logRef = useRef(logSession); logRef.current = logSession;

  /* ---------- переходы ---------- */
  const startFocus = useCallback(
    (mins: number) => {
      tRef.current = { startedAt: performance.now(), plannedMs: mins * 60_000, carriedMs: 0 };
      extRef.current = 0;
      halfRef.current = false;
      setPhase("focus");
    },
    [setPhase]
  );

  const startBreak = useCallback(
    (mins: number) => {
      tRef.current = { startedAt: performance.now(), plannedMs: mins * 60_000, carriedMs: 0 };
      breakDoneRef.current = false;
      setBreath("in");
      setPhase("break");
    },
    [setPhase]
  );

  const finishSession = useCallback(() => {
    const acc = accRef.current;
    const c = FLOW_CFG[typeRef.current];
    setResult({ focusSec: acc.focusSec, breakSec: acc.breakSec, cycles: acc.cycles, xp: acc.cycles * c.xp, leftoverSec: 0 });
    logRef.current(true);
    ambient.bell("end");
    ambient.haptic([50, 40, 90]);
    if (typeof document !== "undefined" && document.hidden) {
      notify.fire("Rhythm · Flow", "Сессия фокуса завершена — XP уже начислен", "flow-end");
    }
    window.setTimeout(() => ambient.stopAll(), 900);
    setPhase("complete");
  }, [setPhase]);

  const onFocusEnd = useCallback(() => {
    if (phaseRef.current !== "focus") return;
    const c = FLOW_CFG[typeRef.current];
    accRef.current.focusSec += tRef.current.plannedMs / 1000;
    accRef.current.cycles += 1;
    ambient.bell("phase");
    ambient.haptic([60, 40, 60]);
    if (blockRef.current >= blocksRef.current || c.breakMin === 0) {
      finishSession();
      return;
    }
    startBreak(c.breakMin);
  }, [finishSession, startBreak]);

  const beginCountdown = useCallback(
    (next: boolean) => {
      pendingNextRef.current = next;
      setCountdown(3);
      setPhase("countdown");
    },
    [setPhase]
  );

  const onBreakEnd = useCallback(() => {
    if (phaseRef.current !== "break" || breakDoneRef.current) return;
    breakDoneRef.current = true;
    accRef.current.breakSec += tRef.current.plannedMs / 1000;
    ambient.bell("phase");
    ambient.haptic([60, 40, 60]);
    if (autoRef.current) beginCountdown(true);
  }, [beginCountdown]);

  const skipBreak = useCallback(() => {
    if (phaseRef.current !== "break") return;
    if (!breakDoneRef.current) accRef.current.breakSec += Math.floor(Math.min(elapsedMs(), tRef.current.plannedMs) / 1000);
    breakDoneRef.current = true;
    beginCountdown(true);
  }, [beginCountdown]);

  /* ---------- действия пользователя ---------- */
  const begin = useCallback(() => {
    accRef.current = { focusSec: 0, breakSec: 0, cycles: 0 };
    blockRef.current = 1;
    startedAtRef.current = new Date().toISOString();
    setMoodPicked(false);
    setResult(null);
    applyMix();
    beginCountdown(false);
  }, [applyMix, beginCountdown]);

  const pause = useCallback(() => {
    if (phaseRef.current !== "focus") return;
    tRef.current.carriedMs = elapsedMs();
    ambient.haptic([40]);
    setPhase("paused");
  }, [setPhase]);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    tRef.current.startedAt = performance.now();
    setPhase("focus");
  }, [setPhase]);

  const extend = useCallback(() => {
    if (phaseRef.current !== "focus" && phaseRef.current !== "paused") return;
    if (extRef.current >= 2) {
      app.toast("info", "Максимум 2 продления за сессию");
      return;
    }
    extRef.current += 1;
    tRef.current.plannedMs += 5 * 60_000;
    app.toast("success", "+5 минут к фокусу");
  }, [app]);

  const abort = useCallback(() => {
    const ph = phaseRef.current;
    if (ph !== "focus" && ph !== "paused") return;
    const actualSec = Math.min(Math.floor(elapsedMs() / 1000), Math.round(tRef.current.plannedMs / 1000));
    abortLeftoverRef.current = Math.max(0, Math.round(remainingMs() / 1000));
    accRef.current.focusSec += actualSec;
    const c = FLOW_CFG[typeRef.current];
    const partial = actualSec < 60 ? 0 : Math.floor((c.xp * actualSec) / (durRef.current * 60));
    setResult({
      focusSec: accRef.current.focusSec,
      breakSec: accRef.current.breakSec,
      cycles: accRef.current.cycles,
      xp: accRef.current.cycles * c.xp + partial,
      leftoverSec: abortLeftoverRef.current,
    });
    logRef.current(false);
    ambient.duck(0);
    window.setTimeout(() => ambient.stopAll(), 700);
    setPhase("aborted");
  }, [setPhase]);

  const reenter = useCallback(() => {
    const ms = abortLeftoverRef.current >= 60 ? abortLeftoverRef.current * 1000 : durRef.current * 60_000;
    tRef.current = { startedAt: performance.now(), plannedMs: ms, carriedMs: 0 };
    extRef.current = 0;
    halfRef.current = false;
    applyMix();
    setPhase("focus");
  }, [applyMix, setPhase]);

  /* ---------- тик: rAF (плавность) + интервал (фоновая вкладка) ---------- */
  const tickRef = useRef<() => void>(() => {});
  tickRef.current = () => {
    const ph = phaseRef.current;
    if (ph === "focus") {
      if (remainingMs() <= 0) {
        onFocusEnd();
        return;
      }
      if (!halfRef.current && elapsedMs() >= tRef.current.plannedMs / 2) {
        halfRef.current = true;
        setPulse(true);
        ambient.haptic([30, 50, 30]);
        window.setTimeout(() => setPulse(false), 500);
      }
    } else if (ph === "break" && remainingMs() <= 0) {
      onBreakEnd();
    }
    if (ph === "focus" || ph === "paused" || ph === "break") {
      document.title = `${fmtLeft()} · ${ph === "paused" ? "Пауза · " : ""}Flow — Rhythm`;
      force((x) => x + 1);
    }
  };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      tickRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const iv = window.setInterval(() => tickRef.current(), 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(iv);
    };
  }, []);

  /* восстановление заголовка вкладки */
  useEffect(() => {
    if (phase === "setup" || phase === "complete" || phase === "aborted") document.title = titleRef.current;
  }, [phase]);

  /* ---------- прерывание: закрытие вкладки / уход с экрана (спека §10) ---------- */
  useEffect(() => {
    const saveAborted = () => {
      const ph = phaseRef.current;
      if (ph !== "focus" && ph !== "paused" && ph !== "break") return;
      if (ph !== "break") {
        const actual = Math.min(Math.floor(elapsedMs() / 1000), Math.round(tRef.current.plannedMs / 1000));
        accRef.current.focusSec += actual;
      }
      logRef.current(false);
      ambient.stopAll();
    };
    const onUnload = () => {
      saveAborted();
      db.flushSync();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      saveAborted();
      ambient.stopAll();
      previewT.current.forEach(clearTimeout);
      document.title = titleRef.current;
    };
  }, []);

  /* consumed flow-link (Flow B) */
  useEffect(() => {
    if (linkedTask) clearFlowLink();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- countdown 3-2-1 ---------- */
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      if (pendingNextRef.current) blockRef.current += 1;
      startFocus(typeRef.current === "rest" ? FLOW_CFG.rest.focusMin : durRef.current);
      return;
    }
    ambient.haptic([25]);
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [phase, countdown, startFocus]);

  /* ---------- дыхание на перерыве (вдох 4с / выдох 6с) ---------- */
  useEffect(() => {
    if (phase !== "break" || reduceMotion) return;
    let t = 0;
    const cycle = () => {
      setBreath("in");
      t = window.setTimeout(() => {
        setBreath("out");
        t = window.setTimeout(cycle, 6000);
      }, 4000);
    };
    cycle();
    return () => window.clearTimeout(t);
  }, [phase, reduceMotion]);

  /* ---------- auto-hide контролов (4 сек бездействия) ---------- */
  const poke = useCallback(() => {
    setControlsOn(true);
    window.clearTimeout(hideT.current);
    hideT.current = window.setTimeout(() => {
      if (phaseRef.current === "focus") setControlsOn(false);
    }, 4000);
  }, []);
  useEffect(() => {
    if (phase === "focus") poke();
    else setControlsOn(true);
  }, [phase, poke]);
  useEffect(() => () => window.clearTimeout(hideT.current), []);

  /* ---------- fullscreen ---------- */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else if (wrapRef.current?.requestFullscreen) void wrapRef.current.requestFullscreen().catch(() => {});
  }, []);
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  /* ---------- клавиатура (спека §11) ---------- */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      const k = e.key === " " ? "space" : e.key.toLowerCase();
      const ph = phaseRef.current;
      if (ph === "setup") {
        if (k === "1" || k === "2" || k === "3" || k === "4") {
          setType(ORDER[Number(k) - 1]);
          e.preventDefault();
        } else if (k === "enter") {
          begin();
          e.preventDefault();
        }
        return;
      }
      if (k === "space") {
        e.preventDefault();
        if (ph === "focus") pause();
        else if (ph === "paused") resume();
      } else if (k === "e" || k === "у") extend();
      else if (k === "f" || k === "а") toggleFullscreen();
      else if (k === "m" || k === "ь") setMuted((m) => !m);
      else if (k === "escape" && document.fullscreenElement) void document.exitFullscreen();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [begin, pause, resume, extend, toggleFullscreen]);

  /* ---------- XP-счётчик ---------- */
  useEffect(() => {
    if (phase !== "complete" && phase !== "aborted") return;
    const target = result?.xp ?? 0;
    if (reduceMotion || target === 0) {
      setXpShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const loop = () => {
      const p = Math.min(1, (performance.now() - t0) / 800);
      setXpShown(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, result, reduceMotion]);

  /* ---------- микшер ---------- */
  const applyMixState = useCallback((m: Record<AmbientId, number>) => {
    mixRef.current = m;
    setMix(m);
    persistMix(m);
    (Object.keys(m) as AmbientId[]).forEach((id) => {
      const v = m[id];
      if (v > 0) {
        if (ambient.isPlaying(id)) ambient.setVolume(id, v);
        else ambient.start(id, v);
      } else if (ambient.isPlaying(id)) {
        ambient.stop(id);
      }
    });
  }, []);

  const toggleAmbient = useCallback(
    (id: AmbientId) => {
      const m = { ...mixRef.current };
      if (m[id] > 0) {
        ambient.stop(id);
        m[id] = 0;
      } else {
        if (ambient.active().length >= MAX_LAYERS) {
          app.toast("info", "Максимум 3 звука одновременно");
          return;
        }
        m[id] = 0.5;
        ambient.start(id, 0.5);
      }
      mixRef.current = m;
      setMix(m);
      persistMix(m);
    },
    [app]
  );

  const setVol = useCallback((id: AmbientId, v: number) => {
    const m = { ...mixRef.current };
    if (v <= 0.02) {
      ambient.stop(id);
      m[id] = 0;
    } else {
      if (ambient.isPlaying(id)) ambient.setVolume(id, v);
      else ambient.start(id, v);
      m[id] = v;
    }
    mixRef.current = m;
    setMix(m);
    persistMix(m);
  }, []);

  const previewAll = useCallback(() => {
    previewT.current.forEach(clearTimeout);
    previewT.current = [];
    ambient.stopAll();
    AMBIENTS.forEach((a, i) => {
      previewT.current.push(
        window.setTimeout(() => {
          ambient.stopAll();
          ambient.start(a.id, 0.6);
        }, i * 1600)
      );
    });
    previewT.current.push(
      window.setTimeout(() => {
        ambient.stopAll();
        applyMix();
      }, AMBIENTS.length * 1600)
    );
  }, [applyMix]);

  const randomMix = useCallback(() => {
    const ids = [...AMBIENTS].sort(() => Math.random() - 0.5).slice(0, 2).map((a) => a.id);
    const m = { ...ZERO_MIX };
    ids.forEach((id) => (m[id] = Math.round((0.3 + Math.random() * 0.4) * 100) / 100));
    applyMixState(m);
  }, [applyMixState]);

  /* ---------- производные ---------- */
  const activeSounds = AMBIENTS.filter((a) => mix[a.id] > 0);

  const todayTasks = useMemo(() => {
    const t = todayKey();
    const now = nowMin();
    return app.tasks
      .filter((x) => x.date === t && x.status === "todo" && !x.recurrenceRule)
      .sort((a, b) => Math.abs(a.startMin - now) - Math.abs(b.startMin - now));
  }, [app.tasks]);

  const filteredTasks = useMemo(() => {
    const q = taskQuery.trim().toLowerCase();
    return q ? todayTasks.filter((t) => t.title.toLowerCase().includes(q)) : todayTasks;
  }, [todayTasks, taskQuery]);

  const todayStats = useMemo(() => {
    const t = todayKey();
    const list = app.focusSessions.filter((s) => s.date === t);
    return { count: list.length, min: Math.round(list.reduce((a, s) => a + s.focusMin, 0)) };
  }, [app.focusSessions]);

  const streak = useMemo(() => {
    const dates = new Set(app.focusSessions.filter((s) => s.completed && s.focusMin >= 1).map((s) => s.date));
    if (phase === "complete" && (result?.focusSec ?? 0) >= 60) dates.add(todayKey());
    let n = 0;
    let d = todayKey();
    if (!dates.has(d)) d = addDaysKey(d, -1);
    while (dates.has(d)) {
      n++;
      d = addDaysKey(d, -1);
    }
    return n;
  }, [app.focusSessions, phase, result]);

  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 2;
        const r = 70 + Math.random() * 60;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
      }),
    // новый залп на каждое завершение
    [phase]
  );

  /* ================= RENDER ================= */

  return (
    <div ref={wrapRef} className={fullscreen ? "flex h-full items-center justify-center bg-ink-950 px-6" : "mx-auto max-w-[880px]"}>
      {/* ---------------- SETUP ---------------- */}
      {phase === "setup" && (
        <div className="anim-rise space-y-5">
          <div className="flex items-center gap-3">
            <button className="iconbtn" onClick={() => app.setTab("today")} aria-label="Назад к таймлайну">
              <I n="chevronRight" size={16} className="rotate-180" />
            </button>
            <h2 className="font-display text-[19px] font-bold tracking-tight text-mist-50">Как хочешь сфокусироваться?</h2>
            <button className="iconbtn ml-auto" onClick={() => setSheet("sounds")} aria-label="Микшер звуков">
              <I n="sliders" size={16} />
            </button>
          </div>

          {/* совет smart-движка */}
          <div
            className="relative overflow-hidden rounded-[14px] border px-4 py-3"
            style={{ borderColor: `${cfg.color}44`, background: `linear-gradient(120deg, ${cfg.color}16, transparent 65%)` }}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5" style={{ color: cfg.color }}>
                <I n="spark" size={15} />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-bold text-mist-50">
                  Совет: {cfg.label} · {type === "rest" ? FLOW_CFG.rest.focusMin : duration} мин
                </div>
                <p className="mt-0.5 text-[12px] leading-relaxed text-mist-400">{smart.advice ?? smart.reason}</p>
              </div>
            </div>
          </div>

          {/* типы сессий */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {ORDER.map((t, i) => {
              const c = FLOW_CFG[t];
              const on = type === t;
              return (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  aria-pressed={on}
                  className={`relative rounded-[16px] border p-4 text-left transition-all duration-200 active:scale-[0.97] ${
                    on ? "" : "border-white/7 bg-white/[0.02] hover:border-white/16 hover:bg-white/[0.04]"
                  }`}
                  style={
                    on
                      ? {
                          borderColor: `${c.color}66`,
                          background: `linear-gradient(150deg, ${c.color}20, ${c.color}07)`,
                          boxShadow: `0 10px 34px -12px ${c.color}59`,
                        }
                      : undefined
                  }
                >
                  <span className="absolute right-2.5 top-2.5 font-display text-[9.5px] font-bold text-mist-500">{i + 1}</span>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: `${c.color}1e`, color: c.color }}>
                    <I n={c.icon} size={17} />
                  </span>
                  <div className="mt-2.5 font-display text-[14.5px] font-bold text-mist-50">{c.label}</div>
                  <div className="text-[10.5px] font-bold" style={{ color: on ? c.color : "#67728c" }}>
                    {c.breakMin ? `${c.focusMin}/${c.breakMin} мин` : `${c.focusMin} мин`} · +{c.xp} XP
                  </div>
                  <div className="mt-1 text-[10.5px] leading-snug text-mist-500">{c.desc}</div>
                </button>
              );
            })}
          </div>

          {/* длительность */}
          {type !== "rest" && (
            <div className="card p-4">
              <div className="flex items-center justify-between">
                <span className="label !mb-0">Длительность фокуса</span>
                <span className="font-display text-[15px] font-bold tabular-nums" style={{ color: cfg.color }}>
                  {duration} мин
                </span>
              </div>
              <input
                type="range"
                min={5}
                max={120}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="mt-2.5 w-full"
                style={{ accentColor: cfg.color }}
                aria-label="Длительность фокуса, минут"
              />
              <div className="mt-1 flex justify-between text-[9.5px] font-bold text-mist-500">
                <span>5</span><span>30</span><span>60</span><span>90</span><span>120</span>
              </div>
            </div>
          )}

          {/* блоки + автопереход */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="card flex items-center justify-between p-4">
              <div>
                <span className="label !mb-0">Блоков фокуса</span>
                <p className="text-[10.5px] font-semibold text-mist-500">до завершения сессии</p>
              </div>
              <div className="flex items-center gap-2">
                <button className="iconbtn" onClick={() => setBlocks((b) => Math.max(1, b - 1))} aria-label="Меньше блоков">
                  <I n="minus" size={14} />
                </button>
                <span className="w-6 text-center font-display text-[16px] font-bold text-mist-50">{blocks}</span>
                <button className="iconbtn" onClick={() => setBlocks((b) => Math.min(4, b + 1))} aria-label="Больше блоков">
                  <I n="plus" size={14} />
                </button>
              </div>
            </div>
            <div className="card flex items-center justify-between p-4">
              <div>
                <span className="label !mb-0">Авто-переход</span>
                <p className="text-[10.5px] font-semibold text-mist-500">перерыв → следующий блок</p>
              </div>
              <button
                role="switch"
                aria-checked={autoNext}
                onClick={() => setAutoNext((v) => !v)}
                className={`relative h-[22px] w-[40px] rounded-full transition-colors ${autoNext ? "bg-aqua-500" : "bg-ink-600"}`}
              >
                <span className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${autoNext ? "left-[21px]" : "left-[3px]"}`} />
              </button>
            </div>
          </div>

          {/* задача + звуки */}
          <div className="grid gap-3 sm:grid-cols-2">
            <button className="card flex items-center gap-3 p-4 text-left transition hover:bg-white/[0.045]" onClick={() => setSheet("tasks")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-vio-400/12 text-vio-300">
                <I n="tag" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="label !mb-0">Задача</span>
                <span className="block truncate text-[12.5px] font-bold text-mist-100">{linkedTask ? linkedTask.title : "Выбрать из таймлайна"}</span>
              </span>
              <I n="chevronRight" size={14} className="shrink-0 text-mist-500" />
            </button>
            <button className="card flex items-center gap-3 p-4 text-left transition hover:bg-white/[0.045]" onClick={() => setSheet("sounds")}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ind-400/12 text-ind-400">
                <I n="music" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="label !mb-0">Звуки</span>
                <span className="block truncate text-[12.5px] font-bold text-mist-100">
                  {activeSounds.length ? activeSounds.map((a) => a.label).join(" + ") : "Тишина"}
                </span>
              </span>
              <I n="chevronRight" size={14} className="shrink-0 text-mist-500" />
            </button>
          </div>

          <button
            className="btn w-full !py-3.5 !text-[15px] text-white"
            style={{ background: `linear-gradient(120deg, ${cfg.color}, ${cfg.color}c0)`, boxShadow: `0 14px 34px -10px ${cfg.color}66` }}
            onClick={begin}
          >
            <I n="play" size={16} /> Начать Flow
          </button>

          <p className="text-center text-[11px] font-semibold text-mist-500">
            Сегодня: {todayStats.count} сессий · {todayStats.min} мин фокуса · серия {streak} дн.
          </p>
        </div>
      )}

      {/* ---------------- COUNTDOWN ---------------- */}
      {phase === "countdown" && (
        <div className="flex min-h-[62vh] w-full flex-col items-center justify-center gap-6">
          <div
            key={countdown}
            className="anim-count font-display text-[112px] font-bold leading-none tabular-nums"
            style={{ color: cfg.color, textShadow: `0 0 70px ${cfg.color}55` }}
          >
            {countdown}
          </div>
          <p className="text-[13px] font-semibold text-mist-400">
            {cfg.label} · {type === "rest" ? FLOW_CFG.rest.focusMin : duration} мин
            {linkedTask ? ` · ${linkedTask.title}` : ""}
          </p>
          <button className="btn btn-ghost !py-1.5 !text-[11.5px]" onClick={() => { ambient.stopAll(); setPhase("setup"); }}>
            Отмена
          </button>
        </div>
      )}

      {/* ---------------- FOCUS / PAUSED ---------------- */}
      {(phase === "focus" || phase === "paused") && (
        <div className="relative flex min-h-[62vh] w-full flex-col items-center justify-center gap-7" onPointerMove={poke} onPointerDown={poke}>
          <div className={`absolute inset-x-0 top-0 flex items-center justify-between transition-opacity duration-300 ${controlsOn ? "opacity-100" : "opacity-0"}`}>
            <div className="flex min-w-0 items-center gap-2">
              <span className="chip shrink-0" style={{ color: cfg.color, borderColor: `${cfg.color}44`, background: `${cfg.color}12` }}>
                {cfg.label}
              </span>
              <span className="chip shrink-0">блок {blockRef.current}/{blocksRef.current}</span>
              {linkedTask && (
                <span className="chip hidden max-w-[200px] truncate sm:inline-flex">
                  <I n="tag" size={10} /> {linkedTask.title}
                </span>
              )}
            </div>
            <div className="flex gap-1.5">
              <button className="iconbtn" onClick={() => setMuted((m) => !m)} title="Звук вкл/выкл (M)" aria-label="Звук">
                <I n={muted ? "x" : "music"} size={15} />
              </button>
              <button className="iconbtn" onClick={() => setSheet("sounds")} title="Микшер" aria-label="Микшер">
                <I n="sliders" size={15} />
              </button>
              <button className="iconbtn" onClick={toggleFullscreen} title="Во весь экран (F)" aria-label="Полный экран">
                <I n="external" size={15} />
              </button>
            </div>
          </div>

          {/* кольцо прогресса */}
          <div
            className={`relative transition-opacity duration-500 ${phase === "paused" ? "opacity-40" : "opacity-100"}`}
            style={{ filter: pulse ? `drop-shadow(0 0 36px ${cfg.color}aa)` : `drop-shadow(0 0 22px ${cfg.color}30)` }}
          >
            <svg width={280} height={280} className="-rotate-90">
              <circle cx={140} cy={140} r={132} stroke="rgba(255,255,255,0.06)" strokeWidth={8} fill="none" />
              <circle
                cx={140} cy={140} r={132}
                stroke={cfg.color} strokeWidth={8} strokeLinecap="round" fill="none"
                strokeDasharray={2 * Math.PI * 132}
                strokeDashoffset={2 * Math.PI * 132 * (1 - Math.min(1, elapsedMs() / tRef.current.plannedMs))}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-[62px] font-bold leading-none tracking-tight text-mist-50 tabular-nums">{fmtLeft()}</span>
              <span className="mt-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.2em] text-mist-500">
                {phase === "paused" ? "Пауза. Дыши." : "фокус"}
              </span>
            </div>
          </div>

          {/* контролы */}
          <div className={`flex items-center gap-3 transition-all duration-300 ${controlsOn ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"}`}>
            {phase === "focus" ? (
              <button className="btn btn-ghost !px-5" onClick={pause}>
                <I n="pause" size={15} /> Пауза
              </button>
            ) : (
              <button className="btn btn-primary !px-5" onClick={resume}>
                <I n="play" size={15} /> Продолжить
              </button>
            )}
            <button className="btn btn-ghost" onClick={extend} disabled={extRef.current >= 2} title="Горячая клавиша E">
              <I n="plus" size={14} /> 5 мин{extRef.current > 0 ? ` · осталось ${2 - extRef.current}` : ""}
            </button>
            <HoldStop onAbort={abort} />
          </div>
          <p className={`text-[10.5px] font-semibold text-mist-500 transition-opacity duration-300 ${controlsOn ? "opacity-100" : "opacity-0"}`}>
            Space — пауза · E — +5 мин · F — во весь экран · M — звук
          </p>
        </div>
      )}

      {/* ---------------- BREAK ---------------- */}
      {phase === "break" && (() => {
        const over = remainingMs() <= 0;
        const tip = BREAK_TIPS[Math.floor(Math.min(elapsedMs(), 90_000 * BREAK_TIPS.length) / 90_000) % BREAK_TIPS.length];
        return (
          <div className="anim-fade flex min-h-[62vh] w-full flex-col items-center justify-center gap-6">
            <span className="chip !border-[#34D399]/30 !bg-[#34D399]/10 !text-[#6ee7b7]">Перерыв · блок {blockRef.current}/{blocksRef.current}</span>
            <div className="relative flex h-44 w-44 items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-[#34D399]/20" />
              <div
                className="absolute inset-3 rounded-full"
                style={{
                  background: "radial-gradient(circle at 35% 30%, rgba(52,211,153,0.35), rgba(52,211,153,0.05) 70%)",
                  transform: reduceMotion ? "scale(1)" : `scale(${breath === "in" ? 1.16 : 0.94})`,
                  transition: reduceMotion ? "none" : `transform ${breath === "in" ? 4 : 6}s ease-in-out`,
                }}
              />
              <div className="relative text-center">
                <div className="font-display text-[34px] font-bold tabular-nums text-mist-50">{over ? "0:00" : fmtLeft()}</div>
                <div className="text-[10.5px] font-extrabold uppercase tracking-[0.22em] text-[#6ee7b7]/80">
                  {reduceMotion ? "дыши спокойно" : breath === "in" ? "вдох…" : "выдох…"}
                </div>
              </div>
            </div>
            <p className="flex items-center gap-2 text-[13px] font-semibold text-mist-300">
              <I n="heart" size={14} className="text-[#6ee7b7]" /> {tip}
            </p>
            <div className="flex gap-2.5">
              {!over ? (
                <>
                  <button className="btn btn-ghost" onClick={skipBreak}>
                    <I n="arrowRight" size={14} /> Пропустить
                  </button>
                  <button className="btn btn-ghost" onClick={finishSession}>
                    <I n="check" size={14} /> Завершить сессию
                  </button>
                </>
              ) : (
                <>
                  <button className="btn btn-primary" onClick={() => beginCountdown(true)}>
                    <I n="play" size={14} /> Дальше
                  </button>
                  <button className="btn btn-ghost" onClick={finishSession}>Завершить</button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* ---------------- COMPLETE ---------------- */}
      {phase === "complete" && result && (
        <div className="anim-rise mx-auto flex min-h-[62vh] w-full max-w-[460px] flex-col items-center justify-center gap-5 text-center">
          <div className="relative">
            {!reduceMotion &&
              particles.map((p, i) => (
                <span
                  key={i}
                  className="anim-burst absolute left-1/2 top-1/2 h-2 w-2 rounded-full"
                  style={{ background: cfg.color, "--tx": `${p.x}px`, "--ty": `${p.y}px`, animationDelay: `${i * 22}ms` } as React.CSSProperties}
                />
              ))}
            <div className="flex h-20 w-20 items-center justify-center rounded-full" style={{ background: `${cfg.color}1c`, color: cfg.color }}>
              <I n="check" size={34} sw={2.4} />
            </div>
          </div>
          <div>
            <h2 className="font-display text-[22px] font-bold tracking-tight text-mist-50">Сессия завершена</h2>
            <p className="mt-0.5 text-[12.5px] font-semibold text-mist-400">{cfg.label} · {result.cycles} блок{result.cycles > 1 ? "а" : ""}</p>
          </div>
          <div className="anim-xp font-display text-[46px] font-bold leading-none tabular-nums" style={{ color: cfg.color }}>
            +{xpShown} XP
          </div>
          <div className="grid w-full grid-cols-3 gap-2">
            {[
              { v: fmtDur(Math.round(result.focusSec / 60) * 60 || 0), l: "фокус" },
              { v: result.breakSec >= 60 ? fmtDur(Math.round(result.breakSec / 60) * 60) : "—", l: "отдых" },
              { v: `${streak} дн.`, l: "серия" },
            ].map((s, i) => (
              <div key={i} className="card !rounded-xl px-2 py-3">
                <div className="font-display text-[15px] font-bold text-mist-50">{s.v}</div>
                <div className="text-[9.5px] font-extrabold uppercase tracking-wider text-mist-500">{s.l}</div>
              </div>
            ))}
          </div>
          {!moodPicked ? (
            <div className="card w-full p-3.5">
              <p className="label !mb-2 text-center">Как ты после фокуса? (опционально)</p>
              <MoodFacePicker
                value={null}
                showLabels={false}
                onChange={(lv) => {
                  /* Post-focus: source='post_focus', связь с сессией, НЕ входит в Prompt Budget. */
                  app.saveMood({
                    mood: lv,
                    note: `после Flow: ${cfg.label}`,
                    tags: ["фокус"],
                    source: "post_focus",
                    focusSessionId: sessionRef.current,
                  });
                  setMoodPicked(true);
                  app.toast("success", "Настроение записано в журнал");
                }}
              />
              <button
                className="mx-auto mt-1 block text-[11px] font-bold text-mist-500 transition hover:text-mist-300"
                onClick={() => setMoodPicked(true)}
              >
                Пропустить
              </button>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-aqua-300">
              <I n="check" size={13} /> Настроение записано — Rhythm учтёт его в плане
            </p>
          )}
          <div className="flex w-full gap-2.5">
            <button className="btn btn-primary flex-1" onClick={begin}>
              <I n="refresh" size={14} /> Ещё одну?
            </button>
            <button className="btn btn-ghost flex-1" onClick={() => setPhase("setup")}>Готово</button>
          </div>
        </div>
      )}

      {/* ---------------- ABORTED ---------------- */}
      {phase === "aborted" && result && (
        <div className="anim-rise mx-auto flex min-h-[62vh] w-full max-w-[440px] flex-col items-center justify-center gap-5 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-warn/12 text-warn">
            <I n="info" size={26} />
          </div>
          <div>
            <h2 className="font-display text-[20px] font-bold tracking-tight text-mist-50">Ок, бывает.</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-mist-400">
              {Math.floor(result.focusSec / 60)} мин фокуса тоже считаются.
              <span className="font-bold text-warn"> +{xpShown} XP</span>
            </p>
          </div>
          <div className="flex w-full gap-2.5">
            <button className="btn btn-primary flex-1" onClick={reenter}>
              <I n="play" size={14} /> Вернуться в поток
            </button>
            <button className="btn btn-ghost" onClick={() => setPhase("setup")}>В настройку</button>
          </div>
        </div>
      )}

      {/* ---------------- SOUND MIXER ---------------- */}
      <Modal open={sheet === "sounds"} onClose={() => setSheet("none")} title="Микшер звуков" icon="music" width={480}>
        <div className="space-y-2.5">
          {AMBIENTS.map((a) => {
            const v = mix[a.id];
            const on = v > 0;
            return (
              <div
                key={a.id}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${
                  on ? "border-vio-400/30 bg-vio-400/[0.06]" : "border-white/6 bg-white/[0.02]"
                }`}
              >
                <button className={`iconbtn ${on ? "!text-vio-300" : ""}`} onClick={() => toggleAmbient(a.id)} aria-label={a.label} title={a.label}>
                  <I n={a.icon} size={17} />
                </button>
                <div className="w-24 min-w-0">
                  <div className="text-[12.5px] font-bold text-mist-100">{a.label}</div>
                  <div className="truncate text-[9.5px] text-mist-500">{a.desc}</div>
                </div>
                <input
                  type="range" min={0} max={100}
                  value={Math.round(v * 100)}
                  disabled={!on}
                  onChange={(e) => setVol(a.id, Number(e.target.value) / 100)}
                  className="flex-1 accent-[#9D7BFF] disabled:opacity-25"
                  aria-label={`Громкость: ${a.label}`}
                />
                <span className="w-8 text-right font-display text-[11px] font-bold tabular-nums text-mist-400">{on ? Math.round(v * 100) : "—"}</span>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-1.5">
            <button className="btn btn-ghost !py-1.5 !text-[11.5px]" onClick={() => applyMixState({ ...ZERO_MIX, rain: 0.6, white_noise: 0.3 })}>
              Концентрация
            </button>
            <button className="btn btn-ghost !py-1.5 !text-[11.5px]" onClick={() => applyMixState({ ...ZERO_MIX, cafe: 0.65 })}>
              Кафе
            </button>
            <button className="btn btn-ghost !py-1.5 !text-[11.5px]" onClick={randomMix}>
              <I n="spark" size={12} /> Случайный микс
            </button>
            <button className="btn btn-ghost !py-1.5 !text-[11.5px]" onClick={previewAll}>
              <I n="play" size={12} /> Прослушать всё
            </button>
          </div>
          <p className="text-[10.5px] font-semibold text-mist-500">До {MAX_LAYERS} звуков одновременно · микс запоминается между сессиями</p>
        </div>
      </Modal>

      {/* ---------------- TASK PICKER ---------------- */}
      <Modal open={sheet === "tasks"} onClose={() => setSheet("none")} title="Фокус на задаче" icon="tag" width={460}>
        <input
          className="input mb-3"
          placeholder="Поиск по задачам дня…"
          value={taskQuery}
          onChange={(e) => setTaskQuery(e.target.value)}
          autoFocus
        />
        <div className="space-y-1.5">
          {filteredTasks.length === 0 && (
            <p className="py-5 text-center text-[12px] font-semibold text-mist-500">На сегодня задач нет — можно фокуситься без привязки</p>
          )}
          {filteredTasks.map((t, i) => (
            <button
              key={t.id}
              className="flex w-full items-center gap-2.5 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2 text-left transition hover:border-vio-400/30 hover:bg-vio-400/[0.06]"
              onClick={() => {
                setLinkedTask(t);
                setSheet("none");
                app.toast("info", `Фокус на «${t.title}»`);
              }}
            >
              <I n={iconOf(t.icon, "target")} size={14} className="shrink-0 text-mist-400" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-bold text-mist-100">{t.title}</span>
              <span className="font-display text-[11px] tabular-nums text-mist-500">{minToHM(t.startMin)}</span>
              {!taskQuery && i < 3 && <span className="chip !text-[9px]">рядом</span>}
            </button>
          ))}
        </div>
        {linkedTask && (
          <button
            className="btn btn-ghost mt-3 w-full"
            onClick={() => {
              setLinkedTask(null);
              setSheet("none");
            }}
          >
            Убрать привязку к задаче
          </button>
        )}
      </Modal>
    </div>
  );
}

/* ================= Удержание «Стоп» (защита от случайного тапа) ================= */
function HoldStop({ onAbort }: { onAbort: () => void }) {
  const [prog, setProg] = useState(0);
  const raf = useRef(0);
  const t0 = useRef(0);
  const active = useRef(false);

  const stop = useCallback(() => {
    active.current = false;
    cancelAnimationFrame(raf.current);
    setProg(0);
  }, []);

  const loop = useCallback(() => {
    if (!active.current) return;
    const p = Math.min(1, (performance.now() - t0.current) / 1500);
    setProg(p);
    if (p >= 1) {
      stop();
      onAbort();
      return;
    }
    raf.current = requestAnimationFrame(loop);
  }, [onAbort, stop]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <button
      className="btn relative overflow-hidden !border-bad/40 !bg-bad/10 !text-[#ff9aa8]"
      onPointerDown={(e) => {
        e.preventDefault();
        active.current = true;
        t0.current = performance.now();
        loop();
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      title="Удерживай 1.5 секунды"
    >
      <span className="absolute inset-0 origin-left" style={{ background: "rgba(242,104,124,0.3)", transform: `scaleX(${prog})` }} />
      <span className="relative flex items-center gap-2">
        <I n="x" size={14} /> {prog > 0 ? "Точно стоп…" : "Стоп"}
      </span>
    </button>
  );
}
