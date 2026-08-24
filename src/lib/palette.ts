import type { TaskColor } from "./types";

/* Фирменные цвета блоков задач */
export const TASK_COLORS: Record<TaskColor, string> = {
  violet: "#9D7BFF",
  indigo: "#6C7BFF",
  aqua: "#37D6C0",
  amber: "#F0B45A",
  rose: "#F2687C",
  lime: "#8FD07E",
  sky: "#5AB8F2",
  slate: "#8792AC",
};

export const COLOR_NAMES: Record<TaskColor, string> = {
  violet: "Фиолетовый",
  indigo: "Индиго",
  aqua: "Бирюза",
  amber: "Янтарь",
  rose: "Роза",
  lime: "Лайм",
  sky: "Небо",
  slate: "Графит",
};

export const TASK_ICONS: { id: string; label: string }[] = [
  { id: "briefcase", label: "Работа" },
  { id: "users", label: "Встреча" },
  { id: "book", label: "Учёба" },
  { id: "dumbbell", label: "Спорт" },
  { id: "coffee", label: "Отдых" },
  { id: "home", label: "Дом" },
  { id: "heart", label: "Здоровье" },
  { id: "music", label: "Творчество" },
  { id: "target", label: "Цели" },
  { id: "spark", label: "Идеи" },
  { id: "mail", label: "Почта" },
  { id: "calendar", label: "Событие" },
];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
