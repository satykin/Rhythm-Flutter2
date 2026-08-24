/* ============================================================
 * SuggestionSurface — верхняя подсказка на Today-экране + SmartTray.
 * «Принять» диспетчеризуется по типу (§5, §6).
 * ============================================================ */

import React, { useState } from "react";
import { I } from "../../../components/icons";
import { useApp } from "../../../state/store";
import { minToHM, todayKey, snap, clamp } from "../../../lib/time";
import type { Suggestion } from "../../../lib/types";
import SuggestionCard from "./SuggestionCard";
import SmartTray from "./SmartTray";
import { useSuggestions } from "./hooks/useSuggestions";

export default function SuggestionSurface({
  onPlan,
}: {
  onPlan: (startMin: number, endMin: number) => void;
}) {
  const app = useApp();
  const { active, top, accept, dismiss, snooze } = useSuggestions();
  const [tray, setTray] = useState(false);

  const handleAccept = (s: Suggestion) => {
    accept(s.id);
    switch (s.kind) {
      case "golden_hour": {
        const start = s.context.startMin ?? snap(new Date().getHours() * 60 + 30, 30);
        const end = s.context.endMin ?? start + 60;
        onPlan(start, end);
        break;
      }
      case "best_time": {
        const start = s.context.proposedStartMin ?? 15 * 60;
        onPlan(start, start + 60);
        break;
      }
      case "reschedule": {
        const n = app.applyReschedule();
        app.toast("success", n ? `Перенесено ${n} задач(и)` : "Свободных окон не нашлось");
        break;
      }
      case "overload": {
        app.toast("info", "Загляни в таймлайн — Rhythm подсветил вечер как свободный");
        break;
      }
      case "break_down": {
        const subtasks = s.context.subtasks ?? [];
        const base = s.context.startMin ?? 10 * 60;
        let cursor = base;
        for (const st of subtasks) {
          app.addTask({
            title: st.title, description: "", date: todayKey(),
            startMin: cursor, endMin: clamp(cursor + st.durationMin, cursor + 15, 23 * 60),
            color: "indigo", icon: "target", tags: [], energy: "medium",
          });
          cursor += st.durationMin;
        }
        app.toast("success", `Задача разбита на ${subtasks.length} шага`);
        break;
      }
      case "duration":
      case "briefing_am":
      case "briefing_pm":
      default:
        break;
    }
  };

  if (!top && active.length === 0) return null;

  return (
    <>
      <div className="anim-rise space-y-2">
        {top && (
          <SuggestionCard
            s={top}
            onAccept={(id) => handleAccept(active.find((x) => x.id === id) ?? top)}
            onDismiss={dismiss}
            onSnooze={snooze}
          />
        )}
        {active.length > 1 && (
          <button
            onClick={() => setTray(true)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-white/8 bg-white/[0.02] py-1.5 text-[11px] font-bold text-mist-400 transition hover:bg-white/[0.05] hover:text-mist-200"
          >
            <I n="spark" size={12} /> Ещё {active.length - 1} подсказк{active.length - 1 === 1 ? "а" : "и"} — открыть трей
          </button>
        )}
      </div>
      <SmartTray open={tray} onClose={() => setTray(false)} />
    </>
  );
}

export { minToHM };
