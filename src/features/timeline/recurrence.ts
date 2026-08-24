/* ============================================================
 * Recurring tasks — подмножество RRULE:
 *   FREQ=DAILY|WEEKLY ; INTERVAL=n ; BYDAY=MO,TU,WE,TH,FR,SA,SU ;
 *   UNTIL=YYYY-MM-DD ; COUNT=n
 * Якорь интервала — дата самой задачи (parent.date).
 * ============================================================ */

import { addDaysKey, weekdayIdx } from "../../lib/time";

export interface RRule {
  freq: "DAILY" | "WEEKLY";
  interval: number;
  byDay: number[] | null; // 0=Пн…6=Вс
  until: string | null;
  count: number | null;
}

const DAY_CODES: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

export function parseRRule(raw: string): RRule | null {
  if (!raw.includes("FREQ=")) return null;
  const parts = raw.split(";").map((p) => p.trim());
  const get = (k: string) => parts.find((p) => p.startsWith(`${k}=`))?.slice(k.length + 1);
  const freqRaw = get("FREQ");
  if (freqRaw !== "DAILY" && freqRaw !== "WEEKLY") return null;
  const interval = Math.max(1, parseInt(get("INTERVAL") ?? "1", 10) || 1);
  const byRaw = get("BYDAY");
  const byDay = byRaw
    ? byRaw.split(",").map((d) => DAY_CODES[d.trim().toUpperCase()]).filter((d): d is number => d !== undefined)
    : null;
  const until = get("UNTIL") ?? null;
  const countRaw = get("COUNT");
  const count = countRaw ? Math.max(1, parseInt(countRaw, 10) || 1) : null;
  return { freq: freqRaw, interval, byDay: byDay && byDay.length ? byDay : null, until, count };
}

export function buildRRule(r: RRule): string {
  const codes = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
  const parts = [`FREQ=${r.freq}`, `INTERVAL=${r.interval}`];
  if (r.byDay?.length) parts.push(`BYDAY=${r.byDay.map((d) => codes[d]).join(",")}`);
  if (r.until) parts.push(`UNTIL=${r.until}`);
  if (r.count) parts.push(`COUNT=${r.count}`);
  return parts.join(";");
}

const WD = ["понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам", "воскресеньям"];

export function describeRRule(r: RRule): string {
  if (r.freq === "DAILY") {
    return r.interval === 1 ? "Каждый день" : `Каждые ${r.interval} дн.`;
  }
  const days = r.byDay ? r.byDay.map((d) => WD[d].replace(/ам$|ям$/, "у")).join(", ") : "";
  const base = r.interval === 1 ? "Каждую неделю" : `Каждые ${r.interval} нед.`;
  const until = r.until ? `, до ${r.until.slice(8, 10)}.${r.until.slice(5, 7)}` : "";
  const count = r.count ? `, ${r.count} раз` : "";
  return `${base}${days ? `, ${days}` : ""}${until}${count}`;
}

/** Понедельник недели, содержащей dateKey. */
function mondayOf(dateKey: string): string {
  return addDaysKey(dateKey, -weekdayIdx(dateKey));
}

/**
 * Даты вхождений на горизонте [fromKey, fromKey + horizonDays),
 * начиная с anchorKey (дата родительской задачи). Прошедшие — только от fromKey.
 */
export function occurrences(rule: RRule, anchorKey: string, fromKey: string, horizonDays: number): string[] {
  const out: string[] = [];
  const horizonEnd = addDaysKey(fromKey, horizonDays);
  const limit = (d: string) =>
    d >= fromKey && d < horizonEnd && (!rule.until || d <= rule.until!);
  let emitted = 0;

  if (rule.freq === "DAILY") {
    let d = anchorKey;
    let guard = 0;
    while (d < horizonEnd && guard++ < 2000) {
      if (d >= fromKey) {
        if (limit(d)) out.push(d);
        emitted++;
        if (rule.count && emitted >= rule.count) break;
      } else if (d >= anchorKey) {
        emitted++;
        if (rule.count && emitted >= rule.count) break;
      }
      d = addDaysKey(d, rule.interval);
    }
    return out;
  }

  /* WEEKLY */
  const days = rule.byDay ?? [weekdayIdx(anchorKey)];
  let weekStart = mondayOf(anchorKey);
  let guard = 0;
  while (weekStart < horizonEnd && guard++ < 600) {
    for (const wd of [...days].sort((a, b) => a - b)) {
      const d = addDaysKey(weekStart, wd);
      if (d < anchorKey) continue;
      if (d >= fromKey) {
        if (limit(d)) out.push(d);
        emitted++;
        if (rule.count && emitted >= rule.count) return out;
      } else {
        emitted++;
        if (rule.count && emitted >= rule.count) return out;
      }
    }
    weekStart = addDaysKey(weekStart, 7 * rule.interval);
  }
  return out;
}

/** Быстрый пресет для UI. */
export const RECURRENCE_PRESETS: { label: string; rule: string }[] = [
  { label: "Каждый день", rule: "FREQ=DAILY;INTERVAL=1" },
  { label: "Пн / Ср / Пт", rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR" },
  { label: "По будням", rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR" },
  { label: "Каждую неделю", rule: "FREQ=WEEKLY;INTERVAL=1" },
  { label: "Раз в 2 недели", rule: "FREQ=WEEKLY;INTERVAL=2" },
];
