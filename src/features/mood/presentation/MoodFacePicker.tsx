/* ============================================================
 * MoodFacePicker — переиспользуемая строка из 5 состояний.
 * Используется в Quick Check-In sheet и в post-focus чек-ине
 * (Фаза B), чтобы не дублировать логику выбора.
 *
 * Score никогда не показывается — только лицо + подпись (§2).
 * A11y: role=radiogroup, aria-подписи, hover/long-press — hint.
 * ============================================================ */

import React, { useRef, useState } from "react";
import { MoodFace } from "../../../components/icons";
import { MOOD_STATES, moodHint, moodLabel } from "../domain/moodService";

export default function MoodFacePicker({
  value,
  onChange,
  size = 34,
  showLabels = true,
}: {
  value: number | null;
  onChange: (score: number) => void;
  size?: number;
  showLabels?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const pressTimer = useRef<number | null>(null);

  const startPress = (score: number) => {
    pressTimer.current = window.setTimeout(() => setPressed(score), 350);
  };
  const endPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    setPressed(null);
  };

  const activeScore = hovered ?? pressed ?? value;
  const hint =
    activeScore !== null
      ? `${moodLabel(activeScore)} — ${moodHint(activeScore)}`
      : "Выбери состояние";

  return (
    <div>
      <div className="flex justify-between gap-1.5" role="radiogroup" aria-label="Состояние">
        {MOOD_STATES.map((s) => {
          const selected = value === s.score;
          return (
            <button
              key={s.score}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={s.label}
              title={`${s.label} — ${s.hint}`}
              onClick={() => onChange(s.score)}
              onMouseEnter={() => setHovered(s.score)}
              onMouseLeave={() => setHovered(null)}
              onPointerDown={() => startPress(s.score)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl border py-2 transition-all duration-200 ${
                selected ? "-translate-y-0.5 border-white/20 bg-white/[0.06] shadow-lg" : "border-transparent hover:-translate-y-0.5 hover:bg-white/[0.035]"
              }`}
            >
              <MoodFace level={s.score} size={size} active={selected} />
              {showLabels && (
                <span className={`text-[9px] font-bold ${selected ? "text-mist-200" : "text-mist-500"}`}>{s.label}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 min-h-[16px] text-center text-[11px] font-semibold text-mist-400" aria-live="polite">
        {hint}
      </p>
    </div>
  );
}
