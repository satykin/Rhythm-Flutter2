import React from "react";
import { I, IconName } from "../../components/icons";
import { useApp } from "../../state/store";
import { minToHM } from "../../lib/time";

/* Баннер умных подсказок на главном экране.
 * Приоритет: reschedule > golden_time > rest_window. */

const TYPE_ICON: Record<string, IconName> = {
  golden_time: "bolt",
  reschedule: "refresh",
  rest_window: "coffee",
  procrastination: "alert",
  new_task_time: "spark",
};

export default function SuggestionBanner({ onPlan }: { onPlan: (startMin: number, endMin: number) => void }) {
  const app = useApp();
  const s = [...app.suggestions].sort((a, b) => rank(a.type) - rank(b.type))[0];
  if (!s) return null;

  const accept = () => {
    if (s.type === "reschedule") {
      const n = app.applyReschedule();
      app.acceptSuggestion(s.id);
      app.toast("success", n ? `Перенесено ${n} задач(и) на продуктивные окна` : "Свободных окон не нашлось");
    } else if (s.type === "golden_time") {
      app.acceptSuggestion(s.id);
      onPlan(s.context.startMin ?? 600, s.context.endMin ?? 690);
    } else if (s.type === "rest_window") {
      app.addTask({
        title: "Прогулка", description: "Короткий выход — восстанавливает фокус",
        date: s.context.date ?? new Date().toISOString().slice(0, 10),
        startMin: s.context.startMin ?? 810,
        endMin: s.context.endMin ?? 830,
        color: "aqua", icon: "coffee", tags: ["отдых"], energy: "low",
      });
      app.acceptSuggestion(s.id);
      app.toast("success", "Прогулка добавлена в план");
    } else {
      app.acceptSuggestion(s.id);
    }
  };

  return (
    <div className="anim-rise relative overflow-hidden rounded-[14px] border border-vio-400/25 bg-gradient-to-r from-vio-400/[0.09] via-ind-400/[0.06] to-aqua-400/[0.07] px-4 py-3.5">
      <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-vio-400/12 blur-2xl" />
      <div className="relative flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-vio-400/15 text-vio-300">
          <I n={TYPE_ICON[s.type] ?? "spark"} size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-display text-[13.5px] font-bold text-mist-50">{s.title}</span>
            <span className="chip !text-[9px] !text-vio-300 !border-vio-400/25 !bg-vio-400/10">Rhythm AI</span>
          </div>
          <p className="mt-0.5 text-[12px] leading-relaxed text-mist-300">
            {s.detail}
            {s.context.startMin !== undefined && s.type !== "golden_time" && (
              <b className="text-aqua-300"> {minToHM(s.context.startMin)}</b>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn btn-primary !px-3 !py-1 !text-[11.5px]" onClick={accept}>
              <I n="check" size={12} sw={2.6} />
              {s.type === "golden_time" ? "Задача в это окно" : s.type === "reschedule" ? "Перенести" : "Добавить"}
            </button>
            <button className="btn btn-ghost !px-2.5 !py-1 !text-[11.5px]" onClick={() => app.snoozeSuggestion(s.id)} title="Напомнить через 2 часа">
              <I n="clock" size={12} /> Позже
            </button>
            <button className="btn btn-ghost !px-2.5 !py-1 !text-[11.5px]" onClick={() => app.dismissSuggestion(s.id)} title="Скрыть подсказку">
              <I n="x" size={12} /> Скрыть
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function rank(type: string): number {
  return type === "reschedule" ? 0 : type === "golden_time" ? 1 : 2;
}
