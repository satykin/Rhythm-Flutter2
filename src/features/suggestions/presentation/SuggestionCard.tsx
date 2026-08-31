/* ============================================================
 * SuggestionCard (§5) — единая карточка подсказки.
 * Иконка типа + заголовок + тело + действия Принять/Отклонить/Позже.
 * Появление: slide-up + fade 300ms (anim-rise).
 * ============================================================ */

import React from "react";
import { I, IconName } from "../../../components/icons";
import { minToHM } from "../../../lib/time";
import type { Suggestion, SuggestionKind } from "../../../lib/types";

const KIND_ICON: Record<SuggestionKind, IconName> = {
  golden_hour: "bolt",
  best_time: "clock",
  duration: "timer",
  reschedule: "refresh",
  overload: "alert",
  break_down: "layers",
  briefing_am: "sun",
  briefing_pm: "moon",
};

const KIND_LABEL: Record<SuggestionKind, string> = {
  golden_hour: "Золотое время",
  best_time: "Лучшее время",
  duration: "Оценка времени",
  reschedule: "Умный перенос",
  overload: "Перегруз",
  break_down: "Разбить задачу",
  briefing_am: "Брифинг",
  briefing_pm: "Итоги дня",
};

export default function SuggestionCard({
  s,
  onAccept,
  onDismiss,
  onSnooze,
}: {
  s: Suggestion;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
}) {
  const timeHint =
    s.context.proposedStartMin !== undefined
      ? minToHM(s.context.proposedStartMin)
      : s.context.startMin !== undefined
        ? minToHM(s.context.startMin)
        : null;

  return (
    <div className="anim-rise relative overflow-hidden rounded-xl border border-vio-400/22 bg-gradient-to-br from-vio-400/[0.07] via-ind-400/[0.04] to-transparent p-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-vio-400/14 text-vio-300">
          <I n={KIND_ICON[s.kind]} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[13px] font-bold text-mist-50">{s.title}</span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-mist-300">
            {s.body}
            {timeHint && <b className="text-aqua-300"> {timeHint}</b>}
          </p>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              onClick={() => onAccept(s.id)}
              className="btn btn-primary !px-2.5 !py-1 !text-[11px]"
            >
              <I n="check" size={11} sw={2.6} /> Принять
            </button>
            <button
              onClick={() => onDismiss(s.id)}
              className="btn btn-ghost !px-2 !py-1 !text-[11px]"
              title="Отклонить"
            >
              <I n="x" size={11} /> Отклонить
            </button>
            <button
              onClick={() => onSnooze(s.id)}
              className="iconbtn !h-6 !w-6"
              title="Отложить на 2 часа"
            >
              <I n="clock" size={12} />
            </button>
            <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-mist-500">
              {KIND_LABEL[s.kind]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
