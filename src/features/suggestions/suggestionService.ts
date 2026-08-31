/* ============================================================
 * Legacy-фасад поверх нового доменного слоя (domain/).
 * Оставлен для совместимости InsightsScreen / JournalScreen / notify.
 * Новая логика — в domain/SuggestionEngine, domain/ranker и т.д.
 * ============================================================ */

import type { FocusSession, Task } from "../../lib/types";
import { productivityWindows as windowsFromScores, scoreSlots } from "./domain/productivity";
import type { ProductivityWindow } from "./domain/productivity";

export { pearson, focusByWeek } from "./domain/stats";
export type { ProductivityWindow } from "./domain/productivity";

/** Совместимая со старой сигнатурой обёртка: окна продуктивности из задач. */
export function productivityWindows(tasks: Task[], sessions: FocusSession[] = []): ProductivityWindow[] {
  return windowsFromScores(scoreSlots(tasks, sessions));
}
