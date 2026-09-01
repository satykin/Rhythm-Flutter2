/* ============================================================
 * useMoodCheckIn — состояние и действия Quick Check-In sheet (Фаза A).
 * 3-секундный сенсор: выбрал состояние → Сохранить. Детали опциональны.
 * ============================================================ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../../../../state/store";
import {
  MAX_TAGS,
  NOTE_LIMIT,
  clampNote,
  moodLabel,
  normalizeTags,
} from "../../domain/moodService";
import { hmToMin, minToHM, nowMin, todayKey } from "../../../../lib/time";
import type { Task } from "../../../../lib/types";

/** Задачи «рядом» с моментом записи (окно ±30 мин) — предлагаются, но не привязываются сами. */
export function nearbyTasks(tasks: Task[], date: string, timeMin: number): Task[] {
  return tasks
    .filter((t) => t.date === date && !t.recurrenceRule && Math.abs(t.startMin - timeMin) <= 30)
    .sort((a, b) => Math.abs(a.startMin - timeMin) - Math.abs(b.startMin - timeMin));
}

export function useMoodCheckIn() {
  const app = useApp();
  const editing = useMemo(
    () => (app.checkInEditId ? app.moods.find((m) => m.id === app.checkInEditId) ?? null : null),
    [app.checkInEditId, app.moods]
  );

  const [mood, setMood] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [date, setDate] = useState(todayKey());
  const [time, setTime] = useState(minToHM(nowMin()));
  const [saving, setSaving] = useState(false);
  /* Связи с задачами — только по явному выбору пользователя (§7). */
  const [linkedTaskIds, setLinkedTaskIds] = useState<string[]>([]);

  /* (пере)инициализация формы при открытии / смене режима */
  useEffect(() => {
    if (!app.checkInOpen) return;
    if (editing) {
      setMood(editing.mood);
      setNote(editing.note ?? "");
      setTags(editing.tags);
      setDate(editing.date);
      setTime(minToHM(editing.timeMin));
      setLinkedTaskIds(editing.linkedTaskIds);
      setDetailsOpen(Boolean(editing.note) || editing.tags.length > 0 || editing.linkedTaskIds.length > 0);
    } else {
      setMood(null);
      setNote("");
      setTags([]);
      setDate(todayKey());
      setTime(minToHM(nowMin()));
      setLinkedTaskIds([]);
      /* Вечерний промпт сразу раскрывает заметку (но она всё равно опциональна). */
      setDetailsOpen(app.checkInOpenNote);
    }
    setTagInput("");
    setSaving(false);
  }, [app.checkInOpen, app.checkInOpenNote, editing]);

  /* Предложенные задачи (рядом по времени), ещё не привязанные. */
  const suggestedTasks = useMemo(() => {
    const at = hmToMin(time);
    return nearbyTasks(app.tasks, date, at).filter((t) => !linkedTaskIds.includes(t.id));
  }, [app.tasks, date, time, linkedTaskIds]);

  const linkedTasks = useMemo(
    () => app.tasks.filter((t) => linkedTaskIds.includes(t.id)),
    [app.tasks, linkedTaskIds]
  );

  const toggleLink = useCallback(
    (id: string) => setLinkedTaskIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    []
  );

  const addTag = useCallback((raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= MAX_TAGS ? prev : [...prev, t]));
    setTagInput("");
  }, []);

  const removeTag = useCallback((t: string) => setTags((prev) => prev.filter((x) => x !== t)), []);

  const canSave = mood !== null;

  const save = useCallback(async () => {
    if (mood === null || saving) return;
    setSaving(true);
    const cleanNote = clampNote(note.trim());
    const cleanTags = normalizeTags(tags);
    const timeMin = hmToMin(time);

    if (editing) {
      await app.updateMoodLog(editing.id, {
        mood,
        note: cleanNote || undefined,
        tags: cleanTags,
        linkedTaskIds,
        date,
        timeMin,
      });
      app.toast("success", "Запись обновлена");
    } else {
      const entry = await app.saveMood({
        mood,
        note: cleanNote || undefined,
        tags: cleanTags,
        /* source из промпта (morning/evening) либо manual */
        source: app.checkInSource ?? "manual",
        date,
        timeMin,
        linkedTaskIds,
      });
      if (entry) app.toast("success", `Отмечено: ${moodLabel(mood).toLowerCase()}`);
    }
    app.closeCheckIn();
  }, [app, mood, note, tags, linkedTaskIds, date, time, editing, saving]);

  return {
    editing,
    source: app.checkInSource,
    mood,
    setMood,
    note,
    setNote,
    tags,
    addTag,
    removeTag,
    tagInput,
    setTagInput,
    detailsOpen,
    setDetailsOpen,
    date,
    setDate,
    time,
    setTime,
    canSave,
    save,
    noteLimit: NOTE_LIMIT,
    maxTags: MAX_TAGS,
    linkedTaskIds,
    linkedTasks,
    suggestedTasks,
    toggleLink,
  };
}
