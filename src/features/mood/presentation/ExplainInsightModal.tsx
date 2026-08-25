/* ============================================================
 * ExplainInsightModal — «Почему я это вижу?» (Фаза E, §5).
 * Показывает объясняемые данные, уже сохранённые в
 * user_mood_correlations: сигнал, метод, baseline, эффект,
 * выборку, период + дисклеймер «наблюдение, не причина».
 * Доступный диалог (Modal: Esc, focus, aria).
 * ============================================================ */

import React from "react";
import { Modal } from "../../../components/ui";
import { I } from "../../../components/icons";
import type { MoodCorrelation } from "../../../lib/types";
import { periodLabel } from "../domain/insights";
import { signalLabel } from "../domain/correlationService";
import type { Routine } from "../../../lib/types";

const CONFIDENCE_LABEL: Record<MoodCorrelation["confidence"], string> = {
  high: "высокая",
  medium: "средняя",
  low: "низкая",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/5 py-2 last:border-0">
      <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-wider text-mist-500">{label}</span>
      <span className="text-right text-[13px] font-semibold text-mist-100">{value}</span>
    </div>
  );
}

export default function ExplainInsightModal({
  correlation,
  routines,
  onClose,
}: {
  correlation: MoodCorrelation | null;
  routines: Routine[];
  onClose: () => void;
}) {
  if (!correlation) return null;

  const c = correlation;
  const isNumeric = c.signalType === "numeric";
  const method = isNumeric
    ? "Посмотрели связь двух величин по дням (коэффициент корреляции Пирсона)."
    : "Сравнили твоё состояние в такие дни с твоим обычным состоянием (медиана).";

  const effect = c.effectSize;
  const effectText = isNumeric
    ? `r = ${effect.toFixed(2)} (${Math.abs(effect) >= 0.5 ? "заметная связь" : "умеренная связь"})`
    : `${effect > 0 ? "+" : ""}${effect.toFixed(2)} пункта к обычному состоянию`;

  return (
    <Modal open={!!correlation} onClose={onClose} title="Почему я это вижу?" icon="info" width={460}>
      <div className="space-y-1">
        <Row label="Сигнал" value={signalLabel(c.signalKey, routines)} />
        <Row label="Тип" value={isNumeric ? "числовой" : "категориальный"} />
        <Row label="Метод" value={<span className="block max-w-[280px] text-[12px] leading-snug">{method}</span>} />
        <Row label="Обычное состояние" value={`${c.baseline.toFixed(1)} из 5`} />
        <Row label="Размер эффекта" value={effectText} />
        <Row label="Наблюдений" value={c.sampleSize} />
        <Row label="Период" value={periodLabel(c.period)} />
        <Row label="Уверенность" value={CONFIDENCE_LABEL[c.confidence]} />
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-warn/20 bg-warn/10 px-3 py-2.5">
        <I n="alert" size={15} className="mt-0.5 shrink-0 text-warn" />
        <p className="text-[12px] leading-relaxed text-mist-300">
          Это наблюдение, а не доказательство причины. Данные пересчитываются при изменении записей.
        </p>
      </div>
    </Modal>
  );
}
