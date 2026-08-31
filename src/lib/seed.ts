/* Детерминированный генератор демо-данных для нового пользователя:
 * сегодняшний таймлайн (с учётом текущего времени), история за 2 недели,
 * mood_logs, routines, focus_sessions и task_templates. */

import type { FocusSession, FlowType, MoodLog, Routine, Task, TaskColor, TaskStatus, TaskTemplate, User } from "./types";
import { addDaysKey, nowMin, todayKey, uid, weekdayIdx } from "./time";

/* простой LCG — данные стабильны между перезагрузками */
let s = 42;
const rnd = () => {
  s = (s * 1664525 + 1013904223) % 4294967296;
  return s / 4294967296;
};

interface Tpl {
  title: string;
  icon: string;
  color: TaskColor;
  start: number;
  dur: number;
  energy: Task["energy"];
  tags?: string[];
}

const DAY_POOL: Tpl[] = [
  { title: "Deep Work: ключевой проект", icon: "briefcase", color: "violet", start: 540, dur: 90, energy: "high", tags: ["работа", "deep work"] },
  { title: "Созвон с командой", icon: "users", color: "indigo", start: 660, dur: 45, energy: "medium", tags: ["работа"] },
  { title: "Обед и прогулка", icon: "coffee", color: "aqua", start: 750, dur: 60, energy: "low", tags: ["отдых"] },
  { title: "Почта и сообщения", icon: "mail", color: "sky", start: 840, dur: 30, energy: "low", tags: ["рутина"] },
  { title: "Дизайн-ревью", icon: "layers", color: "rose", start: 900, dur: 60, energy: "medium", tags: ["работа"] },
  { title: "Тренировка", icon: "dumbbell", color: "lime", start: 1050, dur: 60, energy: "high", tags: ["здоровье"] },
  { title: "Чтение", icon: "book", color: "sky", start: 1200, dur: 45, energy: "low", tags: ["рост"] },
  { title: "Английский", icon: "music", color: "amber", start: 1005, dur: 45, energy: "medium", tags: ["рост"] },
  { title: "Планирование дня", icon: "target", color: "slate", start: 1290, dur: 20, energy: "low", tags: ["рутина"] },
];

const statusFor = (start: number, end: number, now: number): TaskStatus =>
  end <= now ? (rnd() > 0.12 ? "done" : "skipped") : "todo";

const MOOD_TAGS: string[][] = [["прогулка"], ["фокус"], ["встречи"], ["спорт", "энергия"], ["усталость"], ["спокойствие"]];

const FLOW_SOUNDS = [["rain"], ["cafe"], ["white_noise"], ["forest"], ["waves"], ["rain", "cafe"]];

export function seedFor(user: User): {
  tasks: Task[];
  routines: Routine[];
  moods: MoodLog[];
  templates: TaskTemplate[];
  focusSessions: FocusSession[];
} {
  s = (user.id.length * 2654435761) % 4294967296 || 42;
  const tasks: Task[] = [];
  const moods: MoodLog[] = [];
  const focusSessions: FocusSession[] = [];
  const today = todayKey();
  const now = nowMin();

  /* --- история за 14 дней --- */
  for (let back = 14; back >= 1; back--) {
    const date = addDaysKey(today, -back);
    const isWeekend = weekdayIdx(date) >= 5;
    const count = isWeekend ? 3 : 5 + Math.floor(rnd() * 3);
    const shuffled = [...DAY_POOL].sort(() => rnd() - 0.5).slice(0, count);
    const dayTaskIds: string[] = [];
    for (const tpl of shuffled) {
      const end = tpl.start + tpl.dur;
      const id = uid();
      dayTaskIds.push(id);
      tasks.push({
        id, userId: user.id, title: tpl.title, description: "",
        date, startMin: tpl.start, endMin: end,
        color: tpl.color, icon: tpl.icon, tags: tpl.tags ?? [],
        energy: tpl.energy, status: statusFor(tpl.start, end, 24 * 60),
        source: "local", syncStatus: "synced",
        createdAt: date, updatedAt: date,
      });
    }

    /* фокус-сессии: 0–2 в день, чаще по будням */
    const sessCount = isWeekend ? (rnd() > 0.5 ? 1 : 0) : rnd() > 0.25 ? 2 : 1;
    for (let i = 0; i < sessCount; i++) {
      const type: FlowType = rnd() > 0.45 ? "deep" : rnd() > 0.5 ? "creative" : "light";
      const planned = type === "deep" ? 50 : type === "creative" ? 25 : 15;
      const brk = type === "deep" ? 10 : type === "creative" ? 5 : 3;
      const completed = rnd() > 0.15;
      const ratio = completed ? 0.85 + rnd() * 0.15 : 0.4 + rnd() * 0.4;
      const cycles = type === "light" ? 1 : 1 + Math.floor(rnd() * 2);
      const hour = 9 + Math.floor(rnd() * 9);
      focusSessions.push({
        id: uid(), userId: user.id, date,
        startedAt: `${date}T${String(hour).padStart(2, "0")}:00:00`,
        type, plannedFocusMin: planned, plannedBreakMin: brk,
        focusMin: Math.round(planned * ratio * cycles),
        breakMin: brk * (cycles - (completed ? 0 : 1) > 0 ? cycles - 1 : 0),
        cycles: completed ? cycles : Math.max(0, cycles - 1),
        completed,
        sounds: FLOW_SOUNDS[Math.floor(rnd() * FLOW_SOUNDS.length)],
      });
    }

    /* настроение: 1–2 чек-ина, коррелирует со сном */
    const base = 2.6 + (user.sleepHours - 6) * 0.35 + rnd() * 1.6;
    const mood = Math.max(1, Math.min(5, Math.round(base)));
    moods.push({
      id: uid(), userId: user.id, date, timeMin: 13 * 60, mood,
      tags: MOOD_TAGS[Math.floor(rnd() * MOOD_TAGS.length)],
      linkedTaskIds: dayTaskIds.slice(0, 3),
      note: rnd() > 0.72 ? ["День шёл по плану", "Много встреч, мало фокуса", "Хороший поток утром", "Устал к вечеру"][Math.floor(rnd() * 4)] : undefined,
      source: "manual",
      loggedAt: `${date}T13:00:00.000Z`,
      updatedAt: `${date}T13:00:00.000Z`,
    });
    if (rnd() > 0.5) {
      moods.push({
        id: uid(), userId: user.id, date, timeMin: 20 * 60,
        mood: Math.max(1, Math.min(5, Math.round(base + rnd() * 1.4 - 0.4))),
        tags: [], linkedTaskIds: [],
        source: "manual",
        loggedAt: `${date}T20:00:00.000Z`,
        updatedAt: `${date}T20:00:00.000Z`,
      });
    }
  }

  /* --- сегодняшний день --- */
  const todayPlan: Tpl[] = [
    { title: "Утренняя разминка", icon: "sun", color: "amber", start: 450, dur: 30, energy: "medium", tags: ["здоровье"] },
    { title: "Deep Work: ключевой проект", icon: "briefcase", color: "violet", start: 540, dur: 90, energy: "high", tags: ["работа", "deep work"] },
    { title: "Созвон с командой", icon: "users", color: "indigo", start: 660, dur: 45, energy: "medium", tags: ["работа"] },
    { title: "Обед и прогулка", icon: "coffee", color: "aqua", start: 750, dur: 60, energy: "low", tags: ["отдых"] },
    { title: "Дизайн-ревью", icon: "layers", color: "rose", start: 870, dur: 60, energy: "medium", tags: ["работа"] },
    { title: "Тренировка", icon: "dumbbell", color: "lime", start: 990, dur: 60, energy: "high", tags: ["здоровье"] },
    { title: "Чтение", icon: "book", color: "sky", start: 1170, dur: 45, energy: "low", tags: ["рост"] },
    { title: "Планирование завтрашнего дня", icon: "target", color: "slate", start: 1260, dur: 20, energy: "low", tags: ["рутина"] },
  ];
  for (const tpl of todayPlan) {
    const end = tpl.start + tpl.dur;
    tasks.push({
      id: uid(), userId: user.id, title: tpl.title,
      description: tpl.title.startsWith("Deep Work")
        ? "Спринт по основной задаче. Телефон в режиме «Не беспокоить»."
        : "",
      date: today, startMin: tpl.start, endMin: end,
      color: tpl.color, icon: tpl.icon, tags: tpl.tags ?? [],
      energy: tpl.energy, status: statusFor(tpl.start, end, now),
      source: "local", syncStatus: "local",
      createdAt: today, updatedAt: today,
    });
  }

  const routines: Routine[] = [
    { id: uid(), userId: user.id, title: "Зарядка", icon: "sun", color: "amber", durationMin: 15, timeHint: "07:30", days: [0, 1, 2, 3, 4] },
    { id: uid(), userId: user.id, title: "Медитация", icon: "moon", color: "violet", durationMin: 10, timeHint: "08:00", days: [0, 1, 2, 3, 4, 5, 6] },
    { id: uid(), userId: user.id, title: "Прогулка в обед", icon: "coffee", color: "aqua", durationMin: 20, timeHint: "12:30", days: [0, 1, 2, 3, 4] },
    { id: uid(), userId: user.id, title: "Вечернее чтение", icon: "book", color: "sky", durationMin: 30, timeHint: "21:00", days: [0, 1, 2, 3, 4, 5, 6] },
  ];

  const templates: TaskTemplate[] = [
    { id: uid(), userId: user.id, title: "Deep Work", icon: "briefcase", color: "violet", durationMin: 90, energy: "high", tags: ["работа", "deep work"] },
    { id: uid(), userId: user.id, title: "Созвон", icon: "users", color: "indigo", durationMin: 30, energy: "medium", tags: ["работа"] },
    { id: uid(), userId: user.id, title: "Прогулка", icon: "coffee", color: "aqua", durationMin: 20, energy: "low", tags: ["отдых"] },
    { id: uid(), userId: user.id, title: "Разбор почты", icon: "mail", color: "sky", durationMin: 30, energy: "low", tags: ["рутина"] },
    { id: uid(), userId: user.id, title: "Тренировка", icon: "dumbbell", color: "lime", durationMin: 60, energy: "high", tags: ["здоровье"] },
    { id: uid(), userId: user.id, title: "Творческий блок", icon: "music", color: "amber", durationMin: 45, energy: "medium", tags: ["творчество"] },
  ];

  return { tasks, routines, moods, templates, focusSessions };
}
