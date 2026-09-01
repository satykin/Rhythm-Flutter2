/* ============================================================
 * Mood Overview — отдельный экран аналитики (Фаза C, §10).
 * Три вкладки: Неделя (Tapestry) · Месяц · Инсайты.
 * Аналитика не смешивается с лентой Journal.
 * Фаза F: таб из deep link (#/mood/overview/...), PDF-отчёт.
 * ============================================================ */

import React, { useEffect, useState } from "react";
import { Seg, Modal } from "../../../components/ui";
import { I } from "../../../components/icons";
import { useApp } from "../../../state/store";
import MoodTapestry from "./MoodTapestry";
import MonthAnalytics from "./MonthAnalytics";
import InsightsTab from "./InsightsTab";
import PromptSettingsPanel from "./PromptSettingsPanel";
import ExportPdfDialog from "./ExportPdfDialog";
import type { OverviewTab } from "../domain/deeplinks";

export default function MoodOverviewScreen() {
  const app = useApp();
  const [tab, setTab] = useState<OverviewTab>("week");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);

  /* deep link: #/mood/overview/week|month|insights */
  useEffect(() => {
    const d = app.consumeDeepLink();
    if (d.overviewTab) setTab(d.overviewTab);
    // однократное потребление при входе на экран
  }, []);

  /* синхронизация таба в hash (replace — не плодит историю) */
  useEffect(() => {
    const target = tab === "week" ? "#/mood" : `#/mood/overview/${tab}`;
    if (window.location.hash !== target) {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}${target}`);
    }
  }, [tab]);

  return (
    <div className="mx-auto max-w-[820px] space-y-5">
      <div className="anim-rise flex items-center gap-2">
        <div className="flex-1">
          <Seg<OverviewTab>
            value={tab}
            onChange={setTab}
            options={[
              { value: "week", label: "Неделя" },
              { value: "month", label: "Месяц" },
              { value: "insights", label: "Инсайты" },
            ]}
          />
        </div>
        <button
          className="btn btn-ghost !px-2.5 !py-2"
          onClick={() => setPdfOpen(true)}
          aria-label="Отчёт за период (PDF)"
          title="Отчёт за период"
        >
          <I n="file" size={15} />
        </button>
        <button
          className="iconbtn shrink-0"
          onClick={() => setSettingsOpen(true)}
          aria-label="Настройки напоминаний"
          title="Напоминания"
        >
          <I n="sliders" size={16} />
        </button>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Напоминания" icon="clock" width={480}>
        <PromptSettingsPanel />
      </Modal>

      <div key={tab} className="anim-rise">
        {tab === "week" && <MoodTapestry />}
        {tab === "month" && <MonthAnalytics />}
        {tab === "insights" && <InsightsTab />}
      </div>

      <ExportPdfDialog open={pdfOpen} onClose={() => setPdfOpen(false)} />
    </div>
  );
}
