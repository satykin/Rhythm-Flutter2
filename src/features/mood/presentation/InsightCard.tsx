/* ============================================================
 * InsightCard — карточка инсайта-наблюдения (Фаза E, §4).
 * Иконка типа сигнала, текст-наблюдение, бейджи (период · выборка ·
 * уверенность), обратная связь [ Это полезно ] / [ Не показывать ],
 * ссылка «Почему я это вижу?». Формулировки — только наблюдения.
 * ============================================================ */

import React from "react";
import { I, type IconName } from "../../../components/icons";
import type { MoodCorrelation } from "../../../lib/types";
import { periodLabel } from "../domain/insights";
import type { InsightView } from "./hooks/useMoodInsights";

const CONFIDENCE_LABEL: Record<MoodCorrelation["confidence"], string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

/** Иконка по типу сигнала. */
function signalIcon(signalKey: string): IconName {
  if (signalKey.startsWith("tag:")) return "tag";
  if (signalKey.startsWith("weekday:")) return "calendar";
  if (signalKey.startsWith("habit:")) return "flame";
  if (signalKey === "num:focus_minutes") return "timer";
  if (signalKey === "num:tasks_completed") return "check";
  return "spark";
}

export default function InsightCard({
  view,
  onAccept,
  onDismiss,
  onExplain,
}: {
  view: InsightView;
  onAccept: (signalKey: string) => void;
  onDismiss: (signalKey: string) => void;
  onExplain: (signalKey: string) => void;
}) {
  const c = view.correlation;
  const up = c.direction === "up";
  const icon = signalIcon(c.signalKey);

  return (
    <article
      className="card anim-rise p-4"
      aria-label={`Наблюдение: ${view.text.title}`}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
            up ? "border-aqua-400/25 bg-aqua-400/10 text-aqua-300" : "border-bad/25 bg-bad/10 text-bad"
          }`}
          aria-hidden="true"
        >
          <I n={icon} size={17} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[13px] font-bold text-mist-50">{view.text.title}</span>
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${up ? "bg-aqua-400" : "bg-bad"}`}
              aria-label={up ? "состояние выше обычного" : "состояние ниже обычного"}
            />
          </div>

          <p className="mt-1 text-[12.5px] leading-relaxed text-mist-300">{view.text.body}</p>

          {/* бейджи: период · выборка · уверенность */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span className="chip !text-[9.5px]">{periodLabel(c.period)}</span>
            <span className="chip !text-[9.5px]">{c.sampleSize} наблюдений</span>
            <span className="chip !text-[9.5px]">
              уверенность: {CONFIDENCE_LABEL[c.confidence]}
            </span>
          </div>

          {/* действия */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {view.accepted ? (
              <span className="chip !border-ok/30 !bg-ok/10 !text-[10px] !text-ok">
                <I n="check" size={11} /> Отмечено как полезное
              </span>
            ) : (
              <>
                <button className="btn btn-soft !px-2.5 !py-1 !text-[11px]" onClick={() => onAccept(c.signalKey)}>
                  <I n="check" size={12} sw={2.4} /> Это полезно
                </button>
                <button className="btn btn-ghost !px-2.5 !py-1 !text-[11px]" onClick={() => onDismiss(c.signalKey)}>
                  <I n="x" size={11} /> Не показывать
                </button>
              </>
            )}
            <button
              className="ml-auto inline-flex items-center gap-1 text-[11px] font-bold text-mist-400 underline-offset-2 transition hover:text-vio-300 hover:underline"
              onClick={() => onExplain(c.signalKey)}
            >
              <I n="info" size={12} /> Почему я это вижу?
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
