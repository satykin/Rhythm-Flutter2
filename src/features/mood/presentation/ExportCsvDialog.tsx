/* ============================================================
 * Экспорт CSV (Фаза F, §2) — только UI поверх готового домена:
 * buildCsvParts (BOM + \r\n + чанки), buildJoin (батч, без N+1),
 * csvFileName. Подтверждение со сводкой ДО выгрузки (§14: только
 * по явному действию, только свои данные, содержимое не логируется —
 * в mood_export_log пишется лишь факт: тип, число, период).
 * ============================================================ */

import React, { useMemo, useState } from "react";
import DialogShell from "../../../shared/ui/DialogShell";
import { I } from "../../../components/icons";
import { db } from "../../../lib/db";
import { useApp } from "../../../state/store";
import { uid, fmtDateShort, plural } from "../../../lib/time";
import { buildCsvParts, buildJoin, csvFileName, CSV_COLUMNS } from "../domain/moodExport";
import type { MoodLog } from "../../../lib/types";

export default function ExportCsvDialog({
  open,
  onClose,
  entries,
  periodLabel,
}: {
  open: boolean;
  onClose: () => void;
  /** уже отфильтрованные записи текущего пользователя */
  entries: MoodLog[];
  periodLabel: string;
}) {
  const user = useApp().user;
  const [done, setDone] = useState(false);

  /* сводка для подтверждения */
  const summary = useMemo(() => {
    if (!entries.length) return null;
    const dates = entries.map((m) => m.date).sort();
    const from = dates[0];
    const to = dates[dates.length - 1];
    return {
      from,
      to,
      range: from === to ? fmtDateShort(from) : `${fmtDateShort(from)} — ${fmtDateShort(to)}`,
      withNotes: entries.filter((m) => m.note).length,
      withLinks: entries.filter((m) => m.linkedTaskIds.length > 0 || m.focusSessionId).length,
    };
  }, [entries]);

  const doExport = () => {
    if (!user) return;
    /* батч-джоины одним проходом (без N+1) */
    const join = buildJoin(db.tasksOf(user.id), db.focusSessionsOf(user.id));
    const parts = buildCsvParts(entries, join);
    const blob = new Blob(parts, { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFileName(summary?.from, summary?.to);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);

    /* только факт, не содержимое */
    db.insertExportLog({ id: uid(), userId: user.id, kind: "csv", count: entries.length, period: periodLabel, createdAt: Date.now() });
    void db.commit();
    setDone(true);
    window.setTimeout(() => {
      setDone(false);
      onClose();
    }, 1100);
  };

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      title={done ? "Экспортировано" : "Экспорт CSV"}
      icon={done ? "check" : "download"}
      width={460}
      footer={
        !done ? (
          <>
            <button className="btn btn-ghost" onClick={onClose} data-testid="export-cancel">Отмена</button>
            <button className="btn btn-primary" onClick={doExport} disabled={!entries.length} data-testid="export-confirm">
              <I n="download" size={14} /> Скачать CSV
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
          <p className="mt-3 text-[13px] font-bold text-mist-50">Файл сохранён локально</p>
          <p className="mt-1 text-[11.5px] font-semibold text-mist-500">Содержимое не отправлялось на сервер</p>
        </div>
      ) : summary ? (
        <div className="space-y-4">
          <p className="text-[13px] font-semibold text-mist-300" data-testid="export-csv-summary">
            Экспортировать <b className="font-display text-[15px] text-mist-50">{entries.length}</b>{" "}
            {plural(entries.length, "запись", "записи", "записей")} за период{" "}
            <b className="text-mist-50">{summary.range}</b>?
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2.5 text-center">
              <div className="font-display text-[17px] font-bold text-mist-50">{summary.withNotes}</div>
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-mist-500">с заметками</div>
            </div>
            <div className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2.5 text-center">
              <div className="font-display text-[17px] font-bold text-mist-50">{summary.withLinks}</div>
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-mist-500">со связями</div>
            </div>
            <div className="rounded-lg border border-white/6 bg-white/[0.02] px-3 py-2.5 text-center">
              <div className="font-display text-[17px] font-bold text-mist-50">{CSV_COLUMNS.length}</div>
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-mist-500">колонок</div>
            </div>
          </div>
          <div className="rounded-lg border border-warn/25 bg-warn/8 px-3.5 py-2.5 text-[11.5px] font-semibold leading-relaxed text-warn">
            <span className="flex items-center gap-1.5 font-extrabold"><I n="shield" size={12} /> Чувствительные данные</span>
            <span className="mt-0.5 block text-warn/85">
              Файл содержит настроения и заметки. Он будет сохранён только на этом устройстве (UTF-8 с BOM — корректно
              откроется в Excel). Выгружаются только ваши данные.
            </span>
          </div>
        </div>
      ) : (
        <p className="py-4 text-center text-[13px] font-semibold text-mist-400">
          Нет записей по текущим фильтрам — экспортировать нечего.
        </p>
      )}
    </DialogShell>
  );
}
