/* ============================================================
 * useMoodPrompts — планировщик промптов (Фаза D).
 * Пересчитывает canShow: при монтировании, при возврате вкладки в
 * фокус, раз в 60 секунд и при смене дня. Сам механизм доставки
 * (in-app карточка) живёт в MoodPromptCard — здесь только «когда».
 * ============================================================ */

import { useEffect, useRef } from "react";
import { useApp } from "../../../../state/store";
import { todayKey } from "../../../../lib/time";

const REEVAL_INTERVAL_MS = 60_000;

export function useMoodPrompts() {
  const app = useApp();
  const lastDay = useRef<string>(todayKey());
  const ready = app.booted && !!app.user;

  useEffect(() => {
    if (!ready) return;

    const tick = () => {
      /* смена локального дня — сбрасываем «показано сегодня» через пересчёт */
      const now = todayKey();
      if (now !== lastDay.current) lastDay.current = now;
      app.evaluatePrompts();
    };

    /* при монтировании и возврате вкладки в фокус */
    tick();
    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    /* периодический пересчёт */
    const interval = window.setInterval(tick, REEVAL_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [ready, app]);

  return {
    activePrompt: app.activePrompt,
    dismissPrompt: app.dismissPrompt,
    /** Открыть чек-ин из промпта (вечер — с раскрытой заметкой). */
    openPromptCheckIn: (type: "morning" | "evening") =>
      app.openCheckIn(undefined, { source: type, openNote: type === "evening" }),
  };
}
