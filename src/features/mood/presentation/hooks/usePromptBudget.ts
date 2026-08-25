/* ============================================================
 * usePromptBudget — доступ к настройкам и состоянию бюджета.
 * Инкапсулирует чтение mood_prompt_settings и подсчёт BudgetState
 * из mood_prompt_log; сам ничего не показывает (доставка — отдельно).
 * ============================================================ */

import { useCallback } from "react";
import { useApp } from "../../../../state/store";
import { MoodPromptRepository } from "../../data/MoodPromptRepository";
import type { BudgetState, PromptSettings } from "../../domain/promptBudget";
import type { MoodPromptSettings } from "../../../../lib/types";

export function usePromptBudget() {
  const app = useApp();
  const userId = app.user?.id ?? null;

  const settings: MoodPromptSettings | null = app.promptSettings;

  const toPromptSettings = useCallback(
    (s: MoodPromptSettings): PromptSettings => MoodPromptRepository.toPromptSettings(s),
    []
  );

  /** Свежий снимок состояния бюджета (для ручных проверок/отладки). */
  const computeState = useCallback((): BudgetState | null => {
    if (!userId) return null;
    return MoodPromptRepository.computeBudgetState(userId, Date.now());
  }, [userId]);

  const save = useCallback(
    (patch: Partial<Omit<MoodPromptSettings, "userId" | "updatedAt">>) => app.savePromptSettings(patch),
    [app]
  );

  return { settings, toPromptSettings, computeState, save };
}
