/* ============================================================
 * Insights — движок отбора и формулировок (Фаза E).
 * Чистый домен: не знает ни о БД, ни о UI.
 *
 * ГЛАВНЫЙ ПРИНЦИП: инсайты — это НАБЛЮДЕНИЯ, а не причинно-
 * следственные утверждения. Запрещены причинные глаголы:
 * «делает», «вызывает», «приводит к», «заставляет», «помогает»,
 * «улучшает» (проверяется юнит-тестом).
 * ============================================================ */

import { plural } from "../../../lib/time";
import type {
  MoodCorrelation,
  MoodInsightFeedback,
} from "../../../lib/types";

export const MAX_ACTIVE_INSIGHTS = 3;
/** Новый инсайт вводится не чаще одного раза в 3 дня. */
export const NEW_INSIGHT_GATE_DAYS = 3;
/** Отклонённый сигнал не показывается 14 дней. */
export const DISMISS_DAYS = 14;

const DAY_MS = 86_400_000;

/* Запрещённые причинные слова (для самопроверки и тестов). */
export const FORBIDDEN_CAUSAL_WORDS = [
  "делает", "делают", "вызывает", "вызывают", "приводит", "приводят",
  "заставляет", "заставляют", "помогает", "помогают", "улучшает", "улучшают",
];

const CONF_WEIGHT: Record<MoodCorrelation["confidence"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Ранжирование по силе:
 *   1) confidence (high > medium > low)
 *   2) abs(effect_size) по убыванию
 *   3) sample_size по убыванию
 */
export function rankInsights(list: MoodCorrelation[]): MoodCorrelation[] {
  return [...list].sort((a, b) => {
    const conf = CONF_WEIGHT[b.confidence] - CONF_WEIGHT[a.confidence];
    if (conf !== 0) return conf;
    const eff = Math.abs(b.effectSize) - Math.abs(a.effectSize);
    if (eff !== 0) return eff;
    return b.sampleSize - a.sampleSize;
  });
}

export interface InsightSelection {
  /** Активные инсайты (максимум 3). */
  active: MoodCorrelation[];
  /** Новые инсайты, впервые введённые в этой выборке (для отметки shown). */
  fresh: MoodCorrelation[];
}

/**
 * getActiveInsights — отбор активных инсайтов.
 *
 * Алгоритм (Фаза E, §2):
 *  1. Взять все корреляции пользователя.
 *  2. Исключить feedback.status == 'stale'.
 *  3. Исключить отклонённые, пока now < dismissed_until.
 *  4. Отранжировать (confidence → abs(effect) → sample_size).
 *  5. Топ-3 — активные.
 *  6. Частотный гейт НОВЫХ: инсайт «новый», если нет first_shown_at;
 *     новый вводится впервые, только если (now − max(first_shown_at)) ≥ 3 дней.
 *     Если гейт не пройден — новые НЕ вводятся, только уже виденные.
 *
 * Все времена — epoch ms (timestamptz); «сегодня» — локальное.
 */
export function getActiveInsights(
  now: number,
  correlations: MoodCorrelation[],
  feedback: MoodInsightFeedback[]
): InsightSelection {
  const fb = new Map(feedback.map((f) => [f.signalKey, f]));

  // 1–3. фильтр: не stale и не отклонён (пока действует dismissed_until)
  const eligible = correlations.filter((c) => {
    const f = fb.get(c.signalKey);
    if (!f) return true; // нет feedback — кандидат активен
    if (f.status === "stale") return false;
    if (f.status === "dismissed" && f.dismissedUntil !== null && now < f.dismissedUntil) return false;
    return true;
  });

  // «виденные» (есть first_shown_at) vs «новые»
  const seen = eligible.filter((c) => {
    const f = fb.get(c.signalKey);
    return f?.firstShownAt != null;
  });
  const fresh = eligible.filter((c) => {
    const f = fb.get(c.signalKey);
    return f?.firstShownAt == null;
  });

  // 4–5. ранжируем виденные, берём топ-3
  const rankedSeen = rankInsights(seen);
  const active: MoodCorrelation[] = rankedSeen.slice(0, MAX_ACTIVE_INSIGHTS);

  // 6. частотный гейт для новых
  const shownTimes = feedback
    .map((f) => f.firstShownAt)
    .filter((t): t is number => t != null);
  const lastShown = shownTimes.length ? Math.max(...shownTimes) : null;
  const gatePassed = lastShown === null || now - lastShown >= NEW_INSIGHT_GATE_DAYS * DAY_MS;

  let introduced: MoodCorrelation[] = [];
  if (gatePassed && active.length < MAX_ACTIVE_INSIGHTS) {
    const rankedFresh = rankInsights(fresh);
    introduced = rankedFresh.slice(0, MAX_ACTIVE_INSIGHTS - active.length);
    active.push(...introduced);
  }

  return { active, fresh: introduced };
}

/**
 * Устаревание (Фаза E, §6): signal_key активных/принятых инсайтов,
 * для которых больше нет поддерживающей корреляции.
 */
export function staleSignalKeys(
  correlations: MoodCorrelation[],
  feedback: MoodInsightFeedback[]
): string[] {
  const alive = new Set(correlations.map((c) => c.signalKey));
  return feedback
    .filter((f) => (f.status === "active" || f.status === "accepted") && !alive.has(f.signalKey))
    .map((f) => f.signalKey);
}

/* ============================================================
 * Формулировки (только наблюдения)
 * ============================================================ */

const WD_DATIVE: Record<string, string> = {
  mon: "понедельникам",
  tue: "вторникам",
  wed: "средам",
  thu: "четвергам",
  fri: "пятницам",
  sat: "субботам",
  sun: "воскресеньям",
};

const WD_TITLE: Record<string, string> = {
  mon: "Понедельники",
  tue: "Вторники",
  wed: "Среды",
  thu: "Четверги",
  fri: "Пятницы",
  sat: "Субботы",
  sun: "Воскресенья",
};

/** '30d' → '30 дней' */
export function periodLabel(period: string): string {
  const m = period.match(/^(\d+)d$/);
  if (!m) return period;
  const n = Number(m[1]);
  return `${n} ${plural(n, "день", "дня", "дней")}`;
}

const sampleLabel = (n: number) => `${n} ${plural(n, "наблюдение", "наблюдения", "наблюдений")}`;

export interface InsightText {
  title: string;
  body: string;
}

/**
 * describeInsight — текст-наблюдение.
 * habitName передаётся снаружи (батч из таблицы привычек, без N+1).
 * В формулировке НЕ показывается числовой score как рейтинг.
 */
export function describeInsight(c: MoodCorrelation, habitName?: string): InsightText {
  const p = `За последние ${periodLabel(c.period)}`;
  const n = sampleLabel(c.sampleSize);
  const up = c.direction === "up";
  const key = c.signalKey;

  // --- категориальный: тег ---
  if (key.startsWith("tag:")) {
    const tag = key.slice(4);
    return {
      title: `Тег «${tag}»`,
      body: `${p} в дни с тегом «${tag}» твоё состояние чаще было ${up ? "выше" : "ниже"} обычного (${n}).`,
    };
  }

  // --- категориальный: день недели ---
  if (key.startsWith("weekday:")) {
    const wd = key.slice(8);
    return {
      title: WD_TITLE[wd] ?? wd,
      body: `${p} по ${WD_DATIVE[wd] ?? wd} твоё состояние обычно ${up ? "выше" : "ниже"} обычного (${n}).`,
    };
  }

  // --- категориальный: привычка ---
  if (key.startsWith("habit:")) {
    const name = habitName ?? "привычка";
    return {
      title: `Привычка «${name}»`,
      body: `${p} в дни, когда ты выполняешь «${name}», твоё состояние чаще ${up ? "выше" : "ниже"} обычного (${n}).`,
    };
  }

  // --- числовой: фокус ---
  if (key === "num:focus_minutes") {
    return {
      title: "Длительность фокуса",
      body: `${p} в дни с большей длительностью фокуса твоё состояние обычно ${up ? "выше" : "ниже"} (${n}).`,
    };
  }

  // --- числовой: выполненные задачи ---
  if (key === "num:tasks_completed") {
    return {
      title: "Выполненные задачи",
      body: `${p} в дни с большим числом выполненных задач твоё состояние обычно ${up ? "выше" : "ниже"} (${n}).`,
    };
  }

  // --- fallback ---
  return {
    title: "Наблюдение",
    body: `${p} обнаружена связь: ${key} — состояние ${up ? "выше" : "ниже"} обычного (${n}).`,
  };
}
