/* ============================================================
 * useSuggestions — доступ к активным подсказкам и действиям.
 * Тонкая обёртка над стором (состояние уже синхронизировано).
 * ============================================================ */

import { useMemo } from "react";
import { useApp } from "../../../../state/store";

export function useSuggestions() {
  const app = useApp();

  const active = useMemo(() => app.suggestions, [app.suggestions]);
  const top = active[0] ?? null;

  return {
    active,
    top,
    accept: app.acceptSuggestion,
    dismiss: app.dismissSuggestion,
    snooze: app.snoozeSuggestion,
  };
}
