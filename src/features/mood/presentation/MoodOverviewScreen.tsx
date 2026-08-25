/* ============================================================
 * Mood Overview — отдельный экран аналитики (Фаза C, §10).
 * Три вкладки: Неделя (Tapestry) · Месяц · Инсайты.
 * Аналитика не смешивается с лентой Journal.
 * ============================================================ */

import React, { useState } from "react";
import { Seg } from "../../../components/ui";
import MoodTapestry from "./MoodTapestry";
import MonthAnalytics from "./MonthAnalytics";
import InsightsTab from "./InsightsTab";

type Tab = "week" | "month" | "insights";

export default function MoodOverviewScreen() {
  const [tab, setTab] = useState<Tab>("week");

  return (
    <div className="mx-auto max-w-[820px] space-y-5">
      <div className="anim-rise">
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

      <div key={tab} className="anim-rise">
        {tab === "week" && <MoodTapestry />}
        {tab === "month" && <MonthAnalytics />}
        {tab === "insights" && <InsightsTab />}
      </div>
    </div>
  );
}
