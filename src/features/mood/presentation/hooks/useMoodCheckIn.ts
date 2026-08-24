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

  /* (пере)инициализация формы при открытии / смене режима */
  useEffect(() => {
    if (!app.checkInOpen) return;
    if (editing) {
      setMood(editing.mood);
      setNote(editing.note ?? "");
      setTags(editing.tags);
      setDate(editing.date);
      setTime(minToHM(editing.timeMin));
      setDetailsOpen(Boolean(editing.note) || editing.tags.length > 0);
    } else {
      setMood(null);
      setNote("");
      setTags([]);
      setDate(todayKey());
      setTime(minToHM(nowMin()));
      setDetailsOpen(false);
    }
    setTagInput("");
    setSaving(false);
  }, [app.checkInOpen, editing]);

  const addTag = useCallback((raw: string) => {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (!t) return;
    setTags((prev) => (prev.includes(t) || prev.length >= MAX_TAGS ? prev : [...prev, t]));
    setTagInput("");
  }, []);

  const removeTag = useCallback((t: string) => setTags((prev) => prev.filter((x) => x !== t)), []);

  const canSave = mood !== null;

  const save = useCallback(() => {
    if (mood === null || saving) return;
    setSaving(true);
    const cleanNote = clampNote(note.trim());
    const cleanTags = normalizeTags(tags);
    const timeMin = hmToMin(time);

    if (editing) {
      app.updateMoodLog(editing.id, {
        mood,
        note: cleanNote || undefined,
        tags: cleanTags,
        date,
        timeMin,
      });
      app.toast("success", "Запись обновлена");
    } else {
      const entry = app.saveMood({
        mood,
        note: cleanNote || undefined,
        tags: cleanTags,
        source: "manual",
        date,
        timeMin,
      });
      if (entry) app.toast("success", `Отмечено: ${moodLabel(mood).toLowerCase()}`);
    }
    app.closeCheckIn();
  }, [app, mood, note, tags, date, time, editing, saving]);

  return {
    editing,
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
  };
}
