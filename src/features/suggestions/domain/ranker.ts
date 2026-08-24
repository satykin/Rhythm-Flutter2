/* ============================================================
 * Ранкер (§4.7): итоговый вес = priority × learned_weight.
 * Обучение на реакциях: accepted ↑, dismissed ↓, snoozed чуть ↓.
 * Чистые функции над весами и фидбеком.
 * ============================================================ */

import type { FeedbackRecord, KindWeights, SuggestionCandidate } from "./types";

const BASE_WEIGHT = 1;
const MIN_WEIGHT = 0.1;
const MAX_WEIGHT = 2.5;

/** Дельта веса за одно действие (§4.7). */
export function weightDelta(action: FeedbackRecord["action"]): number {
  switch (action) {
    case "accepted":
      return +0.25;
    case "dismissed":
      return -0.3;
    case "snoozed":
      return -0.1;
  }
}

/** Применяет фидбек к весам, возвращая новую карту (immutable). */
export function applyFeedback(weights: KindWeights, feedback: FeedbackRecord[]): KindWeights {
  const next: KindWeights = { ...weights };
  for (const fb of feedback) {
    const cur = next[fb.kind] ?? BASE_WEIGHT;
    next[fb.kind] = clamp(cur + weightDelta(fb.action));
  }
  return next;
}

const clamp = (w: number) => Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, w));

/** Итоговый score кандидата = priority × learned_weight. */
export function score(candidate: SuggestionCandidate, weights: KindWeights): number {
  const w = weights[candidate.kind] ?? BASE_WEIGHT;
  return candidate.priority * w;
}

/** Сортирует кандидатов по убыванию итогового score. */
export function rank(candidates: SuggestionCandidate[], weights: KindWeights): SuggestionCandidate[] {
  return [...candidates].sort((a, b) => score(b, weights) - score(a, weights));
}

/**
 * Замолчать тип на 7 дней, если он отклонён 3 раза подряд (§4.7).
 * Возвращает набор «замолчанных» типов.
 */
export function mutedKinds(feedback: FeedbackRecord[], windowDays = 7): Set<string> {
  const muted = new Set<string>();
  const cutoff = Date.now() - windowDays * 24 * 3600 * 1000;
  const recent = feedback.filter((f) => f.createdAt >= cutoff);

  const byKind = new Map<string, FeedbackRecord[]>();
  for (const f of recent) {
    byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
  }
  for (const [kind, list] of byKind) {
    const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
    const last3 = sorted.slice(0, 3);
    if (last3.length === 3 && last3.every((f) => f.action === "dismissed")) muted.add(kind);
  }
  return muted;
}
