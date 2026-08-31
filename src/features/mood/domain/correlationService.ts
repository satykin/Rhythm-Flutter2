/* ============================================================
 * Гибридный корреляционный движок (Журнал 2.1, Фаза C, §12).
 * Чистые функции: без React и DB. Результат сохраняется в
 * user_mood_correlations (см. CorrelationRepository).
 *
 * Два типа анализа:
 *  A. Категориальные (теги, дни недели, привычки) —
 *     медиана группы против личного baseline.
 *  B. Числовые (focus_minutes, tasks_completed) —
 *     коэффициент Пирсона по дневным парам.
 *
 * Инсайты — наблюдения, не причинно-следственные утверждения.
 * Порог надёжности: sample_size ≥ 7, |r| ≥ 0.3, «flat» отсекается.
 * ============================================================ */

import type {
  CorrelationConfidence, CorrelationDirection, FocusSession, MoodCorrelation, MoodLog, Routine, Task,
} from "../../../lib/types";
import { addDaysKey, todayKey, weekdayIdx } from "../../../lib/time";

export interface CorrelationInput {
  moods: MoodLog[];
  tasks: Task[];
  focusSessions: FocusSession[];
  routines: Routine[];
  periodDays?: number;
  /** «сегодня» — для детерминированных тестов (по умолчанию реальная дата) */
  today?: string;
}

export const MIN_SAMPLE = 7;
export const MIN_EFFECT = 0.3;
export const MIN_PEARSON = 0.3;

/* ---------- базовая статистика ---------- */

export function median(values: number[]): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/** Коэффициент корреляции Пирсона. Возвращает null при нулевой дисперсии. */
export function pearson(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const ax = xs[i] - mx;
    const ay = ys[i] - my;
    num += ax * ay;
    dx += ax * ax;
    dy += ay * ay;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/* ---------- пороги и направления ---------- */

const categoricalConfidence = (n: number): CorrelationConfidence =>
  n >= 20 ? "high" : n >= 12 ? "medium" : "low";

const numericConfidence = (r: number, n: number): CorrelationConfidence =>
  Math.abs(r) >= 0.5 && n >= 14 ? "high" : Math.abs(r) >= 0.3 && n >= 10 ? "medium" : "low";

const categoricalDirection = (effect: number): CorrelationDirection | null =>
  effect >= MIN_EFFECT ? "up" : effect <= -MIN_EFFECT ? "down" : null;

/* ---------- движок ---------- */

export function computeCorrelations(input: CorrelationInput): MoodCorrelation[] {
  const periodDays = input.periodDays ?? 30;
  const period = `${periodDays}d`;
  const today = input.today ?? todayKey();
  const from = addDaysKey(today, -(periodDays - 1));

  const moods = input.moods.filter((m) => m.date >= from && m.date <= today);
  if (moods.length < MIN_SAMPLE) return [];

  /* Шаг 1. Личный baseline — медиана всех оценок за период. */
  const baseline = median(moods.map((m) => m.mood));
  const now = Date.now();
  const out: MoodCorrelation[] = [];

  const pushCategorical = (signalKey: string, group: MoodLog[]) => {
    if (group.length < MIN_SAMPLE) return;
    const gm = median(group.map((m) => m.mood));
    const effect = gm - baseline;
    const direction = categoricalDirection(effect);
    if (!direction) return; // flat → не показываем
    out.push({
      userId: "",
      signalKey,
      signalType: "categorical",
      period,
      sampleSize: group.length,
      baseline,
      observedValue: gm,
      effectSize: effect,
      confidence: categoricalConfidence(group.length),
      direction,
      computedAt: now,
    });
  };

  /* Шаг 2a. Теги. */
  const tagGroups = new Map<string, MoodLog[]>();
  for (const m of moods) for (const t of m.tags) {
    const arr = tagGroups.get(t) ?? [];
    arr.push(m);
    tagGroups.set(t, arr);
  }
  tagGroups.forEach((group, tag) => pushCategorical(`tag:${tag}`, group));

  /* Шаг 2b. Дни недели. */
  const wdGroups: MoodLog[][] = Array.from({ length: 7 }, () => []);
  for (const m of moods) wdGroups[weekdayIdx(m.date)].push(m);
  const wdNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  wdGroups.forEach((group, i) => pushCategorical(`weekday:${wdNames[i]}`, group));

  /* Шаг 2c. Привычки: дни, когда привычка запланирована (по дням недели).
   * Выполнение привычек пока не трекается — используем запланированные дни
   * и честно отражаем это в подписи (см. signalLabel). */
  for (const r of input.routines) {
    const group = moods.filter((m) => r.days.includes(weekdayIdx(m.date)));
    pushCategorical(`habit:${r.id}`, group);
  }

  /* Шаг 3. Числовые сигналы — дневные пары (x = фактор, y = настроение дня). */
  const byDay = new Map<string, MoodLog[]>();
  for (const m of moods) {
    const arr = byDay.get(m.date) ?? [];
    arr.push(m);
    byDay.set(m.date, arr);
  }
  const days = [...byDay.keys()].sort();

  const focusByDay = new Map<string, number>();
  for (const s of input.focusSessions) {
    focusByDay.set(s.date, (focusByDay.get(s.date) ?? 0) + s.focusMin);
  }
  const doneByDay = new Map<string, number>();
  for (const t of input.tasks) {
    if (t.status === "done") doneByDay.set(t.date, (doneByDay.get(t.date) ?? 0) + 1);
  }

  const numeric = (signalKey: string, xOf: (d: string) => number) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const d of days) {
      xs.push(xOf(d));
      ys.push(mean(byDay.get(d)!.map((m) => m.mood)));
    }
    const n = days.length;
    if (n < MIN_SAMPLE) return;
    const r = pearson(xs, ys);
    if (r === null || Math.abs(r) < MIN_PEARSON) return;
    out.push({
      userId: "",
      signalKey,
      signalType: "numeric",
      period,
      sampleSize: n,
      baseline,
      observedValue: r,
      effectSize: r,
      confidence: numericConfidence(r, n),
      direction: r > 0 ? "up" : "down",
      computedAt: now,
    });
  };

  numeric("num:focus_minutes", (d) => focusByDay.get(d) ?? 0);
  numeric("num:tasks_completed", (d) => doneByDay.get(d) ?? 0);
  // sleep_hours: нет дневных данных (одно значение в профиле) — пропускаем.

  return out.sort((a, b) => Math.abs(b.effectSize) - Math.abs(a.effectSize));
}

/* ---------- подписи сигналов (для текстовых альтернатив и вкладки) ---------- */

const WD_LABEL: Record<string, string> = {
  mon: "понедельникам", tue: "вторникам", wed: "средам", thu: "четвергам",
  fri: "пятницам", sat: "субботам", sun: "воскресеньям",
};

export function signalLabel(signalKey: string, routines: Routine[]): string {
  if (signalKey.startsWith("tag:")) return `дни с тегом #${signalKey.slice(4)}`;
  if (signalKey.startsWith("weekday:")) return `по ${WD_LABEL[signalKey.slice(8)] ?? signalKey}`;
  if (signalKey.startsWith("habit:")) {
    const r = routines.find((x) => x.id === signalKey.slice(6));
    return r ? `дни с привычкой «${r.title}»` : "дни с привычкой";
  }
  if (signalKey === "num:focus_minutes") return "время фокуса за день";
  if (signalKey === "num:tasks_completed") return "число выполненных задач за день";
  return signalKey;
}

/** Текстовое описание корреляции (наблюдение, не причинность). */
export function describeCorrelation(c: MoodCorrelation, routines: Routine[]): string {
  const label = signalLabel(c.signalKey, routines);
  if (c.signalType === "numeric") {
    const strength = Math.abs(c.effectSize) >= 0.5 ? "заметная" : "умеренная";
    const dir = c.direction === "up" ? "сопровождается более высоким настроением" : "сопровождается более низким настроением";
    return `За ${c.period}: ${strength} связь — ${label} ${dir} (r = ${c.effectSize.toFixed(2)}, n = ${c.sampleSize}).`;
  }
  const diff = Math.abs(c.effectSize).toFixed(1);
  const dir = c.direction === "up" ? "выше" : "ниже";
  return `За ${c.period}: в ${label} настроение ${dir} обычного на ${diff} балла (медиана ${c.observedValue.toFixed(1)} против ${c.baseline.toFixed(1)}, n = ${c.sampleSize}).`;
}
