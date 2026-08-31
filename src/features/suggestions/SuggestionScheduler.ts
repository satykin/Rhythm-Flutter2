/* ============================================================
 * SuggestionScheduler — когда запускать анализ (§7):
 *  • при открытии приложения (полный пересчёт);
 *  • при событиях: создана задача, изменён таймлайн, просрочка;
 *  • ночной пересчёт «золотых часов» (раз в сутки).
 * Хранит дедупликацию «последнего запуска», чтобы не спамить.
 * ============================================================ */

import { nowMin, todayKey } from "../../lib/time";
import { recompute, visible } from "./data/SuggestionRepository";
import type { Suggestion } from "../../lib/types";

const MIN_INTERVAL_MS = 20_000; // не чаще раза в 20 секунд
let lastRun = 0;

export interface SchedulerResult {
  suggestions: Suggestion[];
  recomputed: boolean;
}

/**
 * Запуск анализа. `force` — полный пересчёт (открытие приложения);
 * без force соблюдается интервал (события таймлайна).
 */
export function runScheduler(userId: string, opts: { force?: boolean } = {}): SchedulerResult {
  const now = Date.now();
  const shouldRun = opts.force || now - lastRun >= MIN_INTERVAL_MS;

  if (shouldRun) {
    recompute(userId, nowMin(), todayKey());
    lastRun = now;
  }

  return { suggestions: visible(userId, nowMin()), recomputed: shouldRun };
}

/** Сброс (смена пользователя / выход). */
export function resetScheduler() {
  lastRun = 0;
}
