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

/* ============================================================
 * Цветовые темы таймлайна (Этап 2): 5 пресетов + точечный custom.
 * ============================================================ */

import type { PaletteId, User } from "./types";

export const PALETTES: Record<PaletteId, { label: string; swatch: [string, string, string]; map: Partial<Record<TaskColor, string>> }> = {
  default: { label: "Rhythm", swatch: ["#9D7BFF", "#6C7BFF", "#37D6C0"], map: {} },
  ocean: {
    label: "Океан", swatch: ["#5AB8F2", "#4C7DF0", "#37D6C0"],
    map: { violet: "#5AB8F2", indigo: "#4C7DF0", amber: "#7FD1E8", rose: "#8FA8FF", lime: "#4FD8B0", sky: "#3FC3F0", slate: "#7C93B8" },
  },
  sunset: {
    label: "Закат", swatch: ["#FF8A6B", "#F2687C", "#F0B45A"],
    map: { violet: "#FF8A6B", indigo: "#F2687C", aqua: "#F0B45A", amber: "#FFC069", rose: "#FF6F91", lime: "#F9D371", sky: "#E8927C", slate: "#C49A8A" },
  },
  forest: {
    label: "Лес", swatch: ["#7FBF6B", "#4F9E78", "#37C6A4"],
    map: { violet: "#7FBF6B", indigo: "#4F9E78", aqua: "#37C6A4", amber: "#C9C25A", rose: "#B57F5F", sky: "#6FBF9A", slate: "#8AA592" },
  },
  mono: {
    label: "Моно", swatch: ["#A8B3CC", "#8E9BB8", "#74839F"],
    map: { violet: "#A8B3CC", indigo: "#8E9BB8", aqua: "#74839F", amber: "#B9C2D6", rose: "#9AA6BE", lime: "#C6CEDF", sky: "#828FA9", slate: "#6E7B94" },
  },
};

export const PALETTE_LIST = (Object.keys(PALETTES) as PaletteId[]).map((id) => ({ id, ...PALETTES[id] }));

/** Итоговые цвета блоков: дефолт → пресет → кастомная точка. */
export function resolveColors(user: Pick<User, "themePalette" | "customColor"> | null | undefined): Record<TaskColor, string> {
  const base: Record<TaskColor, string> = { ...TASK_COLORS };
  if (!user) return base;
  const preset = PALETTES[user.themePalette ?? "default"]?.map;
  if (preset) Object.assign(base, preset);
  if (user.customColor) base[user.customColor.slot] = user.customColor.hex;
  return base;
}
