/* ============================================================
 * Диалог переноса при занятом слоте (продуктовый фикс 11).
 * Молча не переносим: показываем, ЧТО занято, и предлагаем
 * ближайшие свободные окна. «Перенести» — ставим в выбранный
 * слот; «Отмена» — ничего не меняем.
 * ============================================================ */

import React, { useState } from "react";
import DialogShell from "../../shared/ui/DialogShell";
import { I } from "../../components/icons";
import { minToHM } from "../../lib/time";
import type { SlotCheckResult, SlotOption } from "./conflicts";

export default function SlotConflictDialog({
  check,
  taskTitle,
  onPick,
  onCancel,
}: {
  /** null → закрыт */
  check: SlotCheckResult | null;
  /** название задачи, которую пытаются поставить */
  taskTitle: string;
  onPick: (slot: SlotOption) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState(0);

  if (!check || check.free) return null;

  const busy = check.colliding[0];
  const extra = check.colliding.length - 1;
  const options = check.proposals;
  const pick = options[Math.min(selected, Math.max(0, options.length - 1))];

  return (
    <DialogShell
      open
      onClose={onCancel}
      title="Это время занято"
      icon="clock"
      width={460}
      testId="slot-conflict-dialog"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onCancel} data-testid="slot-conflict-cancel">
            Отмена
          </button>
          <button
            className="btn btn-primary"
            disabled={!pick}
            onClick={() => pick && onPick(pick)}
            data-testid="slot-conflict-apply"
          >
            <I n="arrowRight" size={14} />
            {pick ? `Перенести на ${minToHM(pick.startMin)}` : "Перенести"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* что занято */}
        <div className="rounded-xl border border-bad/25 bg-bad/[0.06] px-4 py-3">
          <p className="text-[12px] font-bold uppercase tracking-wider text-bad">Занято</p>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bad/12 text-bad">
              <I n="clock" size={15} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-bold text-mist-50">{busy?.title}</p>
              {busy && (
                <p className="text-[12px] font-semibold tabular-nums text-mist-400">
                  {minToHM(busy.startMin)}–{minToHM(busy.endMin)}
                </p>
              )}
            </div>
          </div>
          {extra > 0 && <p className="mt-2 text-[11.5px] font-semibold text-mist-500">и ещё {extra} {extra === 1 ? "задача" : "задачи"} в этом интервале</p>}
        </div>

        {/* куда перенести */}
        {options.length > 0 ? (
          <div>
            <p className="label">
              Перенести «{taskTitle}» на свободное время?
            </p>
            <div className="grid gap-1.5" role="radiogroup" aria-label="Свободные окна">
              {options.map((o, i) => {
                const on = i === Math.min(selected, options.length - 1);
                return (
                  <button
                    key={o.startMin}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setSelected(i)}
                    data-testid="slot-conflict-option"
                    className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition ${
                      on ? "border-vio-400/55 bg-vio-400/10" : "border-white/8 bg-white/[0.02] hover:border-white/18"
                    }`}
                  >
                    <span className={`font-display text-[14px] font-bold tabular-nums ${on ? "text-mist-50" : "text-mist-300"}`}>
                      {minToHM(o.startMin)}–{minToHM(o.endMin)}
                    </span>
                    <span className="flex items-center gap-2">
                      {i === 0 && <span className="chip !text-[9px] !text-aqua-300 !border-aqua-400/40 !bg-aqua-400/10">ближайшее</span>}
                      {on && <I n="check" size={14} className="text-vio-300" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-warn/25 bg-warn/[0.06] px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] font-bold text-warn">
              <I n="info" size={15} /> Свободных окон до конца дня нет
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-mist-400">
              Попробуйте сократить длительность задачи или выбрать другой день.
            </p>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
