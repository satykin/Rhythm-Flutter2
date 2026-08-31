import { describe, expect, it } from "vitest";
import {
  DISMISS_DAYS,
  FORBIDDEN_CAUSAL_WORDS,
  MAX_ACTIVE_INSIGHTS,
  NEW_INSIGHT_GATE_DAYS,
  describeInsight,
  getActiveInsights,
  periodLabel,
  rankInsights,
  staleSignalKeys,
} from "./insights";
import type { MoodCorrelation, MoodInsightFeedback } from "../../../lib/types";

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

const corr = (over: Partial<MoodCorrelation>): MoodCorrelation => ({
  userId: "u1",
  signalKey: over.signalKey ?? "tag:walk",
  signalType: over.signalType ?? "categorical",
  period: over.period ?? "30d",
  sampleSize: over.sampleSize ?? 10,
  baseline: over.baseline ?? 3,
  observedValue: over.observedValue ?? 4,
  effectSize: over.effectSize ?? 1,
  confidence: over.confidence ?? "medium",
  direction: over.direction ?? "up",
  computedAt: over.computedAt ?? NOW,
});

const fb = (over: Partial<MoodInsightFeedback>): MoodInsightFeedback => ({
  userId: "u1",
  signalKey: over.signalKey ?? "tag:walk",
  status: over.status ?? "active",
  firstShownAt: over.firstShownAt ?? null,
  feedbackAt: over.feedbackAt ?? null,
  dismissedUntil: over.dismissedUntil ?? null,
});

describe("getActiveInsights — отбор", () => {
  it("возвращает не более 3 активных инсайтов (топ-3)", () => {
    const correlations = [
      corr({ signalKey: "tag:a", effectSize: 1 }),
      corr({ signalKey: "tag:b", effectSize: 2 }),
      corr({ signalKey: "tag:c", effectSize: 3 }),
      corr({ signalKey: "tag:d", effectSize: 4 }),
      corr({ signalKey: "tag:e", effectSize: 5 }),
    ];
    // все «виденные», чтобы гейт новых не мешал
    const feedback = correlations.map((c) => fb({ signalKey: c.signalKey, firstShownAt: NOW - 10 * DAY }));
    const { active } = getActiveInsights(NOW, correlations, feedback);
    expect(active.length).toBe(MAX_ACTIVE_INSIGHTS);
  });

  it("исключает отклонённые, пока now < dismissed_until", () => {
    const c = corr({ signalKey: "tag:x" });
    const future = fb({
      signalKey: "tag:x",
      status: "dismissed",
      firstShownAt: NOW - 2 * DAY,
      dismissedUntil: NOW + DAY,
    });
    expect(getActiveInsights(NOW, [c], [future]).active).toHaveLength(0);
  });

  it("возвращает отклонённый инсайт после истечения dismissed_until", () => {
    const c = corr({ signalKey: "tag:x" });
    const past = fb({
      signalKey: "tag:x",
      status: "dismissed",
      firstShownAt: NOW - 20 * DAY,
      dismissedUntil: NOW - DAY,
    });
    const { active } = getActiveInsights(NOW, [c], [past]);
    expect(active).toHaveLength(1);
    expect(active[0].signalKey).toBe("tag:x");
  });

  it("исключает устаревшие (stale) инсайты", () => {
    const c = corr({ signalKey: "tag:x" });
    const stale = fb({ signalKey: "tag:x", status: "stale", firstShownAt: NOW - 2 * DAY });
    expect(getActiveInsights(NOW, [c], [stale]).active).toHaveLength(0);
  });
});

describe("getActiveInsights — ранжирование", () => {
  it("confidence важнее effect_size", () => {
    const low = corr({ signalKey: "a", confidence: "low", effectSize: 5 });
    const high = corr({ signalKey: "b", confidence: "high", effectSize: 1 });
    const ranked = rankInsights([low, high]);
    expect(ranked[0].signalKey).toBe("b");
  });

  it("при равной confidence — abs(effect_size) по убыванию", () => {
    const small = corr({ signalKey: "a", confidence: "medium", effectSize: 0.4 });
    const bigNeg = corr({ signalKey: "b", confidence: "medium", effectSize: -1.2 });
    const ranked = rankInsights([small, bigNeg]);
    expect(ranked[0].signalKey).toBe("b");
  });

  it("при равных confidence и effect — sample_size по убыванию", () => {
    const few = corr({ signalKey: "a", confidence: "medium", effectSize: 1, sampleSize: 8 });
    const many = corr({ signalKey: "b", confidence: "medium", effectSize: 1, sampleSize: 30 });
    const ranked = rankInsights([few, many]);
    expect(ranked[0].signalKey).toBe("b");
  });
});

describe("getActiveInsights — частотный гейт новых (3 дня)", () => {
  it("вводит новый инсайт, если показов ещё не было", () => {
    const c = corr({ signalKey: "tag:new" });
    const { active, fresh } = getActiveInsights(NOW, [c], []);
    expect(active).toHaveLength(1);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].signalKey).toBe("tag:new");
  });

  it("вводит новый инсайт, если последний показ был ≥ 3 дней назад", () => {
    const seen = corr({ signalKey: "tag:seen" });
    const freshC = corr({ signalKey: "tag:fresh" });
    const feedback = [fb({ signalKey: "tag:seen", firstShownAt: NOW - NEW_INSIGHT_GATE_DAYS * DAY })];
    const { fresh } = getActiveInsights(NOW, [seen, freshC], feedback);
    expect(fresh.map((f) => f.signalKey)).toContain("tag:fresh");
  });

  it("НЕ вводит новый инсайт, если последний показ был < 3 дней назад", () => {
    const seen = corr({ signalKey: "tag:seen" });
    const freshC = corr({ signalKey: "tag:fresh" });
    const feedback = [fb({ signalKey: "tag:seen", firstShownAt: NOW - 1 * DAY })];
    const { active, fresh } = getActiveInsights(NOW, [seen, freshC], feedback);
    expect(fresh).toHaveLength(0);
    expect(active.map((a) => a.signalKey)).toEqual(["tag:seen"]);
  });
});

describe("staleSignalKeys — устаревание", () => {
  it("помечает инсайт без поддерживающей корреляции", () => {
    const feedback = [
      fb({ signalKey: "tag:alive", status: "active" }),
      fb({ signalKey: "tag:gone", status: "active" }),
      fb({ signalKey: "tag:accepted_gone", status: "accepted" }),
    ];
    const correlations = [corr({ signalKey: "tag:alive" })];
    const stale = staleSignalKeys(correlations, feedback);
    expect(stale).toContain("tag:gone");
    expect(stale).toContain("tag:accepted_gone");
    expect(stale).not.toContain("tag:alive");
  });

  it("не помечает dismissed-инсайты (они не активны)", () => {
    const feedback = [fb({ signalKey: "tag:gone", status: "dismissed", dismissedUntil: NOW + DAY })];
    expect(staleSignalKeys([], feedback)).toHaveLength(0);
  });
});

describe("describeInsight — формулировки", () => {
  it("содержит период и размер выборки", () => {
    const c = corr({ signalKey: "tag:walk", period: "30d", sampleSize: 12 });
    const { body } = describeInsight(c);
    expect(body).toContain("30 дней");
    expect(body).toContain("12 наблюдений");
  });

  it("НЕ содержит причинных глаголов (для всех шаблонов)", () => {
    const samples = [
      corr({ signalKey: "tag:walk", direction: "up" }),
      corr({ signalKey: "tag:walk", direction: "down" }),
      corr({ signalKey: "weekday:mon", direction: "up" }),
      corr({ signalKey: "weekday:sun", direction: "down" }),
      corr({ signalKey: "habit:h1", direction: "up" }),
      corr({ signalKey: "num:focus_minutes", direction: "up" }),
      corr({ signalKey: "num:focus_minutes", direction: "down" }),
      corr({ signalKey: "num:tasks_completed", direction: "up" }),
      corr({ signalKey: "num:tasks_completed", direction: "down" }),
    ];
    for (const c of samples) {
      const { title, body } = describeInsight(c, "Зарядка");
      const text = `${title} ${body}`.toLowerCase();
      for (const word of FORBIDDEN_CAUSAL_WORDS) {
        expect(text).not.toContain(word);
      }
    }
  });

  it("день недели отображается как «по …»", () => {
    const { body } = describeInsight(corr({ signalKey: "weekday:mon" }));
    expect(body).toContain("по понедельникам");
  });

  it("привычка отображается по имени, переданному снаружи", () => {
    const { title, body } = describeInsight(corr({ signalKey: "habit:abc" }), "Зарядка");
    expect(title).toContain("Зарядка");
    expect(body).toContain("«Зарядка»");
  });

  it("тег отображается по имени", () => {
    const { title, body } = describeInsight(corr({ signalKey: "tag:прогулка" }));
    expect(title).toContain("прогулка");
    expect(body).toContain("«прогулка»");
  });
});

describe("periodLabel", () => {
  it("склоняет дни", () => {
    expect(periodLabel("30d")).toBe("30 дней");
    expect(periodLabel("1d")).toBe("1 день");
    expect(periodLabel("7d")).toBe("7 дней");
    expect(periodLabel("21d")).toBe("21 день");
  });
});

describe("константы согласованы со спекой", () => {
  it("отклонение скрывает на 14 дней, макс 3 активных, гейт 3 дня", () => {
    expect(DISMISS_DAYS).toBe(14);
    expect(MAX_ACTIVE_INSIGHTS).toBe(3);
    expect(NEW_INSIGHT_GATE_DAYS).toBe(3);
  });
});
