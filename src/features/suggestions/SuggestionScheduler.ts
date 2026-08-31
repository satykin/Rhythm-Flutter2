/* ============================================================
 * SuggestionScheduler — когда запускать анализ (§7):
 *  • при открытии приложения (полный пересчёт);
 *  • при событиях: создана задача, изменён таймлайн, просрочка.
 * Пересчёт «золотых часов» раз в сутки выполняется внутри recompute
 * через ensureSlots (см. SuggestionRepository) — планировщик лишь
 * регулярно даёт ему ход. В будущем пересчёт можно перенести на
 * pg_cron + Supabase edge function.
 * Хранит дедупликацию «последнего запуска», чтобы не спамить.
 * ============================================================ */

import { nowMin, todayKey } from "../../lib/time";
import { recompute, visible } from "./data/SuggestionRepository";
import type { Suggestion } from "../../lib/types";

const MIN_INTERVAL_MS = 20_000; // не чаще раза в 20 секунд
let lastRun = 0;

/**
 * Запуск анализа. `force` — полный пересчёт (открытие приложения);
 * без force соблюдается интервал (события таймлайна).
 */
export function runScheduler(userId: string, opts: { force?: boolean } = {}): Suggestion[] {
  const now = Date.now();
  const shouldRun = opts.force || now - lastRun >= MIN_INTERVAL_MS;

  if (shouldRun) {
    recompute(userId, nowMin(), todayKey());
    lastRun = now;
  }

  return visible(userId, nowMin());
}

/** Сброс (смена пользователя / выход). */
export function resetScheduler() {
  lastRun = 0;
}
