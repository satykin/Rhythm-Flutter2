/* ============================================================
 * Detail View — запись в контексте (Фаза B).
 * Полное содержимое + связанные задачи + Flow Session +
 * контекст дня + лента остальных записей дня.
 * Удаление: Undo toast; доп. подтверждение — только для записей
 * с заметкой или связями (логика Фазы A).
 * ============================================================ */

import React, { useState } from "react";
import { I, MoodFace, iconOf } from "../../../components/icons";
import { Modal } from "../../../components/ui";
import { useApp } from "../../../state/store";
import { useMoodContext } from "./hooks/useMoodContext";
import { moodLabel } from "../domain/moodService";
import { resolveColors } from "../../../lib/palette";
import { fmtDateLong, minToHM, fmtDur } from "../../../lib/time";
import type { FlowType, MoodLog } from "../../../lib/types";
import TaskLinkPicker from "./TaskLinkPicker";

const SOURCE_LABEL: Record<MoodLog["source"], string> = {
  manual: "вручную",
  post_focus: "после фокуса",
  morning: "утро",
  evening: "вечер",
};

const FLOW_LABEL: Record<FlowType, string> = {
  deep: "Deep Work",
  creative: "Creative",
  light: "Light",
  rest: "Rest",
};

export default function DetailView({
  entry,
  onClose,
  onOpenEntry,
}: {
  entry: MoodLog | null;
  onClose: () => void;
  onOpenEntry: (id: string) => void;
}) {
  const app = useApp();
  const colors = resolveColors(app.user);
  const ctx = useMoodContext(entry);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [armed, setArmed] = useState(false);

  if (!entry) return null;

  const doDelete = () => {
    const needsConfirm = Boolean(entry.note) || entry.linkedTaskIds.length > 0;
    if (needsConfirm && !armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 2500);
      return;
    }
    const removed = app.removeMoodLog(entry.id);
    onClose();
    if (removed) {
      app.toast("info", `Запись от ${minToHM(removed.timeMin)} удалена`, [
        { label: "Вернуть", run: () => app.restoreMoodLog(removed) },
      ]);
    }
  };

  return (
    <>
      <Modal open onClose={onClose} title="Запись" icon="heart" width={560}>
        {/* ---------- шапка: эмодзи + подпись + время ---------- */}
        <div className="flex items-start gap-3.5">
          <MoodFace level={entry.mood} size={48} active />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-display text-[18px] font-bold tracking-tight text-mist-50">{moodLabel(entry.mood)}</span>
              <span className="chip !text-[9.5px]">{SOURCE_LABEL[entry.source]}</span>
            </div>
            <p className="mt-0.5 text-[12px] font-semibold text-mist-400">
              {fmtDateLong(entry.date)} · {minToHM(entry.timeMin)}
            </p>
          </div>
        </div>

        {/* ---------- заметка + теги ---------- */}
        {entry.note && (
          <p className="mt-4 rounded-lg border border-white/6 bg-white/[0.02] px-3.5 py-2.5 text-[13px] leading-relaxed text-mist-200">
            {entry.note}
          </p>
        )}
        {entry.tags.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {entry.tags.map((t) => (
              <span key={t} className="chip">#{t}</span>
            ))}
          </div>
        )}

        {/* ---------- связанные задачи ---------- */}
        <section className="mt-5">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label !mb-0">Связанные задачи</span>
            <button className="btn btn-ghost !px-2.5 !py-1 !text-[11px]" onClick={() => setPickerOpen(true)}>
              <I n="plus" size={12} /> {ctx.linkedTasks.length ? "Изменить" : "Привязать"}
            </button>
          </div>
          {ctx.linkedTasks.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/8 px-3.5 py-3 text-[12px] text-mist-500">
              Нет связанных задач. Привяжи задачи, с которыми связано это состояние.
            </p>
          ) : (
            <div className="space-y-1.5">
              {ctx.linkedTasks.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2">
                  <span style={{ color: colors[t.color] }}>
                    <I n={iconOf(t.icon, "target")} size={15} sw={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-mist-100">{t.title}</span>
                    <span className="block text-[10.5px] font-semibold text-mist-500">
                      {minToHM(t.startMin)}–{minToHM(t.endMin)} · {t.status === "done" ? "выполнена" : t.status === "skipped" ? "пропущена" : "в плане"}
                    </span>
                  </span>
                  {t.status === "done" && <I n="check" size={14} className="shrink-0 text-aqua-300" />}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------- flow session ---------- */}
        {ctx.session && (
          <section className="mt-4">
            <span className="label">Flow Session</span>
            <div className="flex items-center gap-3 rounded-lg border border-vio-400/25 bg-vio-400/[0.06] px-3.5 py-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-vio-400/15 text-vio-300">
                <I n="timer" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-bold text-mist-100">
                  {FLOW_LABEL[ctx.session.type]} · {fmtDur(Math.round(ctx.session.focusMin))} фокуса
                </span>
                <span className="block text-[10.5px] font-semibold text-mist-500">
                  {ctx.session.cycles} цикл(ов) · {ctx.session.completed ? "завершена" : "прервана"}
                </span>
              </div>
            </div>
          </section>
        )}

        {/* ---------- контекст дня ---------- */}
        <section className="mt-4">
          <span className="label">Контекст дня</span>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2.5 text-center">
              <div className="font-display text-[17px] font-bold text-mist-50">
                {ctx.day.tasksDone}/{ctx.day.tasksTotal}
              </div>
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-mist-500">задач сделано</div>
            </div>
            <div className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2.5 text-center">
              <div className="font-display text-[17px] font-bold text-mist-50">{fmtDur(ctx.day.focusMin)}</div>
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-mist-500">фокуса</div>
            </div>
            <div className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2.5 text-center">
              <div className="font-display text-[17px] font-bold text-mist-50">{ctx.day.habits.length}</div>
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-mist-500">привычек</div>
            </div>
          </div>
        </section>

        {/* ---------- лента дня ---------- */}
        {ctx.dayFeed.length > 0 && (
          <section className="mt-4">
            <span className="label">Ещё записи за этот день</span>
            <div className="flex flex-wrap gap-1.5">
              {ctx.dayFeed.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpenEntry(m.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 transition hover:bg-white/[0.07]"
                  title={`${moodLabel(m.mood)} · ${minToHM(m.timeMin)}`}
                >
                  <MoodFace level={m.mood} size={20} active />
                  <span className="text-[11px] font-bold text-mist-300">{minToHM(m.timeMin)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ---------- действия ---------- */}
        <div className="mt-5 flex items-center gap-2 border-t border-white/6 pt-4">
          <button
            className={`btn ${armed ? "btn-danger" : "btn-ghost"}`}
            onClick={doDelete}
            aria-label={armed ? "Подтвердить удаление" : "Удалить запись"}
          >
            <I n="trash" size={14} /> {armed ? "Точно удалить?" : "Удалить"}
          </button>
          <div className="ml-auto flex gap-2">
            <button className="btn btn-ghost" onClick={onClose}>Закрыть</button>
            <button className="btn btn-primary" onClick={() => app.openCheckIn(entry.id)}>
              <I n="edit" size={14} /> Редактировать
            </button>
          </div>
        </div>
      </Modal>

      {pickerOpen && (
        <TaskLinkPicker
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          entry={entry}
          onSave={(ids) => {
            app.updateMoodLog(entry.id, { linkedTaskIds: ids });
            app.toast("success", `Связано задач: ${ids.length}`);
          }}
        />
      )}
    </>
  );
}
