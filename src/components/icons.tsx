import React from "react";

/* Единый набор иконок Rhythm — только inline SVG (минималистичные, stroke-based). */

export type IconName =
  | "plus" | "x" | "check" | "minus" | "clock" | "calendar" | "bolt" | "tag"
  | "edit" | "trash" | "sliders" | "refresh" | "mail" | "lock" | "user" | "users"
  | "sun" | "spark" | "chart" | "briefcase" | "book" | "dumbbell" | "home" | "coffee"
  | "heart" | "music" | "target" | "flame" | "moon" | "grip" | "external" | "alert"
  | "info" | "play" | "chevronDown" | "chevronRight" | "arrowRight" | "logout"
  | "mic" | "dot" | "shield" | "layers" | "timer" | "cloud" | "pulse" | "download" | "file";

const P: Record<IconName, React.ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M18 6L6 18M6 6l12 12" />,
  check: <path d="M4.5 12.5l5 5L20 6.5" />,
  clock: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>),
  calendar: (<><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M8 3v4M16 3v4M3.5 10.5h17" /></>),
  bolt: <path d="M13 2.5L4.5 14H11l-1 7.5L18.5 10H12l1-7.5z" />,
  tag: (<><path d="M20.6 13.4L12.6 21.4a2 2 0 01-2.8 0L3 14.6V8a2 2 0 012-2h2a2 2 0 012-2h6.6l5 5a2 2 0 010 2.8z" transform="translate(0,1) scale(0.95)" /><circle cx="9" cy="9" r="1.4" fill="currentColor" stroke="none" /></>),
  edit: (<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7.5 18.5 3 20l1.5-4.5L16.5 3.5z" /></>),
  trash: (<><path d="M3.5 6.5h17" /><path d="M8.5 6.5v-2a1.5 1.5 0 011.5-1.5h4a1.5 1.5 0 011.5 1.5v2" /><path d="M18.5 6.5l-.9 12.6a2 2 0 01-2 1.9H8.4a2 2 0 01-2-1.9L5.5 6.5" /><path d="M10 11v6M14 11v6" /></>),
  sliders: (<><path d="M5 21v-6M5 9V3M12 21v-9M12 6V3M19 21v-3M19 12V3" /><path d="M2 15h6M9 6h6M16 18h6" /></>),
  refresh: (<><path d="M3 12a9 9 0 0115.5-6.2L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 01-15.5 6.2L3 16" /><path d="M3 21v-5h5" /></>),
  mail: (<><rect x="2.5" y="5" width="19" height="14.5" rx="2.5" /><path d="M3.5 7.5l8.5 6 8.5-6" /></>),
  lock: (<><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></>),
  user: (<><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c.6-3.7 3.6-5.8 7.5-5.8s6.9 2.1 7.5 5.8" /></>),
  users: (<><circle cx="9" cy="8.5" r="3.4" /><path d="M2.8 20c.5-3.3 3-5.2 6.2-5.2s5.7 1.9 6.2 5.2" /><path d="M15.5 5.4a3.4 3.4 0 010 6.2" /><path d="M17.8 15.1c2 .7 3.2 2.3 3.5 4.9" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M19 5l-1.4 1.4M6.4 17.6L5 19" /></>),
  spark: (<><path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9L12 3z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16z" /></>),
  chart: (<><path d="M3.5 3.5v17h17" /><path d="M8.5 16.5v-5M13 16.5V7.5M17.5 16.5v-8" /></>),
  briefcase: (<><rect x="3" y="7.5" width="18" height="13" rx="2.5" /><path d="M8.5 7.5V5.5a2 2 0 012-2h3a2 2 0 012 2v2" /><path d="M3 13h18" /></>),
  book: (<><path d="M4 19.5A2.5 2.5 0 016.5 17H20V3.5H6.5A2.5 2.5 0 004 6v13.5z" /><path d="M4 19.5A2.5 2.5 0 006.5 22H20v-5" /></>),
  dumbbell: (<><path d="M4 9.5v5M8 7v10M16 7v10M20 9.5v5M8 12h8" /></>),
  home: (<><path d="M3.5 10.5L12 3.5l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>),
  coffee: (<><path d="M4.5 9h11v5.5a4 4 0 01-4 4h-3a4 4 0 01-4-4V9z" /><path d="M15.5 10h1.7a2.3 2.3 0 010 4.6h-1.7" /><path d="M7.5 3.5V6M11 3v3.5" /></>),
  heart: <path d="M20.8 5.2a5.3 5.3 0 00-7.6 0L12 6.4l-1.2-1.2a5.3 5.3 0 00-7.6 7.4l1.2 1.2L12 21l7.6-7.2 1.2-1.2a5.3 5.3 0 000-7.4z" />,
  music: (<><path d="M9 18.5V6l11-2.5V16" /><circle cx="6.5" cy="18.5" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></>),
  target: (<><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>),
  flame: <path d="M12 2.8s5.5 4.4 5.5 9.4a5.5 5.5 0 01-11 0c0-2.2 1-4.3 2.2-5.7 0 2.2 1 3.3 2.1 3.5-.9-2.3-.6-5 1.2-7.2z" />,
  moon: <path d="M20 13.2A8.2 8.2 0 1110.8 4a6.6 6.6 0 009.2 9.2z" />,
  grip: (<>{[7, 12, 17].flatMap((y) => [9, 15].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.15" fill="currentColor" stroke="none" />))}</>),
  external: (<><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 13.5V18a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2h4.5" /></>),
  alert: (<><path d="M10.3 3.9L1.9 18a2 2 0 001.7 3h16.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4.5" /><circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" /></>),
  info: (<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.7" fill="currentColor" stroke="none" /></>),
  play: <path d="M8 5.5v13l11-6.5-11-6.5z" />,
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  chevronRight: <path d="M9.5 6l6 6-6 6" />,
  arrowRight: (<><path d="M4 12h15" /><path d="M13 6l6 6-6 6" /></>),
  logout: (<><path d="M9.5 21H6a2 2 0 01-2-2V5a2 2 0 012-2h3.5" /><path d="M16 16.5L20.5 12 16 7.5" /><path d="M20.5 12H9.5" /></>),
  mic: (<><rect x="9" y="3" width="6" height="11.5" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0013 0" /><path d="M12 18v3.5" /></>),
  dot: <circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none" />,
  shield: (<><path d="M12 2.5l7.5 3v6c0 4.8-3.2 8.4-7.5 10-4.3-1.6-7.5-5.2-7.5-10v-6l7.5-3z" /><path d="M9 11.5l2.2 2.2L15.5 9.5" /></>),
  layers: (<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3.5 12.5L12 17l8.5-4.5" /><path d="M3.5 16.5L12 21l8.5-4.5" /></>),
  timer: (<><circle cx="12" cy="13.5" r="7.5" /><path d="M12 10v3.5l2.3 1.5" /><path d="M9.5 3h5" /><path d="M12 3v3" /></>),
  cloud: <path d="M7 18.5a4.5 4.5 0 01-.6-8.96 6 6 0 0111.6 1.6A3.9 3.9 0 0117.5 18.5H7z" />,
  pulse: <path d="M3 12.5h3.5L9 5.5l4.5 13 2.5-6H21" />,
  download: (<><path d="M12 4.5v10M7.8 10.8L12 15l4.2-4.2" /><path d="M4.5 19.5h15" /></>),
  file: (<><path d="M13.5 3.5H7A1.5 1.5 0 005.5 5v14A1.5 1.5 0 007 20.5h10a1.5 1.5 0 001.5-1.5V8.5l-5-5z" /><path d="M13.5 3.5v5h5" /></>),
};

export function I({
  n,
  size = 18,
  className = "",
  sw = 1.8,
}: {
  n: IconName;
  size?: number;
  className?: string;
  sw?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {P[n]}
    </svg>
  );
}

/* ---------- Логотип: ритм-волна ---------- */
export function LogoMark({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="lg-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9D7BFF" />
          <stop offset="0.5" stopColor="#6C7BFF" />
          <stop offset="1" stopColor="#37D6C0" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="#141927" />
      <rect width="40" height="40" rx="11" fill="none" stroke="rgba(255,255,255,0.08)" />
      <g stroke="url(#lg-brand)" strokeWidth="3.4" strokeLinecap="round">
        <path d="M8.5 16.5v7" />
        <path d="M14.5 12v16" />
        <path d="M20.5 7.5v25" />
        <path d="M26.5 13v14" />
        <path d="M32.5 17v6" />
      </g>
    </svg>
  );
}

/* ---------- Лица настроения (вместо эмодзи — рисованные SVG) ---------- */
const MOOD_COLORS = ["", "#F2687C", "#F5996B", "#EFC868", "#8FD07E", "#37D6C0"];
const MOOD_MOUTHS = [
  "",
  "M13.5 27.5c2-3.4 4.6-5 6.5-5s4.5 1.6 6.5 5",
  "M14 26.5c1.8-2.2 3.8-3.2 6-3.2s4.2 1 6 3.2",
  "M14.5 25.5h11",
  "M14 24.5c1.8 2.2 3.8 3.2 6 3.2s4.2-1 6-3.2",
  "M13 23.5c1.8 3.6 4.2 5.4 7 5.4s5.2-1.8 7-5.4c-2 1.1-4.4 1.7-7 1.7s-5-.6-7-1.7z",
];

export function MoodFace({ level, size = 30, active = false }: { level: number; size?: number; active?: boolean }) {
  const c = MOOD_COLORS[level] || "#8792AC";
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true" className="shrink-0">
      <circle cx="20" cy="20" r="15.5" fill={active ? `${c}22` : "rgba(255,255,255,0.03)"} stroke={c} strokeWidth={active ? 2.4 : 1.7} />
      {level === 1 ? (
        <g stroke={c} strokeWidth="2" strokeLinecap="round">
          <path d="M12.5 14.5l4 2M27.5 14.5l-4 2" />
        </g>
      ) : (
        <g fill={c}>
          <circle cx="14.5" cy="16.5" r="1.9" />
          <circle cx="25.5" cy="16.5" r="1.9" />
        </g>
      )}
      {level === 1 && (
        <g stroke={c} strokeWidth="1.6" strokeLinecap="round" fill="none">
          <path d="M12.5 22.5l3 1.2M27.5 22.5l-3 1.2" opacity="0.55" />
        </g>
      )}
      <path d={MOOD_MOUTHS[level]} stroke={c} strokeWidth="2.2" strokeLinecap="round" fill={level === 5 ? c : "none"} opacity={level === 5 ? 0.9 : 1} />
    </svg>
  );
}

export function GoogleG({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.52 5.52 0 01-2.4 3.63v3h3.88c2.27-2.1 3.56-5.17 3.56-8.82z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.27v3.11A12 12 0 0012 24z" />
      <path fill="#FBBC05" d="M5.28 14.28A7.2 7.2 0 014.9 12c0-.79.14-1.56.38-2.28V6.61H1.27a12 12 0 000 10.78l4.01-3.11z" />
      <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.59 1.8l3.44-3.44A11.98 11.98 0 0012 0 12 12 0 001.27 6.61l4.01 3.11C6.22 6.88 8.87 4.77 12 4.77z" />
    </svg>
  );
}

export function AppleMark({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.7 12.9c.03-2.4 2-3.57 2.08-3.63-1.13-1.65-2.9-1.88-3.52-1.9-1.5-.15-2.92.88-3.68.88-.76 0-1.93-.86-3.17-.83-1.63.02-3.13.94-3.97 2.4-1.7 2.94-.43 7.3 1.22 9.68.8 1.17 1.76 2.48 3.02 2.43 1.21-.05 1.67-.78 3.13-.78 1.46 0 1.87.78 3.15.76 1.3-.02 2.13-1.19 2.93-2.36.92-1.35 1.3-2.66 1.32-2.73-.03-.01-2.53-.97-2.56-3.92h.05zM14.44 5.3c.66-.8 1.11-1.92.99-3.03-.95.04-2.1.63-2.78 1.43-.61.71-1.15 1.85-1 2.95 1.06.08 2.14-.54 2.79-1.35z" />
    </svg>
  );
}

/**
 * Безопасное сужение строки до IconName: неизвестный/пустой id
 * (например, из старых данных или внешнего импорта) не роняет рендер,
 * а подставляет fallback-иконку.
 */
export function iconOf(id: string | null | undefined, fallback: IconName = "spark"): IconName {
  return id && id in P ? (id as IconName) : fallback;
}
