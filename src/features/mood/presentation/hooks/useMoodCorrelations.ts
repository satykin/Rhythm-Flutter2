/* ============================================================
 * useMoodCorrelations — ленивый пересчёт + кэш (Фаза C).
 * Запускается только когда смонтирован экран аналитики и
 * пересчитывается при изменении mood_logs / задач / сессий
 * (спека §16: правка прошлого дня пересчитывает аналитику).
 * ============================================================ */

import { useEffect, useState } from "react";
import { useApp } from "../../../../state/store";
import { db } from "../../../../lib/db";
import { CorrelationRepository } from "../../data/CorrelationRepository";
import type { MoodCorrelation } from "../../../../lib/types";

export function useMoodCorrelations(): { correlations: MoodCorrelation[]; ready: boolean } {
  const app = useApp();
  const [correlations, setCorrelations] = useState<MoodCorrelation[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!app.user) return;
    const rows = CorrelationRepository.recompute(
      {
        moods: app.moods,
        tasks: app.tasks,
        focusSessions: app.focusSessions,
        routines: app.routines,
      },
      app.user.id
    );
    void db.commit();
    setCorrelations(rows);
    setReady(true);
  }, [app.user, app.moods, app.tasks, app.focusSessions, app.routines]);

  return { correlations, ready };
}
