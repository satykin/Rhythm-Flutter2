/* ============================================================
 * Вкладка «Инсайты» (Фаза E, §7).
 * До 3 карточек-наблюдений с обратной связью и объяснимостью.
 * Корреляции читаются из хранилища Фазы C — НЕ пересчитываются.
 * ============================================================ */

import React, { useState } from "react";
import { I } from "../../../components/icons";
import { useApp } from "../../../state/store";
import { useMoodInsights } from "./hooks/useMoodInsights";
import InsightCard from "./InsightCard";
import ExplainInsightModal from "./ExplainInsightModal";
import type { MoodCorrelation } from "../../../lib/types";

export default function InsightsTab() {
  const app = useApp();
  const { ready, insights, totalCorrelations, freeSlots, accept, dismiss, explainOpened } = useMoodInsights();
  const [explainFor, setExplainFor] = useState<MoodCorrelation | null>(null);

  if (!ready) {
    return <p className="px-2 py-10 text-center text-[13px] font-semibold text-mist-500">Считаем паттерны…</p>;
  }

  /* Нет ни одной корреляции — спокойное онбординг-состояние без давления. */
  if (totalCorrelations === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-ink-800 text-vio-300">
          <I n="spark" size={22} />
        </span>
        <h3 className="mt-3 font-display text-[15px] font-semibold text-mist-50">Наблюдения появятся здесь</h3>
        <p className="mt-1.5 max-w-[360px] text-[12.5px] leading-relaxed text-mist-400">
          Собери чуть больше записей (минимум 7 в группе), и Rhythm покажет, с чем связано твоё настроение.
          Без магии — только твои данные.
        </p>
      </div>
    );
  }

  const handleExplain = (signalKey: string) => {
    explainOpened(signalKey);
    const c = insights.find((i) => i.correlation.signalKey === signalKey)?.correlation ?? null;
    setExplainFor(c);
  };

  return (
    <div className="space-y-3">
      <p className="text-[12px] font-semibold text-mist-500">
        {insights.length > 0
          ? `${insights.length} из ${totalCorrelations} наблюдений · максимум 3 активных`
          : `${totalCorrelations} наблюдений сохранено`}
      </p>

      {insights.map((view) => (
        <InsightCard
          key={view.correlation.signalKey}
          view={view}
          onAccept={accept}
          onDismiss={dismiss}
          onExplain={handleExplain}
        />
      ))}

      {insights.length === 0 && (
        <p className="px-2 py-6 text-center text-[12.5px] font-semibold text-mist-500">
          Сейчас нет активных наблюдений — отклонённые вернутся через 14 дней.
        </p>
      )}

      {freeSlots > 0 && insights.length > 0 && (
        <p className="pt-1 text-center text-[11px] font-semibold text-mist-600">
          Больше наблюдений появится по мере сбора данных.
        </p>
      )}

      <p className="pt-1 text-[11px] font-semibold text-mist-600">
        Наблюдения о связи, а не о причине. Данные пересчитываются при изменении записей.
      </p>

      <ExplainInsightModal correlation={explainFor} routines={app.routines} onClose={() => setExplainFor(null)} />
    </div>
  );
}
