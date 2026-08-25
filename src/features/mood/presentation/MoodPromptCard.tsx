/* ============================================================
 * MoodPromptCard — in-app доставка промпта (Фаза D).
 * НЕ модальное окно: неблокирующая карточка на экране Today.
 * Вся логика «когда показывать» — в домене promptBudget;
 * здесь только «как». Reduce Motion → появление через opacity.
 * ============================================================ */

import React from "react";
import { I } from "../../../components/icons";
import type { PromptType } from "../../../lib/types";

const reduceMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function MoodPromptCard({
  type,
  onOpen,
  onDismiss,
}: {
  type: PromptType;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const isMorning = type === "morning";
  const rm = reduceMotion();

  return (
    <div
      role="region"
      aria-label={isMorning ? "Утренний чек-ин" : "Вечерний чек-ин"}
      className={`relative overflow-hidden rounded-2xl border p-4 ${rm ? "anim-fade" : "anim-rise"} ${
        isMorning
          ? "border-amber-300/25 bg-gradient-to-r from-amber-300/[0.10] via-amber-300/[0.04] to-transparent"
          : "border-ind-400/25 bg-gradient-to-r from-ind-400/[0.10] via-vio-400/[0.05] to-transparent"
      }`}
    >
      {/* мягкое свечение */}
      <div
        className={`pointer-events-none absolute -top-10 -left-8 h-28 w-28 rounded-full blur-2xl ${
          isMorning ? "bg-amber-300/15" : "bg-ind-400/15"
        }`}
      />

      {/* крестик = «Не сейчас» */}
      <button
        className="iconbtn absolute right-2.5 top-2.5 !h-7 !w-7"
        onClick={onDismiss}
        aria-label="Не сейчас"
        title="Не сейчас"
      >
        <I n="x" size={13} />
      </button>

      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            isMorning ? "bg-amber-300/15 text-amber-300" : "bg-ind-400/15 text-ind-400"
          }`}
        >
          <I n={isMorning ? "sun" : "moon"} size={20} sw={1.8} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold tracking-tight text-mist-50">
            {isMorning ? "Как ты этим утром?" : "Как прошёл день?"}
          </p>
          <p className="mt-0.5 text-[12px] font-semibold text-mist-400">
            {isMorning ? "Пара секунд, чтобы настроить день под себя" : "Хочешь добавить пару слов?"}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            className={`btn ${isMorning ? "btn-primary" : "btn-primary"} !px-4 !py-2 !text-[12.5px]`}
            onClick={onOpen}
          >
            {isMorning ? "Записать" : "Поразмышлять"}
          </button>
          <button className="btn btn-ghost !px-3 !py-2 !text-[12.5px]" onClick={onDismiss}>
            Не сейчас
          </button>
        </div>
      </div>
    </div>
  );
}
