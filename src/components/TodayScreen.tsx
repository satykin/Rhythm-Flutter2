import React, { useEffect, useMemo, useRef, useState } from "react";
import { I, iconOf, MoodFace } from "./icons";
import { Bar, EmptyState, Ring } from "./ui";
import { useApp } from "../state/store";
import { resolveColors } from "../lib/palette";
import { bestSlots, energySeries, restWindows } from "../lib/rhythm";
import SuggestionSurface from "../features/suggestions/presentation/SuggestionSurface";
import SlotConflictDialog from "../features/timeline/SlotConflictDialog";
import type { SlotCheckResult } from "../features/timeline/conflicts";
import { setFlowLink } from "../features/flow/flowLink";
import { useHotkeys } from "../shared/hooks/useHotkeys";
import { latestMoodOfDay, moodLabel } from "../features/mood/domain/moodService";
import {
  DAY_END, DAY_START, addDaysKey, clamp, fmtDur, minToHM, nowMin, relDayLabel, snap, todayKey, weekdayIdx,
} from "../lib/time";
import type { Task } from "../lib/types";

const PPM = 1.4; // px на минуту
const H = (DAY_END - DAY_START) * PPM;

/* ---------- раскладка пересекающихся блоков по дорожкам ---------- */
function layout(tasks: Task[]) {
  const sorted = [...tasks].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed: { t: Task; lane: number; lanes: number }[] = [];
  let cluster: { t: Task; lane: number; lanes: number }[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (!cluster.length) return;
    const lanes = Math.max(...cluster.map((p) => p.lane)) + 1;
    cluster.forEach((p) => (p.lanes = lanes));
    placed.push(...cluster);
    cluster = [];
  };
  for (const t of sorted) {
    if (cluster.length && t.startMin >= clusterEnd) {
      flush();
      clusterEnd = -1;
    }
    const used = cluster.filter((p) => p.t.endMin > t.startMin).map((p) => p.lane);
    let lane = 0;
    while (used.includes(lane)) lane++;
    cluster.push({ t, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, t.endMin);
  }
  flush();
  return placed;
}

type Drag = { id: string; mode: "move" | "resize"; startMin: number; endMin: number } | null;

/* ================= Экран «Сегодня» ================= */
export default function TodayScreen({
  onEdit,
  onNewAt,
}: {
  onEdit: (t: Task) => void;
  onNewAt: (date: string, startMin: number, endMin?: number) => void;
}) {
  const app = useApp();
  const [date, setDate] = useState(todayKey());
  const [minute, setMinute] = useState(nowMin());
  const [drag, setDrag] = useState<Drag>(null);
  const dragRef = useRef<{ id: string; mode: "move" | "resize"; y0: number; s0: number; e0: number; moved: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /* Фикс 11: диалог «это время занято» при перетаскивании */
  const [conflict, setConflict] = useState<{ taskId: string; taskTitle: string; dur: number; check: SlotCheckResult } | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setInterval(() => setMinute(nowMin()), 20_000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = date === todayKey() ? Math.max(0, (nowMin() - DAY_START - 75) * PPM) : (9 * 60 - DAY_START) * PPM;
  }, [date]);

  useEffect(() => {
    if (!armedDelete) return;
    const t = window.setTimeout(() => setArmedDelete(null), 2600);
    return () => window.clearTimeout(t);
  }, [armedDelete]);

  /* родители повторяющихся задач не рендерятся — только их экземпляры */
  const dayTasks = useMemo(() => app.tasks.filter((t) => t.date === date && !t.recurrenceRule), [app.tasks, date]);
  const placed = useMemo(() => layout(dayTasks), [dayTasks]);
  const today = todayKey();
  const isToday = date === today;
  const todayMood = latestMoodOfDay(app.moods, today)?.mood;
  const sleep = app.user?.sleepHours ?? 7.5;
  const colors = resolveColors(app.user);

  useHotkeys({
    arrowleft: () => setDate((d) => addDaysKey(d, -1)),
    arrowright: () => setDate((d) => addDaysKey(d, 1)),
  });

  const done = dayTasks.filter((t) => t.status === "done").length;
  const total = dayTasks.length;

  /* ---------- drag & drop ---------- */
  const onDown = (e: React.PointerEvent, t: Task, mode: "move" | "resize") => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { id: t.id, mode, y0: e.clientY, s0: t.startMin, e0: t.endMin, moved: false };
    setDrag({ id: t.id, mode, startMin: t.startMin, endMin: t.endMin });
  };

  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 4) d.moved = true;
    const dm = Math.round(dy / PPM / 15) * 15;
    if (d.mode === "move") {
      const dur = d.e0 - d.s0;
      const s = clamp(d.s0 + dm, DAY_START, DAY_END - dur);
      setDrag({ id: d.id, mode: d.mode, startMin: s, endMin: s + dur });
    } else {
      const en = clamp(d.e0 + dm, d.s0 + 15, DAY_END);
      setDrag({ id: d.id, mode: d.mode, startMin: d.s0, endMin: en });
    }
  };

  const onUp = (t: Task) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.moved && drag) {
      /* Фикс 11: при коллизии не переносим молча — открываем диалог. */
      const check = app.checkTaskSlot(date, drag.startMin, drag.endMin, d.id);
      if (!check.free) {
        setConflict({ taskId: d.id, taskTitle: t.title, dur: drag.endMin - drag.startMin, check });
      } else {
        const applied = app.updateTask(d.id, { startMin: drag.startMin, endMin: drag.endMin });
        if (applied) {
          app.toast("info", `«${t.title}» → ${minToHM(applied.startMin)}–${minToHM(applied.endMin)}`);
        }
      }
    } else if (!d.moved && d.mode === "move") {
      onEdit(t);
    }
    setDrag(null);
  };

  /* ---------- адаптивная перестройка при пропуске ---------- */
  const skipTask = (t: Task) => {
    const dur = t.endMin - t.startMin;
    app.setTaskStatus(t.id, "skipped");
    const after = dayTasks.filter((x) => x.status === "todo" && x.startMin >= t.endMin);
    after.forEach((x) => app.updateTask(x.id, { startMin: x.startMin - dur, endMin: x.endMin - dur }));
    app.toast(
      "info",
      after.length
        ? `Rhythm перестроил день: ${after.length} ${after.length === 1 ? "задача сдвинута" : "задачи сдвинуты"} на ${fmtDur(dur)} раньше`
        : "Задача пропущена"
    );
  };

  const completeTask = (t: Task) => {
    app.setTaskStatus(t.id, "done");
    app.toast("success", `«${t.title}» — готово. +25 XP`);
  };

  const dblCreate = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const min = snap(DAY_START + (e.clientY - rect.top) / PPM, 30);
    onNewAt(date, clamp(min, DAY_START, DAY_END - 60));
  };

  /* ---------- фоновая кривая энергии ---------- */
  const energyPath = useMemo(() => {
    const pts = energySeries(sleep, todayMood, 20);
    const w = 100;
    const xy = pts.map((p) => [
      ((p.min - DAY_START) / (DAY_END - DAY_START)) * w,
      100 - p.v,
    ]);
    const line = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    return { line, area: `${line} L100,100 L0,100 Z` };
  }, [sleep, todayMood]);

  return (
    <div className="mx-auto max-w-[1180px] space-y-5">
      {isToday && <SuggestionSurface onPlan={(s, e) => onNewAt(date, s, e)} />}
      <div className="flex flex-col gap-5 xl:flex-row">
      {/* ============ TIMELINE ============ */}
      <section className="anim-rise card flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-2 border-b border-white/6 px-4 py-3">
          <button className="iconbtn !h-8 !w-8" onClick={() => setDate(addDaysKey(date, -1))} aria-label="Предыдущий день">
            <I n="chevronRight" size={15} className="rotate-180" />
          </button>
          <div className="min-w-0 text-center">
            <div className="font-display text-[14px] font-bold leading-tight text-mist-50">{relDayLabel(date)}</div>
            <div className="text-[11px] font-semibold text-mist-500">
              {total ? `${done} из ${total} выполнено` : "нет задач"}
            </div>
          </div>
          <button className="iconbtn !h-8 !w-8" onClick={() => setDate(addDaysKey(date, 1))} aria-label="Следующий день">
            <I n="chevronRight" size={15} />
          </button>
          {!isToday && (
            <button className="btn btn-soft !px-2.5 !py-1 !text-[11.5px]" onClick={() => setDate(today)}>
              К сегодня
            </button>
          )}
          <span className="ml-auto hidden text-[11px] font-semibold text-mist-500 sm:block">
            двойной клик — новая задача · блоки можно перетаскивать
          </span>
        </header>

        <div ref={scrollRef} className="relative flex-1 overflow-y-auto overscroll-contain">
          {total === 0 ? (
            <div className="p-5">
              <EmptyState
                icon="calendar"
                title={isToday ? "День пока пуст" : "Здесь нет задач"}
                desc="Добавь задачу вручную — или пусть Rhythm распланирует день из твоих рутин. Двойной клик по сетке тоже работает."
              >
                <button className="btn btn-primary" onClick={() => onNewAt(date, clamp(snap(nowMin() + 30, 30), DAY_START, DAY_END - 60))}>
                  <I n="plus" size={15} sw={2.4} /> Добавить задачу
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    const rs = app.routines.filter((r) => r.days.includes(weekdayIdx(date)));
                    let added = 0;
                    rs.forEach((r) => app.applyRoutine(r) && added++);
                    app.toast(added ? "success" : "error", added ? `Добавлено ${added} ${added === 1 ? "рутина" : "рутины"} из привычек` : "Свободных слотов не нашлось");
                  }}
                >
                  <I n="layers" size={15} /> Заполнить рутинами
                </button>
              </EmptyState>
            </div>
          ) : (
            <div className="flex select-none">
              {/* шкала часов */}
              <div className="relative w-[52px] shrink-0" style={{ height: H }}>
                {Array.from({ length: 18 }, (_, i) => DAY_START + i * 60).map((m) => (
                  <span
                    key={m}
                    className="absolute right-2.5 -translate-y-1/2 font-display text-[10.5px] font-semibold text-mist-500"
                    style={{ top: (m - DAY_START) * PPM }}
                  >
                    {minToHM(m)}
                  </span>
                ))}
              </div>

              {/* сетка */}
              <div className="relative flex-1 cursor-crosshair border-l border-white/6" style={{ height: H }} onDoubleClick={dblCreate}>
                {Array.from({ length: 18 }, (_, i) => DAY_START + i * 60).map((m) => (
                  <div key={m} className="absolute inset-x-0 border-t border-white/[0.045]" style={{ top: (m - DAY_START) * PPM }} />
                ))}

                {/* фон энергии (только сегодня) */}
                {isToday && (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.16]" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="eg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#37D6C0" stopOpacity="0.5" />
                        <stop offset="1" stopColor="#9D7BFF" stopOpacity="0.05" />
                      </linearGradient>
                    </defs>
                    <path d={energyPath.area} fill="url(#eg)" />
                    <path d={energyPath.line} fill="none" stroke="#37D6C0" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
                  </svg>
                )}

                {/* блоки задач */}
                {placed.map(({ t, lane, lanes }) => {
                  const d = drag && drag.id === t.id ? drag : null;
                  const s = d ? d.startMin : t.startMin;
                  const e = d ? d.endMin : t.endMin;
                  const top = (s - DAY_START) * PPM;
                  const h = Math.max(26, (e - s) * PPM - 3);
                  const c = colors[t.color];
                  const compact = e - s <= 35;
                  const isDone = t.status === "done";
                  const isSkipped = t.status === "skipped";
                  const wPct = 100 / lanes;
                  return (
                    <div
                      key={t.id}
                      onDoubleClick={(ev) => ev.stopPropagation()}
                      onPointerDown={(ev) => !isSkipped && onDown(ev, t, "move")}
                      onPointerMove={onMove}
                      onPointerUp={() => onUp(t)}
                      className={`group absolute rounded-[9px] border transition-shadow ${
                        d ? "z-30 cursor-grabbing shadow-2xl ring-1 ring-white/25" : "z-10 cursor-grab hover:z-20 hover:shadow-xl"
                      } ${isDone ? "opacity-55" : ""} ${isSkipped ? "opacity-35" : ""}`}
                      style={{
                        top,
                        height: h,
                        left: `calc(${lane * wPct}% + 4px)`,
                        width: `calc(${wPct}% - 9px)`,
                        background: `linear-gradient(135deg, ${c}1f, ${c}0d)`,
                        borderColor: `${c}3d`,
                        borderLeft: `3px solid ${c}`,
                        transitionProperty: d ? "none" : "box-shadow, opacity",
                      }}
                    >
                      <div className={`flex h-full flex-col overflow-hidden px-2.5 ${compact ? "justify-center" : "py-1.5"}`}>
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: c }}>
                            <I n={iconOf(t.icon, "target")} size={compact ? 12 : 13} sw={2} />
                          </span>
                          <span className={`min-w-0 flex-1 truncate text-[12.5px] font-bold leading-tight text-mist-50 ${isDone ? "line-through" : ""}`}>
                            {t.title}
                          </span>
                          {t.source === "gcal" && (
                            <span className="chip !px-1.5 !py-0 !text-[9px] !text-ind-400">
                              <I n="cloud" size={9} /> G
                            </span>
                          )}
                          {(t.parentTaskId || t.recurrenceRule) && (
                            <span className="chip !px-1.5 !py-0 !text-[9px] !text-vio-300" title="Повторяющаяся задача">
                              <I n="refresh" size={9} />
                            </span>
                          )}
                          {t.syncStatus === "pending" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="Ждёт синхронизации" />}
                          {t.syncStatus === "synced" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-aqua-400" title="Синхронизировано" />}
                        </div>
                        {!compact && (
                          <>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] font-bold text-mist-400">
                              <I n="clock" size={10} />
                              {d ? `${minToHM(s)} – ${minToHM(e)}` : `${minToHM(t.startMin)} – ${minToHM(t.endMin)}`}
                              <span className="opacity-60">· {fmtDur(e - s)}</span>
                              {t.energy === "high" && (
                                <span className="ml-0.5 flex items-center gap-0.5 text-warn">
                                  <I n="bolt" size={10} sw={2.2} /> high
                                </span>
                              )}
                            </div>
                            {h > 64 && t.tags.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {t.tags.slice(0, 2).map((tag) => (
                                  <span key={tag} className="rounded-md bg-white/5 px-1.5 py-[1px] text-[9.5px] font-bold text-mist-400">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                        {isSkipped && !compact && <div className="mt-0.5 text-[10px] font-bold text-mist-500">пропущено — день перестроен</div>}
                      </div>

                      {/* контролы */}
                      {!isSkipped && (
                        <div className={`absolute right-1.5 top-1.5 flex gap-1 transition-opacity ${d ? "opacity-0" : "opacity-0 group-hover:opacity-100"}`}>
                          {!isDone ? (
                            <button
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-ok/40 bg-ink-900/85 text-ok hover:bg-ok/20"
                              title="Выполнено"
                              onPointerDown={(ev) => ev.stopPropagation()}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                completeTask(t);
                              }}
                            >
                              <I n="check" size={12} sw={2.6} />
                            </button>
                          ) : (
                            <button
                              className="flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-ink-900/85 text-mist-300 hover:bg-white/10"
                              title="Вернуть в план"
                              onPointerDown={(ev) => ev.stopPropagation()}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                app.setTaskStatus(t.id, "todo");
                              }}
                            >
                              <I n="refresh" size={11} />
                            </button>
                          )}
                          <button
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-ink-900/85 text-mist-300 hover:bg-white/10"
                            title="Редактировать"
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              onEdit(t);
                            }}
                          >
                            <I n="edit" size={11} />
                          </button>
                          <button
                            className="flex h-6 w-6 items-center justify-center rounded-md border border-vio-400/40 bg-ink-900/85 text-vio-300 hover:bg-vio-400/20"
                            title="Фокус на задаче (Flow)"
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setFlowLink(t.id);
                              app.setTab("flow");
                            }}
                          >
                            <I n="play" size={11} />
                          </button>
                          <button
                            className={`flex h-6 items-center justify-center rounded-md border bg-ink-900/85 px-1 ${
                              armedDelete === t.id ? "border-bad/60 text-bad" : "w-6 border-white/15 text-mist-300 hover:bg-white/10"
                            }`}
                            title={armedDelete === t.id ? "Нажмите ещё раз для удаления" : "Удалить"}
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              if (armedDelete === t.id) {
                                app.removeTask(t.id);
                                app.toast("info", `«${t.title}» удалена`);
                                setArmedDelete(null);
                              } else setArmedDelete(t.id);
                            }}
                          >
                            <I n="trash" size={11} />
                          </button>
                        </div>
                      )}

                      {/* ручка изменения длительности */}
                      {!isSkipped && (
                        <div
                          onPointerDown={(ev) => onDown(ev, t, "resize")}
                          onPointerMove={onMove}
                          onPointerUp={() => onUp(t)}
                          className="absolute inset-x-2 bottom-0 flex h-2.5 cursor-ns-resize items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <span className="h-[3px] w-8 rounded-full bg-white/25" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* линия «сейчас» */}
                {isToday && minute >= DAY_START && minute <= DAY_END && (
                  <div className="pointer-events-none absolute inset-x-0 z-20" style={{ top: (minute - DAY_START) * PPM }}>
                    <div className="grad-brand relative h-[2px]">
                      <span className="now-dot absolute -left-[5px] -top-[3.5px] h-[9px] w-[9px] rounded-full bg-aqua-400" />
                      <span className="grad-brand absolute -top-[9px] left-2 rounded-md px-1.5 py-[1px] font-display text-[9.5px] font-bold text-white shadow">
                        {minToHM(minute)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============ SIDE PANEL ============ */}
      <aside className="grid w-full shrink-0 content-start gap-4 sm:grid-cols-2 xl:sticky xl:top-0 xl:w-[318px] xl:grid-cols-1">
        <NowCard onEdit={onEdit} onSkip={skipTask} onComplete={completeTask} />
        <MoodCheck />
        <RoutinesCard date={date} />
        <HintCard />
      </aside>
      </div>

      {/* Фикс 11: диалог переноса при занятом слоте (drag & drop) */}
      <SlotConflictDialog
        check={conflict?.check ?? null}
        taskTitle={conflict?.taskTitle ?? ""}
        onCancel={() => setConflict(null)}
        onPick={(slot) => {
          if (!conflict) return;
          const applied = app.updateTask(conflict.taskId, { startMin: slot.startMin, endMin: slot.startMin + conflict.dur });
          if (applied) {
            app.toast("info", `«${conflict.taskTitle}» → ${minToHM(applied.startMin)}–${minToHM(applied.endMin)}`);
          }
          setConflict(null);
        }}
      />
    </div>
  );
}

/* ================= «Сейчас» ================= */
function NowCard({
  onEdit,
  onSkip,
  onComplete,
}: {
  onEdit: (t: Task) => void;
  onSkip: (t: Task) => void;
  onComplete: (t: Task) => void;
}) {
  const app = useApp();
  const [, force] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => force((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, []);

  const today = todayKey();
  const now = nowMin();
  const nowSec = (() => {
    const d = new Date();
    return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  })();

  const dayTasks = app.tasks.filter((t) => t.date === today && !t.recurrenceRule);
  const current = dayTasks.find((t) => t.status === "todo" && t.startMin <= now && t.endMin > now);
  const next = dayTasks.filter((t) => t.status === "todo" && t.startMin > now).sort((a, b) => a.startMin - b.startMin)[0];
  const done = dayTasks.filter((t) => t.status === "done").length;
  const total = dayTasks.length;
  const pct = total ? done / total : 0;

  const fmtLeft = (leftSec: number) => {
    const h = Math.floor(leftSec / 3600);
    const m = Math.floor((leftSec % 3600) / 60);
    const s = leftSec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
      : `${m}:${String(s).padStart(2, "0")}`;
  };
  let countdown = "";
  if (current) {
    countdown = fmtLeft(Math.max(0, current.endMin * 60 - nowSec));
  } else if (next) {
    countdown = fmtLeft(Math.max(0, next.startMin * 60 - nowSec));
  }

  const active = current ?? next;
  const colors = resolveColors(app.user);
  const c = active ? colors[active.color] : "#37D6C0";

  return (
    <div className="anim-rise d-1 card relative overflow-hidden p-4">
      <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl" style={{ background: `${c}22` }} />
      <div className="flex items-center justify-between">
        <span className="label !mb-0">Сейчас</span>
        <Ring value={pct} size={42} stroke={4}>
          <span className="font-display text-[10px] font-bold text-mist-200">{Math.round(pct * 100)}%</span>
        </Ring>
      </div>

      {active ? (
        <>
          <div className="mt-2 flex items-center gap-2">
            <span className="chip !border-transparent !px-1.5 !py-0.5 !text-[10px]" style={{ color: c, background: `${c}1c` }}>
              {current ? "идёт сейчас" : `в ${minToHM(next!.startMin)}`}
            </span>
            <span className="font-display text-[19px] font-bold tracking-tight text-mist-50 tabular-nums">{countdown}</span>
            <span className="text-[10.5px] font-bold text-mist-500">{current ? "до конца" : "до начала"}</span>
          </div>
          <div className="mt-2 flex items-start gap-2.5">
            <span className="mt-0.5" style={{ color: c }}>
              <I n={iconOf(active.icon, "target")} size={17} sw={2} />
            </span>
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold text-mist-50">{active.title}</div>
              <div className="text-[11.5px] font-semibold text-mist-400">
                {minToHM(active.startMin)}–{minToHM(active.endMin)} · {fmtDur(active.endMin - active.startMin)}
              </div>
            </div>
          </div>
          {current && <Bar className="mt-3" value={((now - current.startMin) / (current.endMin - current.startMin)) * 100} color={`linear-gradient(90deg,${c},#37D6C0)`} />}
          <div className="mt-3.5 flex gap-2">
            <button className="btn btn-primary flex-1 !py-2 !text-[12.5px]" onClick={() => onComplete(active)}>
              <I n="check" size={14} sw={2.5} /> Готово
            </button>
            {current && (
              <button className="btn btn-ghost !py-2 !text-[12.5px]" onClick={() => onSkip(current)} title="Rhythm перестроит оставшийся день">
                Пропустить
              </button>
            )}
            <button className="iconbtn" onClick={() => onEdit(active)} aria-label="Редактировать">
              <I n="edit" size={15} />
            </button>
          </div>
        </>
      ) : total > 0 ? (
        <div className="mt-3 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ok/12 text-ok">
            <I n="check" size={19} sw={2.4} />
          </span>
          <div>
            <div className="text-[13.5px] font-bold text-mist-50">День завершён</div>
            <div className="text-[11.5px] text-mist-400">{done} из {total} задач — отличная работа</div>
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[12.5px] leading-relaxed text-mist-400">
          Задач на сегодня нет. Добавь первую — ритм появится сам.
        </div>
      )}
    </div>
  );
}

/* ================= Mood check-in (Журнал 2.1) =================
 * Компактный виджет на Today: открывает глобальный Quick Check-In sheet
 * (хоткей M). Показывает последнее состояние за сегодня. */
function MoodCheck() {
  const app = useApp();
  const today = todayKey();
  const log = latestMoodOfDay(app.moods, today);
  const countToday = app.moods.filter((m) => m.date === today).length;

  return (
    <div className="anim-rise d-2 card p-4">
      <div className="flex items-center justify-between">
        <span className="label !mb-0">Как ты сейчас?</span>
        {countToday > 0 && (
          <span className="chip !text-aqua-300 !border-aqua-400/25 !bg-aqua-400/10">
            {countToday} {countToday === 1 ? "чек-ин" : "чек-ина"}
          </span>
        )}
      </div>
      {log ? (
        <button
          className="mt-2.5 flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left transition hover:bg-white/[0.06]"
          onClick={() => app.openCheckIn()}
          title="Отметить ещё раз (M)"
          data-testid="checkin-open"
        >
          <MoodFace level={log.mood} size={30} active />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12.5px] font-bold text-mist-100">{moodLabel(log.mood)}</span>
            <span className="block text-[10.5px] font-semibold text-mist-500">{minToHM(log.timeMin)} · отметить ещё</span>
          </span>
          <I n="chevronRight" size={15} className="text-mist-500" />
        </button>
      ) : (
        <button className="btn btn-soft mt-2.5 w-full" onClick={() => app.openCheckIn()} data-testid="checkin-open">
          <I n="plus" size={14} sw={2.4} /> Отметить состояние
        </button>
      )}
    </div>
  );
}

/* ================= Рутины ================= */
function RoutinesCard({ date }: { date: string }) {
  const app = useApp();
  const wd = weekdayIdx(date);
  const rs = app.routines.filter((r) => r.days.includes(wd));
  const colors = resolveColors(app.user);

  return (
    <div className="anim-rise d-3 card p-4">
      <div className="flex items-center justify-between">
        <span className="label !mb-0">Рутины</span>
        <span className="chip">{rs.length}</span>
      </div>
      {rs.length === 0 ? (
        <p className="mt-2 text-[12px] text-mist-500">На этот день рутин нет.</p>
      ) : (
        <div className="mt-2.5 space-y-1.5">
          {rs.map((r) => (
            <div key={r.id} className="group flex items-center gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2 transition hover:bg-white/[0.045]">
              <span style={{ color: colors[r.color] }}>
                <I n={iconOf(r.icon, "sun")} size={15} sw={2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-bold text-mist-100">{r.title}</div>
                <div className="text-[10.5px] font-semibold text-mist-500">~{r.timeHint} · {fmtDur(r.durationMin)}</div>
              </div>
              <button
                className="btn btn-soft !px-2 !py-1 !text-[11px] opacity-70 transition group-hover:opacity-100"
                onClick={() => {
                  const res = app.applyRoutine(r);
                  if (res) app.toast("success", `«${r.title}» в плане на ${minToHM(res.time)}`);
                  else app.toast("error", "Свободных слотов до конца дня нет");
                }}
              >
                <I n="plus" size={11} sw={2.6} /> в план
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================= Умная подсказка ================= */
function HintCard() {
  const app = useApp();
  const sleep = app.user?.sleepHours ?? 7.5;
  const mood = app.moods.find((m) => m.date === todayKey())?.mood;
  const slots = bestSlots(sleep, mood);
  const rest = restWindows(sleep, mood);

  return (
    <div className="anim-rise d-4 card relative overflow-hidden p-4">
      <div className="pointer-events-none absolute -left-8 -bottom-8 h-24 w-24 rounded-full bg-vio-400/12 blur-2xl" />
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-vio-400/12 text-vio-300">
          <I n="spark" size={14} />
        </span>
        <span className="label !mb-0">Smart suggestion</span>
      </div>
      {slots[0] ? (
        <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist-300">
          Пик энергии — <b className="font-display text-aqua-300">{minToHM(slots[0].start)}–{minToHM(slots[0].end)}</b>.
          Поставь сюда самую сложную задачу{rest[0] ? <> , а в <b className="text-mist-100">{minToHM(rest[0].start)}–{minToHM(rest[0].end)}</b> — прогулку</> : ""}.
        </p>
      ) : (
        <p className="mt-2.5 text-[12.5px] text-mist-400">Сегодня ровный день без ярких пиков — чередуй фокус и отдых.</p>
      )}
      <p className="mt-2 text-[10.5px] font-semibold text-mist-500">На основе сна ({sleep.toFixed(1).replace(".0", "")} ч){mood ? " и чек-ина настроения" : ""}.</p>
    </div>
  );
}
