/* Детерминированный генератор демо-данных для нового пользователя:
 * сегодняшний таймлайн (с учётом текущего времени), история за 2 недели,
 * mood_logs и базовые routines. */

import type { MoodLog, Routine, Task, TaskColor, TaskStatus, User } from "./types";
import { addDaysKey, nowMin, todayKey, uid, weekdayIdx } from "./time";

/* простой LCG — данные стабильны между перезагрузками */
let s = 42;
const rnd = () => {
  s = (s * 1664525 + 1013904223) % 4294967296;
  return s / 4294967296;
};
const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];

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

export function seedFor(user: User): { tasks: Task[]; routines: Routine[]; moods: MoodLog[] } {
  s = (user.id.length * 2654435761) % 4294967296 || 42;
  const tasks: Task[] = [];
  const moods: MoodLog[] = [];
  const today = todayKey();
  const now = nowMin();

  /* --- история за 14 дней --- */
  for (let back = 14; back >= 1; back--) {
    const date = addDaysKey(today, -back);
    const isWeekend = weekdayIdx(date) >= 5;
    const count = isWeekend ? 3 : 5 + Math.floor(rnd() * 3);
    const shuffled = [...DAY_POOL].sort(() => rnd() - 0.5).slice(0, count);
    for (const tpl of shuffled) {
      const end = tpl.start + tpl.dur;
      tasks.push({
        id: uid(), userId: user.id, title: tpl.title, description: "",
        date, startMin: tpl.start, endMin: end,
        color: tpl.color, icon: tpl.icon, tags: tpl.tags ?? [],
        energy: tpl.energy, status: statusFor(tpl.start, end, 24 * 60),
        source: "local", syncStatus: "synced",
        createdAt: date, updatedAt: date,
      });
    }
    /* настроение: 1–2 чек-ина, коррелирует со сном */
    const base = 2.6 + (user.sleepHours - 6) * 0.35 + rnd() * 1.6;
    moods.push({
      id: uid(), userId: user.id, date, timeMin: 13 * 60,
      mood: Math.max(1, Math.min(5, Math.round(base))),
    });
    if (rnd() > 0.5) {
      moods.push({
        id: uid(), userId: user.id, date, timeMin: 20 * 60,
        mood: Math.max(1, Math.min(5, Math.round(base + rnd() * 1.4 - 0.4))),
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

  return { tasks, routines, moods };
}

export const randomInsight = () => pick([
  "В дни с прогулкой ты на 38% продуктивнее",
  "Пик фокуса — с 10:00 до 12:00",
  "После 7+ часов сна задачи идут на 25% быстрее",
]);
