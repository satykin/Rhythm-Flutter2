/* ============================================================
 * Smart Suggestions Engine — доменные типы (спека v1.0, §2/§6/§8).
 * ============================================================ */

import type { Task } from "../../../lib/types";

/** Таксономия подсказок (§2) — 8 типов. */
export type SuggestionKind =
  | "golden_hour"
  | "best_time"
  | "duration"
  | "reschedule"
  | "overload"
  | "break_down"
  | "briefing_am"
  | "briefing_pm";

/** Жизненный цикл (§6): CREATED → SHOWN → ACCEPTED | DISMISSED | SNOOZED | EXPIRED. */
export type SuggestionState = "created" | "shown" | "accepted" | "dismissed" | "snoozed" | "expired";

/** Контекст подсказки — что именно предлагаем. */
export interface SuggestionContext {
  taskId?: string;
  date?: string;
  startMin?: number;
  endMin?: number;
  /** для best_time / reschedule — предлагаемое время */
  proposedDate?: string;
  proposedStartMin?: number;
  /** для break_down — предлагаемые подзадачи */
  subtasks?: { title: string; durationMin: number }[];
  /** для duration — оценка в минутах */
  estimatedMin?: number;
  /** для overload — суммарно запланировано минут */
  scheduledMin?: number;
}

/** Кандидат, который генерирует движок (до персиста и правил частоты). */
export interface SuggestionCandidate {
  kind: SuggestionKind;
  title: string;
  body: string;
  context: SuggestionContext;
  /** приоритет 1..10 — база для ранкера */
  priority: number;
  /** TTL в минутах (golden_hour истекает с окном) */
  ttlMin?: number;
  dedupKey: string;
}

/** Персистентная модель (таблица suggestions, §8). */
export interface SuggestionRecord {
  id: string;
  userId: string;
  kind: SuggestionKind;
  title: string;
  body: string;
  context: SuggestionContext;
  priority: number;
  state: SuggestionState;
  shownAt?: number;
  expiresAt?: number;
  snoozeUntil?: number;
  dedupKey: string;
  createdAt: number;
}

/** Обратная связь для обучения (§4.7, таблица suggestion_feedback). */
export interface FeedbackRecord {
  id: string;
  userId: string;
  suggestionId: string;
  kind: SuggestionKind;
  action: "accepted" | "dismissed" | "snoozed";
  createdAt: number;
}

/** Агрегированный продуктивный слот (§8, user_productivity_slots). */
export interface ProductivitySlotRecord {
  userId: string;
  slotIndex: number; // 0..47
  score: number;
  computedAt: number;
}

/** Сигналы, которые движок получает из данных (§3). */
export interface EngineSignals {
  tasks: Task[];
  /** минуты фокуса по 48 слотам (focus_sessions) */
  focusBySlot: number[];
  /** прерванные сессии по 48 слотам */
  abortedBySlot: number[];
  /** время бодрствования (из профиля) */
  wakingFrom: number;
  wakingTo: number;
}

/** Вес типа для обучения (§4.7) — хранится per-user. */
export type KindWeights = Partial<Record<SuggestionKind, number>>;

/** Правила частоты (§6) — анти-спам. */
export interface FrequencyRules {
  maxActive: number; // макс активных одновременно
  dailyShownLimit: number; // дневной лимит показов
  quietFrom: number; // тихие часы (минуты)
  quietTo: number;
  cooldownForTaskHours: number; // одна задача → не чаще раза в N часов
}

export const DEFAULT_RULES: FrequencyRules = {
  maxActive: 3,
  dailyShownLimit: 5,
  quietFrom: 22 * 60,
  quietTo: 8 * 60,
  cooldownForTaskHours: 24,
};
