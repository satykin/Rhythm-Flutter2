/* ============================================================
 * MoodRepository — слой данных для mood_logs (Журнал 2.1).
 * Тонкая обёртка над db.*: в проде здесь встанет Supabase-клиент
 * с RLS по user_id; контракт не изменится.
 * ============================================================ */

import { db } from "../../../lib/db";
import { uid, nowMin, todayKey, minToHM } from "../../../lib/time";
import type { MoodLog, MoodSource } from "../../../lib/types";
import { validateMoodDraft } from "../domain/moodService";

export interface NewMoodInput {
  mood: number;
  note?: string;
  tags?: string[];
  source?: MoodSource;
  focusSessionId?: string;
  /** явно подтверждённые пользователем связи с задачами (uuid[]) */
  linkedTaskIds?: string[];
  /** редактируемое время для manual entry (по умолчанию — сейчас) */
  date?: string;
  timeMin?: number;
}

export const MoodRepository = {
  list(userId: string): MoodLog[] {
    return db.moodsOf(userId);
  },

  /** Добавить запись. Возвращает созданную запись или null, если валидация не прошла. */
  add(userId: string, input: NewMoodInput, linkedTaskIds: string[] = []): MoodLog | null {
    const clean = validateMoodDraft(input);
    if (!clean) return null;
    const now = new Date().toISOString();
    const entry: MoodLog = {
      id: uid(),
      userId,
      date: input.date ?? todayKey(),
      timeMin: input.timeMin ?? nowMin(),
      mood: clean.mood,
      note: clean.note,
      tags: clean.tags,
      linkedTaskIds,
      source: input.source ?? "manual",
      focusSessionId: input.focusSessionId,
      loggedAt: now,
      updatedAt: now,
    };
    db.insertMood(entry);
    return entry;
  },

  /** Обновить запись (состояние/заметка/теги/время). Обновляет updatedAt. */
  update(id: string, patch: Partial<Pick<MoodLog, "mood" | "note" | "tags" | "linkedTaskIds" | "date" | "timeMin">>): void {
    const existing = db.findMood(id);
    if (!existing) return;
    db.updateMood({ ...existing, ...patch, updatedAt: new Date().toISOString() });
  },

  /** Удалить и вернуть запись (для Undo). */
  remove(id: string): MoodLog | null {
    const entry = db.findMood(id) ?? null;
    if (entry) db.removeMood(id);
    return entry;
  },

  /** Восстановить удалённую запись (Undo). */
  restore(entry: MoodLog): void {
    db.insertMood(entry);
  },
};

export const moodTimeLabel = (m: MoodLog): string => minToHM(m.timeMin);
