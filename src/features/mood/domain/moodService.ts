/* ============================================================
 * Mood Journal 2.1 — доменный слой (чистые функции, без React/DB).
 * Единственный источник истины: UX-спека v2.1.
 *
 * Принципы:
 *  - Настроение — сигнал, а не оценка. Числовой score НИКОГДА
 *    не показывается в UI (только эмодзи + текстовая подпись).
 *  - Детали (заметка, теги) всегда опциональны.
 * ============================================================ */

import type { MoodLog } from "../../../lib/types";

/* ---------- Пять состояний (§5) ---------- */

export interface MoodState {
  /** внутренний score 1..5 — не для показа */
  score: number;
  /** текстовая подпись (показывается) */
  label: string;
  /** описание для hover / long-press */
  hint: string;
}

export const MOOD_STATES: MoodState[] = [
  { score: 1, label: "Тяжело", hint: "Сейчас непросто — это нормально отметить" },
  { score: 2, label: "Не очень", hint: "Ниже обычного, без драмы" },
  { score: 3, label: "Нейтрально", hint: "Ровное, рабочее состояние" },
  { score: 4, label: "Хорошо", hint: "Есть энергия и настроение" },
  { score: 5, label: "Поток / подъём", hint: "На подъёме, всё даётся легко" },
];

export const moodLabel = (score: number): string =>
  MOOD_STATES.find((s) => s.score === score)?.label ?? "Нейтрально";

export const moodHint = (score: number): string =>
  MOOD_STATES.find((s) => s.score === score)?.hint ?? "";

/* ---------- Теги (§7) ---------- */

export const TAG_PRESETS = ["work", "meeting", "exercise", "family", "rest", "sleep", "stress"];
export const MAX_TAGS = 5;
export const NOTE_LIMIT = 500;

/** Нормализация тегов: trim, lowercase, дедупликация, лимит 5. */
export function normalizeTags(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const t = raw.trim().replace(/^#/, "").toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Обрезка заметки до лимита. */
export function clampNote(note: string): string {
  return note.slice(0, NOTE_LIMIT);
}

/* ---------- Валидация записи ---------- */

export interface MoodDraft {
  mood: number;
  note?: string;
  tags?: string[];
}

export interface ValidatedMood {
  mood: number;
  note?: string;
  tags: string[];
}

export function validateMoodDraft(draft: MoodDraft): ValidatedMood | null {
  const mood = Math.round(draft.mood);
  if (!MOOD_STATES.some((s) => s.score === mood)) return null;
  const note = draft.note ? clampNote(draft.note.trim()) : undefined;
  const tags = normalizeTags(draft.tags ?? []);
  return { mood, note: note || undefined, tags };
}

/* ---------- Выборки ---------- */

/** Последняя запись за день (для «состояние сегодня»). */
export function latestMoodOfDay(moods: MoodLog[], date: string): MoodLog | null {
  let best: MoodLog | null = null;
  for (const m of moods) {
    if (m.date !== date) continue;
    if (!best || m.timeMin > best.timeMin || (m.timeMin === best.timeMin && m.loggedAt > best.loggedAt)) best = m;
  }
  return best;
}

/** Сортировка по убыванию времени (новые сверху). */
export function sortDesc(moods: MoodLog[]): MoodLog[] {
  return [...moods].sort(
    (a, b) => b.date.localeCompare(a.date) || b.timeMin - a.timeMin || b.loggedAt.localeCompare(a.loggedAt)
  );
}
