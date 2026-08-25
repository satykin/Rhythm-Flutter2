/* ============================================================
 * TaskLinkPicker — привязка/отвязка задач к записи (Фаза B).
 * По умолчанию предлагает задачи в окне ±30 мин от logged_at,
 * но разрешает выбрать любые задачи этого дня.
 * Сохраняет в linked_task_ids.
 * ============================================================ */

import React, { useMemo, useState } from "react";
import { I, iconOf } from "../../../components/icons";
import { Modal } from "../../../components/ui";
import { useApp } from "../../../state/store";
import { resolveColors } from "../../../lib/palette";
import { fmtDateShort, minToHM } from "../../../lib/time";
import type { MoodLog, Task } from "../../../lib/types";

const NEAR_WINDOW = 30;

export default function TaskLinkPicker({
  open,
  onClose,
  entry,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  entry: MoodLog;
  onSave: (ids: string[]) => void;
}) {
  const app = useApp();
  const colors = resolveColors(app.user);
  const [selected, setSelected] = useState<string[]>(entry.linkedTaskIds);

  const dayTasks = useMemo(
    () =>
      app.tasks
        .filter((t) => t.date === entry.date && !t.recurrenceRule)
        .sort((a, b) => a.startMin - b.startMin),
    [app.tasks, entry.date]
  );

  const nearby = useMemo(
    () => dayTasks.filter((t) => Math.abs(t.startMin - entry.timeMin) <= NEAR_WINDOW),
    [dayTasks, entry.timeMin]
  );
  const others = useMemo(
    () => dayTasks.filter((t) => Math.abs(t.startMin - entry.timeMin) > NEAR_WINDOW),
    [dayTasks, entry.timeMin]
  );

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const renderRow = (t: Task) => {
    const on = selected.includes(t.id);
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => toggle(t.id)}
        aria-pressed={on}
        className={`flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition ${
          on ? "border-aqua-400/40 bg-aqua-400/[0.08]" : "border-white/6 bg-white/[0.02] hover:bg-white/[0.045]"
        }`}
      >
        <span
          className={`flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border ${
            on ? "border-aqua-400 bg-aqua-400 text-ink-950" : "border-white/20"
          }`}
          style={{ width: 18, height: 18 }}
        >
          {on && <I n="check" size={12} sw={3} />}
        </span>
        <span style={{ color: colors[t.color] }}>
          <I n={iconOf(t.icon, "target")} size={15} sw={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-bold text-mist-100">{t.title}</span>
          <span className="block text-[10.5px] font-semibold text-mist-500">
            {minToHM(t.startMin)}–{minToHM(t.endMin)} · {t.status === "done" ? "выполнена" : t.status === "skipped" ? "пропущена" : "в плане"}
          </span>
        </span>
      </button>
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={`Задачи · ${fmtDateShort(entry.date)}`} icon="target" width={480}>
      <p className="text-[12px] text-mist-400">
        Отметь, с чем связано состояние. Записано в {minToHM(entry.timeMin)} — сначала показаны задачи рядом (±{NEAR_WINDOW} мин).
      </p>

      {nearby.length > 0 && (
        <div className="mt-4">
          <span className="label">Рядом с записью</span>
          <div className="space-y-1.5">{nearby.map(renderRow)}</div>
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-4">
          <span className="label">Остальные за день</span>
          <div className="max-h-[220px] space-y-1.5 overflow-y-auto pr-1">{others.map(renderRow)}</div>
        </div>
      )}

      {dayTasks.length === 0 && (
        <p className="mt-6 rounded-lg border border-dashed border-white/10 px-4 py-6 text-center text-[12.5px] text-mist-500">
          В этот день нет задач — нечего привязать.
        </p>
      )}

      <div className="mt-5 flex items-center justify-between border-t border-white/6 pt-4">
        <span className="text-[11.5px] font-bold text-mist-500">Выбрано: {selected.length}</span>
        <div className="flex gap-2">
          <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onSave(selected);
              onClose();
            }}
          >
            <I n="check" size={15} sw={2.4} /> Сохранить связи
          </button>
        </div>
      </div>
    </Modal>
  );
}
