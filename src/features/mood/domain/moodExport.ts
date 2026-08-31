/* ============================================================
 * Экспорт данных настроения (Фаза F, §2–§3).
 * ПРИВАТНОСТЬ (спека §14): экспорт только по явному действию,
 * только данные текущего пользователя (выборка уже по user_id),
 * файл скачивается локально, содержимое нигде не логируется.
 * ============================================================ */

import type { FocusSession, MoodLog, Routine, Task } from "../../../lib/types";
import { moodLabel } from "./moodService";
import { minToHM } from "../../../lib/time";

const EMOJI: Record<number, string> = { 1: "😩", 2: "😔", 3: "😐", 4: "🙂", 5: "✨" };

const SOURCE_LABEL: Record<MoodLog["source"], string> = {
  manual: "вручную",
  post_focus: "после фокуса",
  morning: "утро",
  evening: "вечер",
};

/* ---------- CSV (§2) ---------- */

/** RFC 4180: кавычки при запятых/кавычках/переводах строк; кавычки удваиваются. */
export function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const CSV_BOM = "\uFEFF";

export const CSV_COLUMNS = [
  "logged_at (local)",
  "emoji",
  "state",
  "note",
  "tags",
  "source",
  "linked_tasks",
  "focus_session",
  "score (service)",
  "logged_at (utc)",
  "updated_at (utc)",
] as const;

export interface ExportJoin {
  tasksById: Map<string, Task>;
  sessionsById: Map<string, FocusSession>;
}

/** Батч-джоин (без N+1): one pass по массивам. */
export function buildJoin(tasks: Task[], sessions: FocusSession[]): ExportJoin {
  return {
    tasksById: new Map(tasks.map((t) => [t.id, t])),
    sessionsById: new Map(sessions.map((s) => [s.id, s])),
  };
}

export function entryRow(m: MoodLog, join: ExportJoin): string {
  const localAt = `${m.date}T${minToHM(m.timeMin)}:00`;
  const taskNames = m.linkedTaskIds
    .map((id) => join.tasksById.get(id)?.title)
    .filter((x): x is string => Boolean(x))
    .join("; ");
  const fs = m.focusSessionId ? join.sessionsById.get(m.focusSessionId) : undefined;
  const focus = fs ? `${fs.type}; ${fs.focusMin} мин${fs.completed ? "; завершена" : "; прервана"}` : "";
  return [
    localAt,
    EMOJI[m.mood] ?? "",
    moodLabel(m.mood),
    m.note ?? "",
    m.tags.join("; "),
    SOURCE_LABEL[m.source] ?? m.source,
    taskNames,
    focus,
    String(m.mood),
    m.loggedAt,
    m.updatedAt,
  ]
    .map(csvEscape)
    .join(",");
}

/**
 * Потоковая сборка CSV: генератор строк, собирается частями (Blob parts) —
 * весь текст не конкатенируется в одну строку.
 */
export function* csvLines(entries: MoodLog[], join: ExportJoin): Generator<string> {
  yield CSV_COLUMNS.join(",");
  for (const m of entries) yield entryRow(m, join);
}

export function buildCsvParts(entries: MoodLog[], join: ExportJoin, chunkSize = 500): BlobPart[] {
  const parts: BlobPart[] = [CSV_BOM];
  let buf: string[] = [];
  for (const line of csvLines(entries, join)) {
    buf.push(line, "\r\n");
    if (buf.length >= chunkSize * 2) {
      parts.push(buf.join(""));
      buf = [];
    }
  }
  if (buf.length) parts.push(buf.join(""));
  return parts;
}

export function csvFileName(dateFrom?: string, dateTo?: string, today = new Date()): string {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (dateFrom && dateTo) return `rhythm-mood-${dateFrom}-${dateTo}.csv`;
  return `rhythm-mood-${iso(today)}.csv`;
}

/* ---------- PDF-отчёт (§3, print-based: кириллица + эмодзи) ---------- */

export interface ReportData {
  periodLabel: string;
  entries: MoodLog[];
  routines: Routine[];
  insights: { title: string; body: string }[];
  generatedAt: string;
  userName: string;
}

/** Распределение состояний с текстовым описанием (секция 2 отчёта). */
export function stateDistribution(entries: MoodLog[]): { mood: number; label: string; count: number; share: number }[] {
  const by = new Map<number, number>();
  for (const m of entries) by.set(m.mood, (by.get(m.mood) ?? 0) + 1);
  const total = Math.max(1, entries.length);
  return [5, 4, 3, 2, 1]
    .filter((s) => by.has(s))
    .map((s) => ({ mood: s, label: moodLabel(s), count: by.get(s) ?? 0, share: Math.round(((by.get(s) ?? 0) / total) * 100) }));
}

export function buildReportHtml(data: ReportData): string {
  const dist = stateDistribution(data.entries);
  const distText = dist.map((d) => `${d.label} — ${d.count} (${d.share}%)`).join("; ") || "нет записей";

  /* записи по дням (секция 3) */
  const byDate = new Map<string, MoodLog[]>();
  for (const m of data.entries) {
    const arr = byDate.get(m.date) ?? [];
    arr.push(m);
    byDate.set(m.date, arr);
  }
  const days = [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const daysHtml = days
    .map(([date, list]) => {
      const rows = [...list]
        .sort((a, b) => a.timeMin - b.timeMin)
        .map(
          (m) =>
            `<li><b>${minToHM(m.timeMin)}</b> · ${EMOJI[m.mood] ?? ""} ${moodLabel(m.mood)}` +
            (m.note ? ` — ${escapeHtml(m.note)}` : "") +
            (m.tags.length ? ` <span class="tags">#${m.tags.map(escapeHtml).join(" #")}</span>` : "") +
            `</li>`
        )
        .join("");
      return `<h3>${escapeHtml(date)}</h3><ul>${rows}</ul>`;
    })
    .join("");

  /* гобелен-сводка по дням недели (упрощённая сетка) */
  const tapestry = days
    .slice(0, 14)
    .map(([date, list]) => {
      const last = [...list].sort((a, b) => a.timeMin - b.timeMin).pop()!;
      return `<div class="cell"><span class="d">${escapeHtml(date.slice(5))}</span><span>${EMOJI[last.mood] ?? ""}</span></div>`;
    })
    .join("");

  /* наблюдения (секция 4) */
  const insightsHtml = data.insights.length
    ? `<h2>Наблюдения</h2><ul>${data.insights.map((i) => `<li><b>${escapeHtml(i.title)}.</b> ${escapeHtml(i.body)}</li>`).join("")}</ul>
       <p class="disclaimer">Это наблюдения, а не доказательство причины.</p>`
    : "";

  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/>
<title>Rhythm — отчёт о настроении, ${escapeHtml(data.periodLabel)}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1c2230; max-width: 720px; margin: 0 auto; font-size: 13px; line-height: 1.5; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 22px 0 8px; border-bottom: 2px solid #e7e9f2; padding-bottom: 4px; }
  h3 { font-size: 12px; margin: 12px 0 4px; color: #5a6378; }
  .meta { color: #6a7388; font-size: 12px; }
  .kpi { display: inline-block; margin-right: 18px; }
  .kpi b { font-size: 18px; display: block; }
  ul { margin: 4px 0 10px; padding-left: 18px; }
  li { margin: 3px 0; }
  .tags { color: #7a6cf0; }
  .tapestry { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
  .cell { border: 1px solid #e2e5ef; border-radius: 8px; padding: 6px 10px; text-align: center; min-width: 56px; }
  .cell .d { display: block; font-size: 10px; color: #8a93a8; }
  .disclaimer { color: #8a6a00; background: #fdf6e3; border: 1px solid #f0e2b8; padding: 8px 10px; border-radius: 8px; }
  .privacy { color: #6a7388; font-size: 11px; border-top: 1px solid #e7e9f2; margin-top: 24px; padding-top: 10px; }
</style></head><body>
<h1>Rhythm — отчёт о настроении</h1>
<p class="meta">Период: <b>${escapeHtml(data.periodLabel)}</b> · Пользователь: ${escapeHtml(data.userName)} · Сгенерировано: ${escapeHtml(data.generatedAt)}</p>

<h2>Сводка</h2>
<div>
  <span class="kpi"><b>${data.entries.length}</b>записей</span>
  <span class="kpi"><b>${new Set(data.entries.map((m) => m.date)).size}</b>дней с записями</span>
</div>
<p>Распределение состояний: ${escapeHtml(distText)}.</p>

<h2>Лента состояний</h2>
<div class="tapestry">${tapestry}</div>
${daysHtml || "<p>Записей за период нет.</p>"}

${insightsHtml}

<p class="privacy">Этот файл содержит чувствительные личные данные (настроение и заметки).
Он создан локально по вашему явному запросу и не отправлялся на сервер.
Храните его так же бережно, как личный дневник.</p>
</body></html>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Периоды для выбора в диалоге PDF-экспорта. */
export interface PeriodOption {
  id: "month" | "30d" | "all";
  label: string;
}

export const PERIOD_OPTIONS: PeriodOption[] = [
  { id: "month", label: "Этот месяц" },
  { id: "30d", label: "Последние 30 дней" },
  { id: "all", label: "Всё время" },
];

export function periodBounds(id: PeriodOption["id"], todayKey: string, monthStart: string): { from?: string; to?: string; label: string } {
  if (id === "month") return { from: monthStart, to: todayKey, label: `с ${monthStart} по ${todayKey}` };
  if (id === "30d") {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from, to: todayKey, label: `с ${from} по ${todayKey}` };
  }
  return { label: "всё время" };
}
