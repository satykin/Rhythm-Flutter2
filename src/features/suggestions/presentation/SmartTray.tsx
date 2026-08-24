/* ============================================================
 * SmartTray (§5) — bottom sheet со всеми активными подсказками.
 * Открывается кнопкой из Today-экрана.
 * ============================================================ */

import React from "react";
import { I } from "../../../components/icons";
import { Modal } from "../../../components/ui";
import SuggestionCard from "./SuggestionCard";
import { useSuggestions } from "./hooks/useSuggestions";

export default function SmartTray({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { active, accept, dismiss, snooze } = useSuggestions();

  return (
    <Modal open={open} onClose={onClose} title="Умные подсказки" icon="spark" width={520}>
      {active.length === 0 ? (
        <div className="py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-ink-800 text-mist-400">
            <I n="check" size={20} />
          </div>
          <p className="mt-3 text-[13px] font-semibold text-mist-200">Всё под контролем</p>
          <p className="mt-1 text-[12px] text-mist-500">Новые подсказки появятся, когда Rhythm заметит возможность.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((s) => (
            <SuggestionCard key={s.id} s={s} onAccept={accept} onDismiss={dismiss} onSnooze={snooze} />
          ))}
          <p className="pt-1 text-center text-[10.5px] font-semibold text-mist-500">
            Подсказки учатся на твоих ответах: «Принять» усиливает тип, «Отклонить» — ослабляет.
          </p>
        </div>
      )}
    </Modal>
  );
}
