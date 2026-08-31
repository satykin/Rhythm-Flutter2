/* ============================================================
 * Отчёт PDF (Фаза F, §3) — UI поверх готового домена:
 * buildReportHtml + periodBounds + PERIOD_OPTIONS.
 * Генерация на клиенте через print-to-PDF (кириллица и эмодзи
 * рендерятся браузером; у домена внутри есть текстовые подписи
 * состояний рядом с эмодзи — отчёт читаем и без эмодзи-шрифта).
 * Подтверждение периода ДО генерации; логируется только факт.
 * ============================================================ */

import React, { useMemo, useState } from "react";
import DialogShell from "../../../shared/ui/DialogShell";
import { I } from "../../../components/icons";
import { db } from "../../../lib/db";
import { useApp } from "../../../state/store";
import { uid, todayKey, plural, fmtDateLong, keyToDate } from "../../../lib/time";
import { buildReportHtml, PERIOD_OPTIONS, periodBounds, type PeriodOption } from "../domain/moodExport";
import { getActiveInsights, describeInsight } from "../domain/insights";
import { InsightRepository } from "../data/InsightRepository";

const monthStartKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const fmtNow = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function ExportPdfDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const user = app.user;
  const [period, setPeriod] = useState<PeriodOption["id"]>("month");
  const [done, setDone] = useState(false);

  const bounds = useMemo(() => periodBounds(period, todayKey(), monthStartKey()), [period]);

  /* записи периода (только свои — app.moods уже по user_id) */
  const entries = useMemo(
    () =>
      app.moods
        .filter((m) => (!bounds.from || m.date >= bounds.from) && (!bounds.to || m.date <= bounds.to))
        .sort((a, b) => a.date.localeCompare(b.date) || a.timeMin - b.timeMin),
    [app.moods, bounds]
  );

  const doExport = () => {
    if (!user) return;
    /* секция «Наблюдения»: активные инсайты (read-only, без записи feedback) */
    const correlations = db.correlationsOf(user.id);
    const feedback = InsightRepository.feedbackOf(user.id);
    const { active } = getActiveInsights(Date.now(), correlations, feedback);
    const habitName = (key: string) =>
      key.startsWith("habit:") ? app.routines.find((r) => r.id === key.slice(6))?.title : undefined;
    const insights = active.map((c) => {
      const t = describeInsight(c, habitName(c.signalKey));
      return { title: t.title, body: t.body };
    });

    const html = buildReportHtml({
      periodLabel: bounds.label,
      entries,
      routines: app.routines,
      insights,
      generatedAt: fmtNow(),
      userName: user.name,
    });

    /* print-to-PDF через скрытый iframe — без popup-блокеров */
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.right = "0";
    frame.style.bottom = "0";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.title = "Печатная форма отчёта Rhythm";
    frame.srcdoc = html;
    frame.onload = () => {
      window.setTimeout(() => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } finally {
          window.setTimeout(() => frame.remove(), 2000);
        }
      }, 60);
    };
    document.body.appendChild(frame);

    /* только факт, не содержимое */
    db.insertExportLog({ id: uid(), userId: user.id, kind: "pdf", count: entries.length, period: bounds.label, createdAt: Date.now() });
    void db.commit();
    setDone(true);
    window.setTimeout(() => {
      setDone(false);
      onClose();
    }, 1400);
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={done ? "Печать запущена" : "Отчёт за период"}
      icon={done ? "check" : "file"}
      width={440}
      footer={
        !done ? (
          <>
            <button className="btn btn-ghost" onClick={onClose}>Отмена</button>
            <button className="btn btn-primary" onClick={doExport} disabled={!entries.length}>
              <I n="file" size={14} /> Сформировать PDF
            </button>
          </>
        ) : undefined
      }
    >
      {done ? (
        <div className="anim-rise flex flex-col items-center py-6 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-ok">
            <I n="check" size={22} sw={2.4} />
          </span>
          <p className="mt-3 text-[13px] font-bold text-mist-50">Откройте «Сохранить как PDF» в диалоге печати</p>
          <p className="mt-1 text-[11.5px] font-semibold text-mist-500">Отчёт сформирован локально, без отправки на сервер</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <span className="label">Период отчёта</span>
            <div className="grid gap-1.5" role="radiogroup" aria-label="Период отчёта">
              {PERIOD_OPTIONS.map((o) => {
                const on = period === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPeriod(o.id)}
                    className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition ${
                      on ? "border-vio-400/50 bg-vio-400/10" : "border-white/8 bg-white/[0.02] hover:border-white/18"
                    }`}
                  >
                    <span className={`text-[13px] font-bold ${on ? "text-mist-50" : "text-mist-300"}`}>{o.label}</span>
                    {on && <I n="check" size={14} className="text-vio-300" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-mist-500">{bounds.label}</span>
              <span className="font-display text-[15px] font-bold text-mist-50">
                {entries.length} {plural(entries.length, "запись", "записи", "записей")}
              </span>
            </div>
            <p className="mt-1.5 text-[11.5px] font-semibold leading-relaxed text-mist-400">
              В отчёте: сводка и распределение состояний, лента по дням, активные наблюдения с дисклеймером.
              Эмодзи сопровождаются текстовыми подписями — отчёт читаем в любом PDF.
            </p>
          </div>

          {entries.length > 0 && (
            <p className="text-[11px] font-semibold text-mist-500">
              Первая запись: {fmtDateLong(entries[0].date)} · последняя: {fmtDateLong(entries[entries.length - 1].date)}
            </p>
          )}
        </div>
      )}
    </DialogShell>
  );
}
