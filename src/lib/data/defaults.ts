/* Общие дефолты профиля (используются обоими DataProvider'ами). */

import type { User } from "../types";

export const DEFAULT_PREFS: User["notifications"] = {
  enabled: false,
  taskReminder: true,
  focusTime: true,
  morningBriefing: true,
  eveningReview: true,
};
