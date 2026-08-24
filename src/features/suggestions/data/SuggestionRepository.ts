/* ============================================================
 * SuggestionRepository (data-слой) — CRUD + правила частоты (§6)
 * + цикл обучения (§4.7). Работает поверх db, возвращает списки
 * для стора (реактивность). Логика — чистая и тестируемая.
 * ============================================================ */

import { db } from "../../../lib/db";
import { uid } from "../../../lib/time";
import type { Suggestion, SuggestionFeedback } from "../../../lib/types";
import { generate } from "../domain/SuggestionEngine";
import { applyFeedback, mutedKinds, rank } from "../domain/ranker";
import type { EngineSignals, KindWeights, SuggestionCandidate } from "../domain/types";
import { DEFAULT_RULES } from "../domain/types";
import { SLOT_COUNT } from "../domain/productivity";

const WEIGHTS_KEY = "rhythm.suggweights.v1";

function loadWeights(userId: string): KindWeights {
  try {
    const raw = localStorage.getItem(`${WEIGHTS_KEY}:${userId}`);
    return raw ? (JSON.parse(raw) as KindWeights) : {};
  } catch {
    return {};
  }
}

function saveWeights(userId: string, w: KindWeights) {
  try {
    localStorage.setItem(`${WEIGHTS_KEY}:${userId}`, JSON.stringify(w));
  } catch {
    /* ignore */
  }
}

/** Собирает сигналы из БД (§3). */
export function buildSignals(userId: string): EngineSignals {
  const tasks = db.tasksOf(userId);
  const sessions = db.focusSessionsOf(userId);
  const user = db.get().users.find((u) => u.id === userId);

  const focusBySlot = new Array<number>(SLOT_COUNT).fill(0);
  const abortedBySlot = new Array<number>(SLOT_COUNT).fill(0);
  for (const fs of sessions) {
    const d = new Date(fs.startedAt);
    const slot = Math.min(SLOT_COUNT - 1, Math.floor((d.getHours() * 60 + d.getMinutes()) / 30));
    focusBySlot[slot] += fs.focusMin;
    if (!fs.completed) abortedBySlot[slot] += 1;
  }

  return {
    tasks,
    focusBySlot,
    abortedBySlot,
    wakingFrom: 7 * 60,
    wakingTo: 23 * 60,
    ...(user ? {} : {}),
  };
}

const isQuiet = (nowMin: number, from: number, to: number) =>
  from <= to ? nowMin >= from && nowMin < to : nowMin >= from || nowMin < to;

/**
 * Полный пересчёт: генерация кандидатов → дедупликация → правила частоты
 * → ранжирование с обучением → персист. Возвращает актуальный список.
 */
export function recompute(userId: string, nowMin: number, today: string): Suggestion[] {
  const rules = DEFAULT_RULES;
  const now = Date.now();

  /* 1) протухшие (TTL) и вчерашние → expired */
  for (const s of db.suggestionsOf(userId)) {
    if ((s.state === "created" || s.state === "shown" || s.state === "snoozed") && s.expiresAt && s.expiresAt < now) {
      db.updateSuggestion({ ...s, state: "expired" });
    }
  }

  /* 2) генерация кандидатов */
  const signals = buildSignals(userId);
  const candidates = generate(signals, nowMin, today);

  /* 3) обучение: веса + замолчанные типы */
  const feedback = db.feedbackOf(userId);
  const weights = applyFeedback(loadWeights(userId), feedback);
  const muted = mutedKinds(feedback);

  /* 4) уже активные (не дублируем) */
  const existing = db.suggestionsOf(userId);
  const activeKeys = new Set(
    existing.filter((s) => s.state === "created" || s.state === "shown" || s.state === "snoozed").map((s) => s.dedupKey)
  );

  /* 5) дневной лимит показов */
  const shownToday = existing.filter((s) => s.shownAt && new Date(s.shownAt).toDateString() === new Date(now).toDateString()).length;
  let budget = Math.max(0, rules.dailyShownLimit - shownToday);

  /* 6) фильтр и персист новых */
  const fresh: Suggestion[] = [];
  for (const c of rank(candidates, weights)) {
    if (muted.has(c.kind)) continue;
    if (activeKeys.has(c.dedupKey)) continue;
    if (isQuiet(nowMin, rules.quietFrom, rules.quietTo)) continue;
    if (budget <= 0) continue;

    const rec: Suggestion = {
      id: uid(),
      userId,
      kind: c.kind,
      title: c.title,
      body: c.body,
      context: c.context,
      priority: c.priority,
      state: "created",
      shownAt: now,
      expiresAt: c.ttlMin ? now + c.ttlMin * 60_000 : now + 24 * 3600_000,
      dedupKey: c.dedupKey,
      createdAt: now,
    };
    db.insertSuggestion(rec);
    activeKeys.add(c.dedupKey);
    fresh.push(rec);
    budget--;
  }

  void db.commit();
  return db.suggestionsOf(userId);
}

/** Видимые сейчас: созданные/показанные (+ вышедшие из snooze), топ-N по приоритету. */
export function visible(userId: string, nowMin: number, max = DEFAULT_RULES.maxActive): Suggestion[] {
  const now = Date.now();
  if (isQuiet(nowMin, DEFAULT_RULES.quietFrom, DEFAULT_RULES.quietTo)) return [];
  return db
    .suggestionsOf(userId)
    .filter((s) => {
      if (s.state === "created" || s.state === "shown") return true;
      if (s.state === "snoozed" && (s.snoozeUntil ?? 0) <= now) return true;
      return false;
    })
    .filter((s) => !s.expiresAt || s.expiresAt > now)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, max);
}

/** Действие пользователя → смена состояния + фидбек + пересчёт весов. */
export function act(
  userId: string,
  id: string,
  action: SuggestionFeedback["action"]
): Suggestion[] {
  const now = Date.now();
  const s = db.suggestionsOf(userId).find((x) => x.id === id);
  if (!s) return db.suggestionsOf(userId);

  const state = action === "accepted" ? "accepted" : action === "dismissed" ? "dismissed" : "snoozed";
  db.updateSuggestion({
    ...s,
    state,
    snoozeUntil: action === "snoozed" ? now + 2 * 3600_000 : s.snoozeUntil,
  });

  db.insertFeedback({ id: uid(), userId, suggestionId: id, kind: s.kind, action, createdAt: now });

  /* пересчёт весов */
  const weights = applyFeedback(loadWeights(userId), db.feedbackOf(userId));
  saveWeights(userId, weights);

  void db.commit();
  return db.suggestionsOf(userId);
}

export function recordShown(userId: string, id: string): void {
  const s = db.suggestionsOf(userId).find((x) => x.id === id);
  if (s && s.state === "created") {
    db.updateSuggestion({ ...s, state: "shown", shownAt: Date.now() });
    void db.commit();
  }
}

export type { SuggestionCandidate };
