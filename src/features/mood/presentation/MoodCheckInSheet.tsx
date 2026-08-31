/* ============================================================
 * Quick Check-In — bottom sheet (Журнал 2.1, Фаза A).
 *
 * Минимальный путь: выбрать состояние → «Сохранить» (2 тапа).
 * Детали (заметка + теги) скрыты за «+ Добавить детали».
 * Числовой score никогда не показывается — только лица и подписи.
 *
 * A11y: aria-подписи состояний, Enter — сохранить, Esc — закрыть,
 * hover (desktop) / long-press (touch) — описание состояния,
 * Reduce Motion — только opacity.
 * ============================================================ */

import React, { useEffect, useRef, useState } from "react";
import { I } from "../../../components/icons";
import { MoodFace } from "../../../components/icons";
import { useApp } from "../../../state/store";
import { useMoodCheckIn } from "./hooks/useMoodCheckIn";
import { MOOD_STATES, TAG_PRESETS, moodHint, moodLabel } from "../domain/moodService";
import { minToHM } from "../../../lib/time";

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function MoodCheckInSheet() {
  const app = useApp();
  const f = useMoodCheckIn();
  const [hovered, setHovered] = useState<number | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const [success, setSuccess] = useState(false);
  const pressTimer = useRef<number | null>(null);

  const open = app.checkInOpen;

  /* Esc — закрыть (только когда открыт) */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") app.closeCheckIn();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, app]);

  /* сброс локального состояния при закрытии */
  useEffect(() => {
    if (!open) {
      setHovered(null);
      setPressed(null);
      setSuccess(false);
    }
  }, [open]);

  if (!open) return null;

  const activeHintScore = hovered ?? pressed ?? f.mood;
  const hintLine =
    activeHintScore !== null
      ? `${moodLabel(activeHintScore)} — ${moodHint(activeHintScore)}`
      : "Выбери состояние — это займёт пару секунд";

  const startPress = (score: number) => {
    pressTimer.current = window.setTimeout(() => setPressed(score), 350);
  };
  const endPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    setPressed(null);
  };

  const onSave = () => {
    if (!f.canSave) return;
    setSuccess(true);
    const delay = reduceMotion() ? 120 : 550;
    window.setTimeout(() => {
      f.save();
    }, delay);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Отметить настроение" data-testid="checkin-sheet">
      <div className="anim-fade absolute inset-0 bg-ink-950/75 backdrop-blur-[3px]" onClick={app.closeCheckIn} />

      <div
        className={`relative w-full max-w-md overflow-hidden rounded-t-2xl border border-white/8 bg-ink-900 shadow-2xl sm:rounded-2xl ${reduceMotion() ? "anim-fade" : "sheet-up"}`}
        style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0) 40%), var(--color-ink-900)" }}
      >
        {/* success-вспышка */}
        {success && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-ink-900/90">
            <div className={`flex flex-col items-center gap-3 ${reduceMotion() ? "anim-fade" : "anim-pop"}`}>
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ok/15 text-ok">
                <I n="check" size={26} sw={2.6} />
              </span>
              <span className="text-[13px] font-bold text-mist-200">Записано</span>
            </div>
          </div>
        )}

        {/* шапка */}
        <div className="flex items-center justify-between border-b border-white/6 px-5 py-4">
          <div>
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-mist-50">
              {f.editing ? "Редактировать запись" : f.source === "morning" ? "Как ты этим утром?" : f.source === "evening" ? "Как прошёл день?" : "Как ты сейчас?"}
            </h2>
            <p className="mt-0.5 text-[11px] font-semibold text-mist-500">
              {f.editing ? "Состояние — сигнал, а не оценка" : "Настроение — сигнал, а не оценка"}
            </p>
          </div>
          <button className="iconbtn" onClick={app.closeCheckIn} aria-label="Закрыть">
            <I n="x" size={16} />
          </button>
        </div>

        <div className="px-5 py-4">
          {/* пять состояний */}
          <div className="flex justify-between gap-1.5" role="radiogroup" aria-label="Состояние">
            {MOOD_STATES.map((s) => {
              const selected = f.mood === s.score;
              return (
                <button
                  key={s.score}
                  role="radio"
                  aria-checked={selected}
                  aria-label={s.label}
                  data-testid={`mood-state-${s.score}`}
                  title={`${s.label} — ${s.hint}`}
                  onClick={() => f.setMood(s.score)}
                  onMouseEnter={() => setHovered(s.score)}
                  onMouseLeave={() => setHovered(null)}
                  onPointerDown={() => startPress(s.score)}
                  onPointerUp={endPress}
                  onPointerLeave={endPress}
                  className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border py-2.5 transition-all duration-200 ${
                    selected
                      ? "-translate-y-0.5 border-white/20 bg-white/[0.06] shadow-lg"
                      : "border-transparent hover:bg-white/[0.035]"
                  } ${reduceMotion() ? "" : "hover:-translate-y-0.5"}`}
                >
                  <MoodFace level={s.score} size={34} active={selected} />
                </button>
              );
            })}
          </div>

          {/* динамическая подпись (hover / long-press / выбранное) */}
          <p className="mt-2 min-h-[18px] text-center text-[11.5px] font-semibold text-mist-400" aria-live="polite">
            {hintLine}
          </p>

          {/* детали */}
          {!f.detailsOpen ? (
            <button
              className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/12 py-2 text-[12px] font-bold text-mist-400 transition hover:border-vio-400/40 hover:text-vio-300"
              onClick={() => f.setDetailsOpen(true)}
              data-testid="checkin-add-details"
            >
              <I n="plus" size={13} /> Добавить детали
            </button>
          ) : (
            <div className="anim-rise mt-2 space-y-3 rounded-xl border border-white/7 bg-white/[0.02] p-3">
              {/* заметка */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="label !mb-0">Заметка</span>
                  <span className="text-[10px] font-bold text-mist-500">{f.note.length}/{f.noteLimit}</span>
                </div>
                <textarea
                  className="input min-h-[64px] resize-y !text-[13px]"
                  data-testid="checkin-note"
                  placeholder="Пара слов о состоянии (необязательно)…"
                  value={f.note}
                  maxLength={f.noteLimit}
                  onChange={(e) => f.setNote(e.target.value)}
                  autoFocus
                />
              </div>

              {/* теги */}
              <div>
                <span className="label">Теги · {f.tags.length}/{f.maxTags}</span>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_PRESETS.map((t) => {
                    const on = f.tags.includes(t);
                    const full = !on && f.tags.length >= f.maxTags;
                    return (
                      <button
                        key={t}
                        type="button"
                        disabled={full}
                        onClick={() => (on ? f.removeTag(t) : f.addTag(t))}
                        className={`chip cursor-pointer transition ${on ? "!border-vio-400/50 !bg-vio-400/14 !text-vio-300" : full ? "opacity-35" : "hover:!border-white/20 hover:!text-mist-100"}`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <input
                    className="input !py-1.5 !text-[12px]"
                    placeholder="Свой тег + Enter"
                    value={f.tagInput}
                    onChange={(e) => f.setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        f.addTag(f.tagInput);
                      }
                    }}
                  />
                  {f.tagInput.trim() && (
                    <button className="btn btn-soft !px-2.5 !py-1.5" onClick={() => f.addTag(f.tagInput)} aria-label="Добавить тег">
                      <I n="plus" size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* связи с задачами: система предлагает (±30 мин), пользователь подтверждает (§7) */}
              {(f.suggestedTasks.length > 0 || f.linkedTasks.length > 0) && (
                <div>
                  <span className="label">С задачами · {f.linkedTaskIds.length}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {f.linkedTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => f.toggleLink(t.id)}
                        title="Отвязать задачу"
                        className="chip cursor-pointer !border-aqua-400/45 !bg-aqua-400/12 !text-aqua-300 transition hover:!bg-bad/15 hover:!text-bad hover:!border-bad/40"
                      >
                        <I n="check" size={9} /> {t.title.length > 20 ? `${t.title.slice(0, 20)}…` : t.title}
                      </button>
                    ))}
                    {f.suggestedTasks.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => f.toggleLink(t.id)}
                        title={`Привязать «${t.title}» (в ${minToHM(t.startMin)})`}
                        className="chip cursor-pointer transition hover:!border-vio-400/45 hover:!bg-vio-400/12 hover:!text-vio-300"
                      >
                        <I n="plus" size={9} /> {t.title.length > 20 ? `${t.title.slice(0, 20)}…` : t.title}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] font-semibold text-mist-500">Рядом по времени — тапни, чтобы связать</p>
                </div>
              )}

              {/* время (редактируемое для manual entry) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="label">Дата</span>
                  <input type="date" className="input !py-1.5 !text-[12px]" value={f.date} onChange={(e) => e.target.value && f.setDate(e.target.value)} />
                </div>
                <div>
                  <span className="label">Время</span>
                  <input type="time" className="input !py-1.5 !text-[12px]" value={f.time} onChange={(e) => e.target.value && f.setTime(e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* футер */}
        <div className="flex items-center gap-2.5 border-t border-white/6 px-5 py-4">
          {f.mood !== null && (
            <span className="chip !border-vio-400/30 !bg-vio-400/10 !text-vio-300">{moodLabel(f.mood)}</span>
          )}
          <div className="ml-auto flex gap-2">
            <button className="btn btn-ghost" onClick={app.closeCheckIn}>Отмена</button>
            <button
              className="btn btn-primary"
              disabled={!f.canSave}
              onClick={onSave}
              title={f.canSave ? "Сохранить (Enter)" : "Сначала выбери состояние"}
              data-testid="checkin-save"
            >
              <I n="check" size={15} sw={2.4} /> {f.editing ? "Сохранить" : "Сохранить"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
