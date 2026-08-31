/* ============================================================
 * Настройки напоминаний (Фаза D, §1).
 * morning / evening вкл-выкл, времена, quiet hours (с переходом
 * через полночь), «не напоминать, если недавно был check-in».
 * Мягкое предупреждение, если вечерний промпт слишком близко к
 * началу тихих часов (окно < 30 мин).
 * ============================================================ */

import React from "react";
import { I } from "../../../components/icons";
import { useApp } from "../../../state/store";
import { hmToMin, minToHM } from "../../../lib/time";

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={`relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors ${on ? "bg-aqua-500" : "bg-ink-600"}`}
    >
      <span
        className={`absolute top-[2.5px] h-[15px] w-[15px] rounded-full bg-white shadow transition-all ${
          on ? "left-[18px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

function TimeField({
  value,
  onChange,
  label,
  disabled,
}: {
  value: number;
  onChange: (min: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
      <span className="w-[76px] text-[12px] font-semibold text-mist-400">{label}</span>
      <input
        type="time"
        className="input !w-auto !py-1 !text-[12.5px]"
        value={minToHM(value)}
        disabled={disabled}
        onChange={(e) => e.target.value && onChange(hmToMin(e.target.value))}
      />
    </label>
  );
}

export default function PromptSettingsPanel() {
  const app = useApp();
  const s = app.promptSettings;
  if (!s) return null;

  const save = app.savePromptSettings;

  /* вечер слишком близко к тихим часам? (окно < 30 мин) */
  const quietStart = s.quietStart;
  const gap = quietStart >= s.eveningTime ? quietStart - s.eveningTime : 24 * 60 - s.eveningTime + quietStart;
  const tooClose = s.eveningEnabled && gap < 30;

  return (
    <div className="space-y-5">
      {/* ---- Утро ---- */}
      <section className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-300/12 text-amber-300">
              <I n="sun" size={16} />
            </span>
            <div>
              <div className="text-[13px] font-bold text-mist-100">Утренний чек-ин</div>
              <div className="text-[11px] text-mist-500">Мягкое напоминание отметить состояние</div>
            </div>
          </div>
          <Switch on={s.morningEnabled} onToggle={() => save({ morningEnabled: !s.morningEnabled })} label="Утренний чек-ин" />
        </div>
        <div className="mt-3 pl-[42px]">
          <TimeField
            label="Напомнить в"
            value={s.morningTime}
            disabled={!s.morningEnabled}
            onChange={(v) => save({ morningTime: v })}
          />
        </div>
      </section>

      {/* ---- Вечер ---- */}
      <section className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ind-400/12 text-ind-400">
              <I n="moon" size={16} />
            </span>
            <div>
              <div className="text-[13px] font-bold text-mist-100">Вечерняя рефлексия</div>
              <div className="text-[11px] text-mist-500">Предложение подвести итог дня</div>
            </div>
          </div>
          <Switch on={s.eveningEnabled} onToggle={() => save({ eveningEnabled: !s.eveningEnabled })} label="Вечерняя рефлексия" />
        </div>
        <div className="mt-3 space-y-2 pl-[42px]">
          <TimeField
            label="Напомнить в"
            value={s.eveningTime}
            disabled={!s.eveningEnabled}
            onChange={(v) => save({ eveningTime: v })}
          />
          {tooClose && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-warn">
              <I n="alert" size={12} /> Вечерний промпт попадает в тихие часы — он может не показаться
            </p>
          )}
        </div>
      </section>

      {/* ---- Тихие часы ---- */}
      <section className="rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/6 text-mist-300">
            <I n="moon" size={16} />
          </span>
          <div>
            <div className="text-[13px] font-bold text-mist-100">Тихие часы</div>
            <div className="text-[11px] text-mist-500">В это время напоминаний нет (может переходить через полночь)</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 pl-[42px]">
          <TimeField label="С" value={s.quietStart} onChange={(v) => save({ quietStart: v })} />
          <TimeField label="До" value={s.quietEnd} onChange={(v) => save({ quietEnd: v })} />
        </div>
      </section>

      {/* ---- Прочее ---- */}
      <section className="flex items-center justify-between rounded-xl border border-white/6 bg-white/[0.02] p-4">
        <div>
          <div className="text-[13px] font-bold text-mist-100">Не напоминать после недавнего чек-ина</div>
          <div className="text-[11px] text-mist-500">Если за последние 4 часа уже была запись</div>
        </div>
        <Switch
          on={s.skipIfRecentCheckin}
          onToggle={() => save({ skipIfRecentCheckin: !s.skipIfRecentCheckin })}
          label="Не напоминать после недавнего чек-ина"
        />
      </section>

      <p className="text-[11px] leading-relaxed text-mist-500">
        Не больше 2 напоминаний в день, с интервалом от 4 часов, и никогда в тихие часы. Пропуск — это нормально.
      </p>
    </div>
  );
}
