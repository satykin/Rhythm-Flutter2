import React, { useEffect } from "react";
import { I, IconName } from "./icons";

/* ---------- Модальное окно ---------- */
export function Modal({
  open,
  onClose,
  title,
  icon,
  children,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: IconName;
  children: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-ink-950/75 backdrop-blur-[3px] anim-fade" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative card anim-pop flex max-h-[92vh] w-full flex-col overflow-hidden"
        style={{ maxWidth: width, background: "var(--color-ink-900)" }}
      >
        <div className="flex items-center justify-between gap-4 border-b border-white/6 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-vio-400/12 text-vio-300 border border-vio-400/20">
                <I n={icon} size={16} />
              </span>
            )}
            <h2 className="font-display text-[15px] font-semibold tracking-tight text-mist-50 truncate">{title}</h2>
          </div>
          <button className="iconbtn" onClick={onClose} aria-label="Закрыть">
            <I n="x" size={16} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Поля форм ---------- */
export function Field({
  label,
  error,
  children,
  hint,
  className = "",
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="label">{label}</span>
      {children}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-bad">
          <I n="alert" size={12} /> {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-mist-500">{hint}</p>
      ) : null}
    </div>
  );
}

/* ---------- Сегментированный переключатель ---------- */
export function Seg<T extends string>({
  options,
  value,
  onChange,
  size = "md",
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex w-full rounded-[10px] border border-white/8 bg-ink-800 p-[3px] gap-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg font-bold transition-all duration-200 ${
            size === "sm" ? "px-2 py-1 text-[11.5px]" : "px-3 py-1.5 text-[12.5px]"
          } ${
            value === o.value
              ? "bg-ink-600/80 text-mist-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
              : "text-mist-400 hover:text-mist-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Пустое состояние ---------- */
export function EmptyState({
  icon,
  title,
  desc,
  children,
}: {
  icon: IconName;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="anim-rise flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center">
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-vio-400/20 blur-xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-ink-800 text-vio-300">
          <I n={icon} size={24} sw={1.6} />
        </div>
      </div>
      <h3 className="font-display text-[16px] font-semibold text-mist-50">{title}</h3>
      <p className="mt-1.5 max-w-[340px] text-[13px] leading-relaxed text-mist-400">{desc}</p>
      {children && <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">{children}</div>}
    </div>
  );
}

/* ---------- Прогресс-бар ---------- */
export function Bar({
  value,
  color = "linear-gradient(90deg,#9D7BFF,#6C7BFF)",
  h = 6,
  className = "",
}: {
  value: number;
  color?: string;
  h?: number;
  className?: string;
}) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-white/6 ${className}`} style={{ height: h }}>
      <div
        className="h-full origin-left rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  );
}

/* ---------- Кольцо прогресса ---------- */
export function Ring({
  value,
  size = 64,
  stroke = 5,
  children,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, Math.max(0, value)));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="url(#ring-grad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={off}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
        <defs>
          <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#9D7BFF" />
            <stop offset="0.55" stopColor="#6C7BFF" />
            <stop offset="1" stopColor="#37D6C0" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/* ---------- Спиннер ---------- */
export function Spinner({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={`anim-spin ${className}`} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
