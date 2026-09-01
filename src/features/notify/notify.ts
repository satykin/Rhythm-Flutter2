/* ============================================================
 * Push-уведомления (Web Notifications + Service Worker).
 * В проде — FCM/web-push через Supabase Edge Functions;
 * здесь локальный планировщик с теми же 4 типами уведомлений
 * и уважением тихих часов профиля.
 * ============================================================ */

import type { NotifPrefs, Task } from "../../lib/types";
import { minToHM, todayKey } from "../../lib/time";
import { productivityWindows } from "../suggestions/suggestionService";

export type NotifType = "task_reminder" | "focus_time" | "morning_briefing" | "evening_review";

/* Ключи совпадают с NotifPrefs (кроме enabled) */
export const NOTIF_META: Record<Exclude<keyof NotifPrefs, "enabled">, { label: string; desc: string }> = {
  taskReminder: { label: "Напоминания о задачах", desc: "за 5–10 минут до начала блока" },
  focusTime: { label: "Золотое время фокуса", desc: "когда начинается твоё продуктивное окно" },
  morningBriefing: { label: "Утренний брифинг", desc: "план дня в 09:00" },
  eveningReview: { label: "Вечерний обзор", desc: "итоги и чек-ин в 21:00" },
};

export interface NotifContext {
  prefs: NotifPrefs;
  quietFrom: number;
  quietTo: number;
  tasks: Task[];
}

export const isQuiet = (min: number, from: number, to: number): boolean =>
  from <= to ? min >= from && min < to : min >= from || min < to;

export const notify = {
  supported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
  },

  permission(): NotificationPermission | "unsupported" {
    return this.supported() ? Notification.permission : "unsupported";
  },

  async request(): Promise<boolean> {
    if (!this.supported()) return false;
    try {
      return (await Notification.requestPermission()) === "granted";
    } catch {
      return false;
    }
  },

  fire(title: string, body: string, tag: string) {
    if (!this.supported() || Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, tag, silent: false });
    } catch {
      /* некоторые браузеры требуют SW.showNotification */
    }
  },
};

/* ---------- дедупликация срабатываний ---------- */

const FIRED_KEY = "rhythm.notified.v1";

function firedMap(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function markFired(key: string) {
  try {
    const map = firedMap();
    const today = todayKey();
    for (const k of Object.keys(map)) if (!k.startsWith(today)) delete map[k];
    map[key] = Date.now();
    localStorage.setItem(FIRED_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/* ---------- тик планировщика (чистая логика + сайд-эффекты fire) ---------- */

export function schedulerTick(ctx: NotifContext, now = new Date()): string[] {
  const fired: string[] = [];
  const { prefs, tasks } = ctx;
  if (!prefs.enabled || !notify.supported() || Notification.permission !== "granted") return fired;

  const min = now.getHours() * 60 + now.getMinutes();
  const date = todayKey();
  if (isQuiet(min, ctx.quietFrom, ctx.quietTo)) return fired;
  const map = firedMap();
  const tryFire = (key: string, title: string, body: string) => {
    const fullKey = `${date}:${key}`;
    if (map[fullKey]) return;
    notify.fire(title, body, fullKey);
    markFired(fullKey);
    fired.push(fullKey);
  };

  /* 1 — напоминание о задаче (за 5–10 мин) */
  if (prefs.taskReminder) {
    for (const t of tasks) {
      if (t.date !== date || t.status !== "todo" || t.recurrenceRule) continue;
      const delta = t.startMin - min;
      if (delta > 0 && delta <= 10) {
        tryFire(`tr:${t.id}`, "Rhythm · скоро задача", `«${t.title}» начнётся в ${minToHM(t.startMin)}`);
      }
    }
  }

  /* 2 — золотое время фокуса (окно начинается в ближайшие 5 мин) */
  if (prefs.focusTime) {
    const wins = productivityWindows(tasks);
    for (const w of wins.slice(0, 1)) {
      const delta = w.start - min;
      if (delta > 0 && delta <= 5) {
        tryFire(`ft:${w.start}`, "Rhythm · золотое время", `С ${minToHM(w.start)} твоё продуктивное окно — время для сложной задачи`);
      }
    }
  }

  /* 3 — утренний брифинг (09:00–09:29) */
  if (prefs.morningBriefing && now.getHours() === 9 && now.getMinutes() < 30) {
    const day = tasks.filter((t) => t.date === date && t.status === "todo" && !t.recurrenceRule);
    const first = [...day].sort((a, b) => a.startMin - b.startMin)[0];
    tryFire(
      "mb",
      "Rhythm · доброе утро",
      day.length
        ? `Сегодня ${day.length} задач${first ? `, первая — «${first.title}» в ${minToHM(first.startMin)}` : ""}`
        : "Сегодня задач нет — идеальный день, чтобы добавить одну"
    );
  }

  /* 4 — вечерний обзор (21:00–21:29) */
  if (prefs.eveningReview && now.getHours() === 21 && now.getMinutes() < 30) {
    const day = tasks.filter((t) => t.date === date && !t.recurrenceRule);
    const done = day.filter((t) => t.status === "done").length;
    tryFire("er", "Rhythm · итоги дня", `Выполнено ${done} из ${day.length}. Отметь настроение — это поможет плану на завтра.`);
  }

  return fired;
}

/* ---------- фоновый цикл ---------- */

let interval: number | null = null;

export function startScheduler(getCtx: () => NotifContext | null) {
  if (interval !== null) return;
  const tick = () => {
    const ctx = getCtx();
    if (ctx) schedulerTick(ctx);
  };
  tick();
  interval = window.setInterval(tick, 30_000);
}

export function stopScheduler() {
  if (interval !== null) {
    window.clearInterval(interval);
    interval = null;
  }
}

/* ---------- регистрация Service Worker ---------- */

export async function registerWorker(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return false;
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    return true;
  } catch {
    return false;
  }
}
