/* ============================================================
 * Prompt Budget — чистый движок принятия решений (Фаза D).
 *
 * ГЛАВНЫЙ ПРИНЦИП: отделён от механизма доставки. Здесь только
 * ответ на вопрос «можно ли показать промпт прямо сейчас?».
 * Сейчас доставка = in-app карточка; позже push-модуль подключится
 * к этим же функциям, ничего не меняя.
 *
 * Все времена — минуты от полуночи в ЛОКАЛЬНОМ времени пользователя.
 * Функции идемпотентны и не имеют побочных эффектов.
 * ============================================================ */

import type { PromptType } from "../../../lib/types";

export const MAX_PROMPTS_PER_DAY = 2;
/** Минимальный интервал между проактивными промптами, часы (§3, правило 5). */
export const MIN_INTERVAL_HOURS = 4;
/** Ширина окна, в течение которого промпт может быть показан, часы. */
export const PROMPT_WINDOW_HOURS = 3;
/** «Недавний» ручной check-in, подавляющий промпт, часы (правило 7). */
export const RECENT_CHECKIN_HOURS = 4;

export interface PromptSettings {
  morningEnabled: boolean;
  morningTime: number; // мин от полуночи
  eveningEnabled: boolean;
  eveningTime: number;
  quietStart: number;
  quietEnd: number;
  skipIfRecentCheckin: boolean;
}

/** Снимок состояния, нужный для решения (считается из mood_prompt_log и mood_logs). */
export interface BudgetState {
  /** Сколько проактивных промптов показано сегодня (локальный день). */
  proactiveShownToday: number;
  /** Epoch ms последнего показанного промпта (любого дня) или null. */
  lastShownAt: number | null;
  /** Типы, уже «потраченные» сегодня (shown/dismissed/completed) — по одному разу в день. */
  consumedTypesToday: PromptType[];
  /** Epoch ms последнего РУЧНОГО check-in (source='manual') или null. */
  recentManualCheckInAt: number | null;
}

export const DEFAULT_PROMPT_SETTINGS: Omit<PromptSettings, never> = {
  morningEnabled: true,
  morningTime: 8 * 60, // 08:00
  eveningEnabled: false,
  eveningTime: 20 * 60 + 30, // 20:30
  quietStart: 22 * 60, // 22:00
  quietEnd: 8 * 60, // 08:00
  skipIfRecentCheckin: true,
};

/**
 * Внутри ли сейчас тихих часов?
 * quiet может переходить через полночь: если start <= end — диапазон внутри дня,
 * иначе — ночной диапазон (t >= start ИЛИ t < end).
 */
export function isWithinQuietHours(nowMin: number, quietStart: number, quietEnd: number): boolean {
  if (quietStart <= quietEnd) return nowMin >= quietStart && nowMin < quietEnd;
  return nowMin >= quietStart || nowMin < quietEnd;
}

/**
 * Окно показа промпта: [time, time + 3ч].
 * Окно не «переворачивается» через полночь — фактически дополнительно
 * ограничивается тихими часами в canShow.
 */
export function getPromptWindow(type: PromptType, s: PromptSettings): { start: number; end: number } {
  const base = type === "morning" ? s.morningTime : s.eveningTime;
  return { start: base, end: base + PROMPT_WINDOW_HOURS * 60 };
}

const hoursMs = (h: number) => h * 3_600_000;

/**
 * Можно ли показать промпт типа `type` прямо сейчас?
 * Все правила должны выполняться одновременно (§3).
 *
 * @param nowMin   текущее локальное время, минуты от полуночи
 * @param nowEpoch текущий абсолютный момент, epoch ms
 */
export function canShow(
  type: PromptType,
  nowMin: number,
  nowEpoch: number,
  s: PromptSettings,
  state: BudgetState
): boolean {
  // 1. Промпт включён в настройках.
  const enabled = type === "morning" ? s.morningEnabled : s.eveningEnabled;
  if (!enabled) return false;

  // 2. Не внутри тихих часов.
  if (isWithinQuietHours(nowMin, s.quietStart, s.quietEnd)) return false;

  // 3. Внутри окна промпта.
  const w = getPromptWindow(type, s);
  if (nowMin < w.start || nowMin >= w.end) return false;

  // 4. Максимум 2 проактивных в день.
  if (state.proactiveShownToday >= MAX_PROMPTS_PER_DAY) return false;

  // 5. Интервал ≥ 4 часов от последнего показанного промпта.
  if (state.lastShownAt !== null && nowEpoch - state.lastShownAt < hoursMs(MIN_INTERVAL_HOURS)) return false;

  // 6. Один раз в день на тип.
  if (state.consumedTypesToday.includes(type)) return false;

  // 7. Был ручной check-in за последние 4 часа → не показывать.
  if (
    s.skipIfRecentCheckin &&
    state.recentManualCheckInAt !== null &&
    nowEpoch - state.recentManualCheckInAt < hoursMs(RECENT_CHECKIN_HOURS)
  ) {
    return false;
  }

  return true;
}

/**
 * Какой промпт показать сейчас (максимум ОДИН одновременно).
 * Утро приоритетнее вечера — их окна в норме не пересекаются.
 */
export function pickPrompt(
  nowMin: number,
  nowEpoch: number,
  s: PromptSettings,
  state: BudgetState
): PromptType | null {
  if (canShow("morning", nowMin, nowEpoch, s, state)) return "morning";
  if (canShow("evening", nowMin, nowEpoch, s, state)) return "evening";
  return null;
}

/**
 * Вечерний промпт открывает чек-ин с раскрытой заметкой,
 * утренний — без (заметка остаётся опциональной в обоих случаях).
 */
export const promptOpensNote = (type: PromptType): boolean => type === "evening";

/** source записи, создаваемой из промпта. */
export const promptSource = (type: PromptType): "morning" | "evening" => type;
