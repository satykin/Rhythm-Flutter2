import React, { useEffect, useMemo, useState } from "react";
import { I, iconOf } from "./icons";
import { Field, Modal, Seg } from "./ui";
import { useApp } from "../state/store";
import { COLOR_NAMES, TASK_COLORS, TASK_ICONS } from "../lib/palette";
import { RECURRENCE_PRESETS } from "../features/timeline/recurrence";
import { durationHint, bestTimeHint } from "../features/suggestions/domain/SuggestionEngine";
import { clamp, fmtDur, hmToMin, minToHM, snap, todayKey } from "../lib/time";
import type { EnergyLevel, Task, TaskColor, TaskTemplate } from "../lib/types";
import { DAY_END, DAY_START } from "../lib/time";

export interface TaskDraft {
  date: string;
  startMin: number;
  endMin?: number;
}

const DUR_CHIPS = [15, 25, 45, 60, 90, 120];

export default function TaskModal({
  open,
  task,
  draft,
  onClose,
}: {
  open: boolean;
  task: Task | null;
  draft: TaskDraft | null;
  onClose: () => void;
}) {
  const app = useApp();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayKey());
  const [start, setStart] = useState(9 * 60);
  const [end, setEnd] = useState(10 * 60);
  const [color, setColor] = useState<TaskColor>("violet");
  const [icon, setIcon] = useState("briefcase");
  const [energy, setEnergy] = useState<EnergyLevel>("medium");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState(false);
  const [recurrence, setRecurrence] = useState("");

  /* §5 инлайн-подсказки: оценка длительности + лучшее время (по тегам/энергии) */
  const smartDuration = useMemo(
    () => (tags.length ? durationHint(app.tasks, tags) : null),
    [app.tasks, tags]
  );
  /* bestTimeHint учитывает и теги, и уровень энергии — подсказка полезна всегда,
   * поэтому без мёртвого условия tags.length. */
  const smartTime = useMemo(
    () => bestTimeHint(app.tasks, { tags, energy }),
    [app.tasks, tags, energy]
  );

  useEffect(() => {
    if (!open) return;
    setErrs({});
    setArmed(false);
    setTagInput("");
    setRecurrence(task?.recurrenceRule ?? "");
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setDate(task.date);
      setStart(task.startMin);
      setEnd(task.endMin);
      setColor(task.color);
      setIcon(task.icon);
      setEnergy(task.energy);
      setTags(task.tags);
    } else {
      const s = draft ? clamp(snap(draft.startMin, 15), DAY_START, DAY_END - 60) : clamp(snap(new Date().getHours() * 60 + 30, 30), DAY_START, DAY_END - 60);
      setTitle("");
      setDescription("");
      setDate(draft?.date ?? todayKey());
      setStart(s);
      setEnd(clamp(draft?.endMin ?? s + 60, s + 15, DAY_END));
      setColor("violet");
      setIcon("briefcase");
      setEnergy("medium");
      setTags([]);
    }
  }, [open, task, draft]);

  const dur = end - start;

  const setStartKeepDur = (hm: string) => {
    const s = hmToMin(hm);
    setStart(s);
    setEnd(clamp(s + Math.max(15, dur), s + 15, DAY_END));
  };

  const normalizeTag = (raw: string) => raw.trim().replace(/^#/, "").toLowerCase();

  const addTag = () => {
    const t = normalizeTag(tagInput);
    if (t && !tags.includes(t) && tags.length < 5) setTags([...tags, t]);
    setTagInput("");
  };

  /** Тег, введённый в поле, но не подтверждённый Enter, не должен теряться при сохранении. */
  const withPendingTag = (base: string[]) => {
    const t = normalizeTag(tagInput);
    return t && !base.includes(t) && base.length < 5 ? [...base, t] : base;
  };

  /* ---------- шаблоны ---------- */
  const applyTemplate = (t: TaskTemplate) => {
    setTitle(t.title);
    setIcon(t.icon);
    setColor(t.color);
    setEnergy(t.energy);
    setTags(t.tags);
    const s = t.timeHint ? hmToMin(t.timeHint) : start;
    setStart(s);
    setEnd(clamp(s + t.durationMin, s + 15, DAY_END));
  };

  const saveTemplate = () => {
    if (title.trim().length < 2) {
      setErrs({ title: "Название — минимум 2 символа" });
      return;
    }
    app.addTemplate({
      title: title.trim(),
      icon,
      color,
      durationMin: end - start,
      energy,
      tags: withPendingTag(tags),
      timeHint: minToHM(start),
    });
    app.toast("success", `Шаблон «${title.trim()}» сохранён`);
  };

  const valid = useMemo(() => {
    const e: Record<string, string> = {};
    if (title.trim().length < 2) e.title = "Название — минимум 2 символа";
    if (!date) e.date = "Укажите дату";
    if (end <= start) e.time = "Конец должен быть позже начала";
    return e;
  }, [title, date, start, end]);

  const save = () => {
    setErrs(valid);
    if (Object.keys(valid).length) return;
    const payload = {
      title: title.trim(),
      description: description.trim(),
      date,
      startMin: start,
      endMin: end,
      color,
      icon,
      energy,
      tags: withPendingTag(tags),
      recurrenceRule: recurrence || undefined,
    };
    if (task) {
      const applied = app.updateTask(task.id, payload);
      if (!applied) return; // нет свободного окна — store показал предупреждение
      app.toast("success", `«${payload.title}» обновлена`);
      onClose();
    } else {
      const created = app.addTask(payload);
      if (!created) return; // нет свободного окна — store показал предупреждение, модалка остаётся
      app.toast("success", `«${payload.title}» в плане на ${minToHM(created.startMin)}`);
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? "Редактировать задачу" : "Новая задача"} icon={task ? "edit" : "plus"} width={600}>
      <div className="space-y-4">
        {task?.source === "gcal" && (
          <div className="flex items-center gap-2.5 rounded-lg border border-ind-400/25 bg-ind-400/8 px-3 py-2 text-[12px] font-semibold text-ind-400">
            <I n="cloud" size={14} /> Импортировано из Google Calendar — изменения вернутся при синхронизации
          </div>
        )}

        {!task && app.templates.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-mist-500">
              <I n="layers" size={11} /> Шаблоны
            </span>
            {app.templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                className="chip cursor-pointer transition hover:!border-vio-400/45 hover:!bg-vio-400/12 hover:!text-vio-300"
                title={`${t.title} · ${fmtDur(t.durationMin)} · ${t.timeHint ?? ""}`}
              >
                <I n={iconOf(t.icon, "target")} size={10} /> {t.title}
              </button>
            ))}
          </div>
        )}

        <Field label="Название" error={errs.title}>
          <input
            className={`input ${errs.title ? "err" : ""}`}
            placeholder="Например: Deep Work над проектом"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </Field>

        <Field label="Описание">
          <textarea
            className="input min-h-[64px] resize-y"
            placeholder="Контекст, ссылки, критерий готовности…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Дата" error={errs.date}>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Начало" error={errs.time}>
            <input type="time" className={`input ${errs.time ? "err" : ""}`} value={minToHM(start)} onChange={(e) => e.target.value && setStartKeepDur(e.target.value)} />
          </Field>
          <Field label="Конец" hint={`${fmtDur(dur)}`}>
            <input type="time" className="input" value={minToHM(end)} onChange={(e) => e.target.value && setEnd(clamp(hmToMin(e.target.value), start + 15, DAY_END))} />
          </Field>
        </div>

        {/* §5 инлайн: умные подсказки (длительность + лучшее время) */}
        {!task && (smartDuration || smartTime !== null) && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-aqua-400/20 bg-aqua-400/[0.05] px-3 py-2">
            <I n="spark" size={13} className="text-aqua-300" />
            {smartDuration && (
              <button
                type="button"
                onClick={() => setEnd(clamp(start + smartDuration, start + 15, DAY_END))}
                className="chip cursor-pointer !border-aqua-400/30 !bg-aqua-400/10 !text-aqua-300 transition hover:!bg-aqua-400/20"
                title="Подставить оценку"
              >
                ≈ {fmtDur(smartDuration)} (по похожим)
              </button>
            )}
            {smartTime !== null && (
              <button
                type="button"
                onClick={() => {
                  setStart(smartTime);
                  setEnd(clamp(smartTime + dur, smartTime + 15, DAY_END));
                }}
                className="chip cursor-pointer !border-aqua-400/30 !bg-aqua-400/10 !text-aqua-300 transition hover:!bg-aqua-400/20"
                title="Подставить лучшее время"
              >
                <I n="clock" size={10} /> обычно в {minToHM(smartTime)}
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-bold uppercase tracking-wider text-mist-500">Длительность</span>
          {DUR_CHIPS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setEnd(clamp(start + d, start + 15, DAY_END))}
              className={`chip cursor-pointer transition ${dur === d ? "!border-vio-400/50 !bg-vio-400/15 !text-vio-300" : "hover:!border-white/20 hover:!text-mist-100"}`}
            >
              {fmtDur(d)}
            </button>
          ))}
        </div>

        <Field label="Повторение" hint={recurrence ? "Экземпляры на 7 дней вперёд появятся в таймлайне автоматически" : undefined}>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setRecurrence("")}
              className={`chip cursor-pointer transition ${!recurrence ? "!border-aqua-400/50 !bg-aqua-400/12 !text-aqua-300" : "hover:!border-white/20"}`}
            >
              Не повторять
            </button>
            {RECURRENCE_PRESETS.map((p) => (
              <button
                key={p.rule}
                type="button"
                onClick={() => setRecurrence(p.rule)}
                className={`chip cursor-pointer transition ${recurrence === p.rule ? "!border-vio-400/50 !bg-vio-400/14 !text-vio-300" : "hover:!border-white/20"}`}
              >
                <I n="refresh" size={10} /> {p.label}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Цвет">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TASK_COLORS) as TaskColor[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  title={COLOR_NAMES[c]}
                  onClick={() => setColor(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-transform ${color === c ? "scale-110 border-white/80" : "border-transparent opacity-75 hover:opacity-100 hover:scale-105"}`}
                  style={{ background: TASK_COLORS[c] }}
                  aria-label={COLOR_NAMES[c]}
                />
              ))}
            </div>
          </Field>

          <Field label="Энергия">
            <Seg<EnergyLevel>
              value={energy}
              onChange={setEnergy}
              options={[
                { value: "low", label: <><I n="moon" size={13} /> low</> },
                { value: "medium", label: <><I n="clock" size={13} /> mid</> },
                { value: "high", label: <><I n="bolt" size={13} /> high</> },
              ]}
            />
          </Field>
        </div>

        <Field label="Иконка">
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {TASK_ICONS.map((ic) => (
              <button
                key={ic.id}
                type="button"
                title={ic.label}
                onClick={() => setIcon(ic.id)}
                className={`flex h-9 items-center justify-center rounded-lg border transition ${
                  icon === ic.id
                    ? "border-vio-400/50 bg-vio-400/12 text-vio-300"
                    : "border-white/7 bg-white/[0.02] text-mist-400 hover:border-white/15 hover:text-mist-200"
                }`}
              >
                <I n={iconOf(ic.id, "target")} size={16} />
              </button>
            ))}
          </div>
        </Field>

        <Field label="Теги" hint={tags.length ? undefined : "Enter — добавить (до 5)"}>
          <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-white/8 bg-ink-800 px-2 py-1.5 focus-within:border-vio-400/50">
            {tags.map((t) => (
              <span key={t} className="chip !bg-vio-400/12 !text-vio-300 !border-vio-400/25">
                #{t}
                <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} aria-label={`Убрать ${t}`}>
                  <I n="x" size={10} />
                </button>
              </span>
            ))}
            <input
              className="min-w-[90px] flex-1 bg-transparent text-[13px] text-mist-100 outline-none placeholder:text-mist-500"
              placeholder={tags.length ? "" : "работа, deep work…"}
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag();
                } else if (e.key === "Backspace" && !tagInput && tags.length) {
                  setTags(tags.slice(0, -1));
                }
              }}
              onBlur={addTag}
            />
          </div>
        </Field>

        <div className="flex items-center gap-2.5 border-t border-white/6 pt-4">
          {task && (
            armed ? (
              <>
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    app.removeTask(task.id);
                    app.toast("info", `«${task.title}» удалена`);
                    onClose();
                  }}
                >
                  <I n="trash" size={14} /> Точно удалить
                </button>
                <button className="btn btn-ghost" onClick={() => setArmed(false)}>Отмена</button>
              </>
            ) : (
              <button className="btn btn-ghost !text-[#ff9aa8]" onClick={() => setArmed(true)}>
                <I n="trash" size={14} /> Удалить
              </button>
            )
          )}
          {!task && (
            <button className="btn btn-ghost !text-[12px]" onClick={saveTemplate} title="Сохранить как шаблон для быстрого создания">
              <I n="layers" size={13} /> В шаблоны
            </button>
          )}
          <div className="ml-auto flex gap-2.5">
            <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button className="btn btn-primary" onClick={save}>
              <I n="check" size={15} sw={2.4} /> {task ? "Сохранить" : "В план"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
