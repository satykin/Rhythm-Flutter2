/* ============================================================
 * Mood Overview — отдельный экран аналитики (Фаза C, §10).
 * Три вкладки: Неделя (Tapestry) · Месяц · Инсайты.
 * Аналитика не смешивается с лентой Journal.
 * ============================================================ */

import React, { useState } from "react";
import { Seg, Modal } from "../../../components/ui";
import { I } from "../../../components/icons";
import MoodTapestry from "./MoodTapestry";
import MonthAnalytics from "./MonthAnalytics";
import InsightsTab from "./InsightsTab";
import PromptSettingsPanel from "./PromptSettingsPanel";

type Tab = "week" | "month" | "insights";

export default function MoodOverviewScreen() {
  const [tab, setTab] = useState<Tab>("week");
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="mx-auto max-w-[820px] space-y-5">
      <div className="anim-rise flex items-center gap-2">
        <div className="flex-1">
          <Seg<Tab>
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
    </div>
  );
}
