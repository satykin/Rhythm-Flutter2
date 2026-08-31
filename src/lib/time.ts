/* Утилиты времени. Все времена — в минутах от начала суток, даты — ключи YYYY-MM-DD. */

export const DAY_START = 6 * 60; // таймлайн начинается в 06:00
export const DAY_END = 24 * 60;

export const pad2 = (n: number) => String(n).padStart(2, "0");

export const minToHM = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;

export const hmToMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const snap = (min: number, step = 15) => Math.round(min / step) * step;

export const nowMin = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/* ---------- даты ---------- */

export const keyFor = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const todayKey = () => keyFor(new Date());

export const keyToDate = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDaysKey = (key: string, days: number) => {
  const d = keyToDate(key);
  d.setDate(d.getDate() + days);
  return keyFor(d);
};

/** 0=Пн … 6=Вс */
export const weekdayIdx = (key: string) => (keyToDate(key).getDay() + 6) % 7;

export const WD_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;
const WD_FULL = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const MONTH_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

export const weekdayShort = (key: string) => WD_SHORT[weekdayIdx(key)];
export const weekdayFull = (key: string) => WD_FULL[weekdayIdx(key)];

export const fmtDateLong = (key: string) => {
  const d = keyToDate(key);
  return `${weekdayFull(key)}, ${d.getDate()} ${MONTH_GEN[d.getMonth()]}`;
};

export const fmtDateShort = (key: string) => {
  const d = keyToDate(key);
  return `${d.getDate()} ${MONTH_GEN[d.getMonth()]}`;
};

export const relDayLabel = (key: string) => {
  const t = todayKey();
  if (key === t) return "Сегодня";
  if (key === addDaysKey(t, 1)) return "Завтра";
  if (key === addDaysKey(t, -1)) return "Вчера";
  return fmtDateShort(key);
};

/* ---------- длительности ---------- */

export const fmtDur = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
};

export const plural = (n: number, one: string, few: string, many: string) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

export const fmtClock = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

export const uid = () =>
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

export const demoHash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(36)}`;
};
