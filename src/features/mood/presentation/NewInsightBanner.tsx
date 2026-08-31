/* ============================================================
 * NewInsightBanner — мягкое проактивное появление (Фаза E, §8).
 * Неблокирующая закрываемая карточка вверху Журнала, когда есть
 * НОВЫЙ инсайт (пройден гейт 3 дней). Только внутри экранов
 * настроения. НЕ входит в Prompt Budget Фазы D.
 *
 * Здесь мы НЕ логируем 'shown' — это делает вкладка «Инсайты».
 * Баннер лишь мягко подсвечивает, что наблюдение готово.
 * ============================================================ */

import React, { useMemo, useState } from "react";
import { I } from "../../../components/icons";
import { useApp } from "../../../state/store";
import { db } from "../../../lib/db";
import { getActiveInsights, describeInsight } from "../domain/insights";

export default function NewInsightBanner() {
  const app = useApp();
  const userId = app.user?.id ?? null;
  const [hidden, setHidden] = useState(false);

  /* топ-1 новый кандидат (без побочных эффектов) */
  const fresh = useMemo(() => {
    if (!userId) return null;
    const correlations = db.correlationsOf(userId);
    const feedback = db.insightFeedbackOf(userId);
    if (!correlations.length) return null;
    const { fresh } = getActiveInsights(Date.now(), correlations, feedback);
    if (!fresh.length) return null;
    const habitNames = new Map(app.routines.map((r) => [r.id, r.title]));
    const top = fresh[0];
    const text = describeInsight(top, top.signalKey.startsWith("habit:") ? habitNames.get(top.signalKey.slice(6)) : undefined);
    return text;
  }, [userId, app.routines, app.moods, app.tasks, app.focusSessions]);

  if (hidden || !fresh) return null;

  return (
    <div className="anim-rise relative overflow-hidden rounded-[14px] border border-aqua-400/25 bg-gradient-to-r from-aqua-400/[0.08] via-ind-400/[0.05] to-transparent px-4 py-3.5">
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-aqua-400/10 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-aqua-400/15 text-aqua-300">
          <I n="spark" size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[13px] font-bold text-mist-50">Новое наблюдение готово</span>
            <span className="chip !text-[9px] !text-aqua-300 !border-aqua-400/25 !bg-aqua-400/10">инсайт</span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-mist-300">{fresh.body}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn btn-aqua !px-3 !py-1 !text-[11.5px]" onClick={() => app.setTab("mood")}>
              <I n="chart" size={12} /> Открыть обзор
            </button>
            <button className="btn btn-ghost !px-2.5 !py-1 !text-[11.5px]" onClick={() => setHidden(true)}>
              Позже
            </button>
          </div>
        </div>
        <button
          className="iconbtn !h-7 !w-7 shrink-0"
          onClick={() => setHidden(true)}
          aria-label="Скрыть баннер"
        >
          <I n="x" size={14} />
        </button>
      </div>
    </div>
  );
}
