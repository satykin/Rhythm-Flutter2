/* ============================================================
 * Синхронизация с внешним календарём.
 * CalendarProvider — контракт; в проде сюда встаёт
 * GoogleCalendarProvider (OAuth2 + Calendar API v3)
 * или Apple CalendarKit-мост. Здесь — демо-провайдер.
 * ============================================================ */

import type { ExternalEvent } from "./types";
import { addDaysKey, todayKey } from "./time";

export interface CalendarProvider {
  readonly id: "google";
  readonly label: string;
  connect(): Promise<{ account: string }>;
  /** pull: события из календаря → в Rhythm */
  pull(): Promise<ExternalEvent[]>;
  /** push: задачи Rhythm → в календарь, возвращает принятые id */
  push(titles: string[]): Promise<number>;
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const googleProvider: CalendarProvider = {
  id: "google",
  label: "Google Calendar",

  async connect() {
    await wait(1100);
    return { account: "alex.day@gmail.com" };
  },

  async pull() {
    await wait(800);
    const today = todayKey();
    const tomorrow = addDaysKey(today, 1);
    return [
      { externalId: "gcal_standup", title: "Стендап с клиентом", date: today, startMin: 16 * 60 + 30, endMin: 17 * 60 },
      { externalId: "gcal_dentist", title: "Стоматолог", date: tomorrow, startMin: 11 * 60, endMin: 12 * 60 },
      { externalId: "gcal_yoga", title: "Йога-класс", date: addDaysKey(today, 2), startMin: 8 * 60, endMin: 9 * 60 },
    ];
  },

  async push(titles: string[]) {
    await wait(650 + titles.length * 90);
    return titles.length;
  },
};
