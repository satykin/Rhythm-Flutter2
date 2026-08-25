/* ============================================================
 * Вкладка «Инсайты» — сохранённые корреляции (Фаза C, §10.3).
 * Read-only: без кнопок feedback и без «Почему я это вижу?» —
 * это Фаза E. Формулировки — наблюдения, не причинность.
 * ============================================================ */

import React from "react";
import { I, type IconName } from "../../../components/icons";
import { useApp } from "../../../state/store";
import { useMoodCorrelations } from "./hooks/useMoodCorrelations";
import { describeCorrelation, signalLabel } from "../domain/correlationService";
import type { CorrelationConfidence, CorrelationDirection } from "../../../lib/types";

const CONFIDENCE_LABEL: Record<CorrelationConfidence, string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

const directionIcon = (d: CorrelationDirection): IconName => (d === "up" ? "arrowRight" : "arrowRight");

export default function InsightsTab() {
  const app = useApp();
  const { correlations, ready } = useMoodCorrelations();

  if (!ready) {
    return <p className="px-2 py-10 text-center text-[13px] font-semibold text-mist-500">Считаем паттерны…</p>;
  }

  if (correlations.length === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-ink-800 text-vio-300">
          <I n="spark" size={22} />
        </span>
        <h3 className="mt-3 font-display text-[15px] font-semibold text-mist-50">Паттерны появятся здесь</h3>
        <p className="mt-1.5 max-w-[360px] text-[12.5px] leading-relaxed text-mist-400">
          Собери чуть больше записей (минимум 7 в группе), и Rhythm покажет, с чем связано твоё настроение. Без магии — только твои данные.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] font-semibold text-mist-500">
        {correlations.length} наблюдений за 30 дней · отсортированы по силе связи
      </p>
      {correlations.map((c) => {
        const up = c.direction === "up";
        return (
          <article key={c.signalKey} className="card anim-rise flex items-start gap-3.5 p-4">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
                up ? "border-aqua-400/25 bg-aqua-400/10 text-aqua-300" : "border-bad/25 bg-bad/10 text-bad"
              }`}
            >
              <I n={directionIcon(c.direction)} size={16} className={up ? "-rotate-45" : "rotate-45"} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-display text-[13.5px] font-bold capitalize text-mist-50">
                  {signalLabel(c.signalKey, app.routines)}
                </span>
                <span className="chip !text-[9px]">n = {c.sampleSize}</span>
                <span className="chip !text-[9px]">надёжность: {CONFIDENCE_LABEL[c.confidence]}</span>
                <span className="chip !text-[9px]">{c.period}</span>
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-mist-300">{describeCorrelation(c, app.routines)}</p>
            </div>
            <div className={`shrink-0 text-right font-display text-[18px] font-bold ${up ? "text-aqua-300" : "text-bad"}`}>
              {c.effectSize > 0 ? "+" : ""}
              {c.effectSize.toFixed(2)}
            </div>
          </article>
        );
      })}
      <p className="pt-1 text-[11px] font-semibold text-mist-600">
        Наблюдения о связи, а не о причине. Данные пересчитываются при изменении записей.
      </p>
    </div>
  );
}
