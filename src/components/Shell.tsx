import React, { useEffect, useMemo, useRef, useState } from "react";
import { GoogleG, I, IconName, LogoMark } from "./icons";
import { Modal, Seg, Spinner } from "./ui";
import { useApp } from "../state/store";
import type { TabId, TaskColor, Toast } from "../lib/types";
import { fmtClock, fmtDateLong, hmToMin, minToHM, todayKey, plural } from "../lib/time";
import { COLOR_NAMES, initials, PALETTE_LIST, TASK_COLORS } from "../lib/palette";
import { NOTIF_META, notify } from "../features/notify/notify";

const NOTIF_KEYS = Object.keys(NOTIF_META) as (keyof typeof NOTIF_META)[];

function Switch({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative h-[20px] w-[36px] shrink-0 rounded-full transition-colors ${on ? "bg-aqua-500" : "bg-ink-600"}`}
    >
      <span className={`absolute top-[2.5px] h-[15px] w-[15px] rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-[3px]"}`} />
    </button>
  );
}

const NAV: { id: TabId; icon: IconName; label: string; short: string }[] = [
  { id: "today", icon: "sun", label: "Сегодня", short: "День" },
  { id: "flow", icon: "play", label: "Фокус", short: "Фокус" },
  { id: "rhythm", icon: "pulse", label: "Ритм", short: "Ритм" },
  { id: "journal", icon: "book", label: "Журнал", short: "Журнал" },
  { id: "mood", icon: "heart", label: "Обзор", short: "Обзор" },
  { id: "character", icon: "spark", label: "Персонаж", short: "Герой" },
  { id: "together", icon: "users", label: "Вместе", short: "Вместе" },
  { id: "insights", icon: "chart", label: "Инсайты", short: "Данные" },
];

const TITLES: Record<TabId, { t: string; s: string }> = {
  today: { t: "Сегодня", s: "Твой адаптивный таймлайн" },
  flow: { t: "Фокус", s: "Flow Sessions: таймер, звуки, музыка" },
  rhythm: { t: "Ритм", s: "Энергия дня и лучшие слоты" },
  journal: { t: "Журнал", s: "Лента состояний, заметки и связи" },
  mood: { t: "Обзор настроения", s: "Неделя, месяц и паттерны" },
  character: { t: "Персонаж", s: "Life Character: уровни и статы" },
  together: { t: "Вместе", s: "Sync-сессии и статусы друзей" },
  insights: { t: "Инсайты", s: "Паттерны твоей продуктивности" },
};

export const timeAgo = (ts?: number) => {
  if (!ts) return "ещё не было";
  const d = Math.max(0, Date.now() - ts);
  if (d < 45_000) return "только что";
  const m = Math.round(d / 60_000);
  if (m < 60) return `${m} ${plural(m, "минуту", "минуты", "минут")} назад`;
  const h = Math.round(m / 60);
  return `${h} ${plural(h, "час", "часа", "часов")} назад`;
};

/* ================= Тосты ================= */
function ToastHost() {
  const { toasts, dismissToast } = useApp();
  const icon: Record<Toast["kind"], IconName> = { success: "check", info: "info", error: "alert" };
  const color: Record<Toast["kind"], string> = {
    success: "text-ok border-ok/30 bg-[#0f1d18]",
    info: "text-ind-400 border-ind-400/30 bg-[#101425]",
    error: "text-bad border-bad/30 bg-[#201116]",
  };
  return (
    <div className="pointer-events-none fixed bottom-20 right-5 z-[70] flex w-[min(320px,calc(100vw-40px))] flex-col gap-2 lg:bottom-5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`anim-toast pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-xl backdrop-blur ${color[t.kind]}`}
        >
          <I n={icon[t.kind]} size={16} className="mt-[1px]" />
          <p className="flex-1 text-[12.5px] font-semibold leading-snug text-mist-100">{t.text}</p>
          <button className="text-mist-500 transition hover:text-mist-200" onClick={() => dismissToast(t.id)} aria-label="Скрыть">
            <I n="x" size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ================= Настройки ================= */
function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const app = useApp();
  const { user, sync, syncLog } = app;
  const [armed, setArmed] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [syncLog, sync.syncing]);

  useEffect(() => {
    if (!open) setArmed(false);
  }, [open]);

  if (!user) return null;
  return (
    <Modal open={open} onClose={onClose} title="Настройки" icon="sliders" width={620}>
      <div className="space-y-6">
        {/* аккаунт */}
        <section className="flex items-center gap-4">
          <div className="grad-brand flex h-14 w-14 items-center justify-center rounded-2xl font-display text-[18px] font-bold text-white shadow-lg">
            {initials(user.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-semibold text-mist-50">{user.name}</div>
            <div className="truncate text-[12.5px] text-mist-400">{user.email}</div>
          </div>
          <span className="chip">
            {user.provider === "email" ? <I n="mail" size={11} /> : user.provider === "google" ? <GoogleG size={11} /> : <I n="user" size={11} />}
            {user.provider === "email" ? "Email" : user.provider === "google" ? "Google" : "Apple"}
          </span>
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* акцент */}
          <section className="card !rounded-xl p-4">
            <span className="label">Личный акцент</span>
            <div className="mt-1 flex gap-2.5">
              {(["violet", "indigo", "aqua"] as const).map((a) => {
                const grad =
                  a === "violet"
                    ? "linear-gradient(120deg,#9D7BFF,#6C7BFF)"
                    : a === "indigo"
                    ? "linear-gradient(120deg,#6C7BFF,#5AB8F2)"
                    : "linear-gradient(120deg,#37D6C0,#6C7BFF)";
                return (
                  <button
                    key={a}
                    onClick={() => {
                      app.updateUser({ accent: a });
                      app.toast("success", `Акцент изменён: ${a === "violet" ? "фиолет" : a === "indigo" ? "индиго" : "бирюза"}`);
                    }}
                    className={`h-9 flex-1 rounded-lg border-2 transition ${
                      user.accent === a ? "border-white/70 scale-[1.03]" : "border-transparent opacity-70 hover:opacity-100"
                    }`}
                    style={{ background: grad }}
                    aria-label={a}
                  />
                );
              })}
            </div>
          </section>

          {/* сон */}
          <section className="card !rounded-xl p-4">
            <span className="label">Сон прошлой ночью</span>
            <div className="flex items-center gap-3">
              <I n="moon" size={16} className="text-ind-400" />
              <input
                type="range"
                min={4}
                max={10}
                step={0.5}
                value={user.sleepHours}
                onChange={(e) => app.updateUser({ sleepHours: Number(e.target.value) })}
                className="flex-1 accent-[#9D7BFF]"
              />
              <span className="w-12 text-right font-display text-[14px] font-bold text-mist-100">
                {user.sleepHours.toFixed(1).replace(".0", "")} ч
              </span>
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed text-mist-500">Влияет на кривую энергии в «Ритме» и умные подсказки.</p>
          </section>

          {/* тема таймлайна */}
          <section className="card !rounded-xl p-4">
            <span className="label">Тема таймлайна</span>
            <div className="mt-1 flex gap-2">
              {PALETTE_LIST.map((p) => (
                <button
                  key={p.id}
                  title={p.label}
                  onClick={() => {
                    app.updateUser({ themePalette: p.id });
                    app.toast("success", `Тема: ${p.label}`);
                  }}
                  className={`flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border-2 transition ${
                    user.themePalette === p.id ? "border-white/70 scale-[1.03]" : "border-transparent opacity-70 hover:opacity-100"
                  } bg-ink-800`}
                  aria-label={p.label}
                >
                  {p.swatch.map((c) => (
                    <span key={c} className="h-3.5 w-3.5 rounded-full" style={{ background: c }} />
                  ))}
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-[11px] font-bold text-mist-500">Свой цвет:</span>
              <select
                className="input !w-auto !py-1 !text-[11.5px]"
                value={user.customColor?.slot ?? "violet"}
                onChange={(e) =>
                  app.updateUser({ customColor: { slot: e.target.value as TaskColor, hex: user.customColor?.hex ?? "#C084FC" } })
                }
                aria-label="Слот цвета"
              >
                {(Object.keys(TASK_COLORS) as TaskColor[]).map((c) => (
                  <option key={c} value={c}>{COLOR_NAMES[c]}</option>
                ))}
              </select>
              <input
                type="color"
                value={user.customColor?.hex ?? "#C084FC"}
                onChange={(e) =>
                  app.updateUser({ customColor: { slot: user.customColor?.slot ?? "violet", hex: e.target.value } })
                }
                className="h-8 w-10 cursor-pointer rounded-md border border-white/10 bg-ink-800"
                aria-label="Выбор цвета"
              />
            </div>
          </section>

          {/* уведомления */}
          <section className="card !rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="label !mb-0">Push-уведомления</span>
              <Switch
                on={user.notifications.enabled}
                onToggle={async () => {
                  const next = !user.notifications.enabled;
                  if (next && !(await notify.request())) {
                    app.toast("error", "Браузер не дал разрешение на уведомления");
                    return;
                  }
                  app.updateUser({ notifications: { ...user.notifications, enabled: next } });
                  app.toast(next ? "success" : "info", next ? "Уведомления включены" : "Уведомления выключены");
                }}
              />
            </div>
            {notify.permission() === "denied" && (
              <p className="mt-1.5 text-[11px] font-semibold text-warn">Браузер заблокировал уведомления — разреши их в настройках сайта</p>
            )}
            <div className={`mt-2.5 space-y-2 ${user.notifications.enabled ? "" : "pointer-events-none opacity-45"}`}>
              {(Object.keys(NOTIF_META) as (keyof typeof NOTIF_META)[]).map((k) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-bold text-mist-200">{NOTIF_META[k].label}</div>
                    <div className="text-[10.5px] text-mist-500">{NOTIF_META[k].desc}</div>
                  </div>
                  <Switch
                    on={user.notifications[k]}
                    onToggle={() => app.updateUser({ notifications: { ...user.notifications, [k]: !user.notifications[k] } })}
                  />
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 border-t border-white/6 pt-2">
                <div>
                  <div className="text-[12px] font-bold text-mist-200">Тихие часы</div>
                  <div className="text-[10.5px] text-mist-500">уведомления молчат</div>
                </div>
                <div className="flex items-center gap-1 text-[12px] text-mist-400">
                  <input type="time" className="input !w-auto !px-2 !py-1 !text-[11.5px]" value={minToHM(user.quietFrom)} onChange={(e) => e.target.value && app.updateUser({ quietFrom: hmToMin(e.target.value) })} aria-label="Тихие часы: начало" />
                  –
                  <input type="time" className="input !w-auto !px-2 !py-1 !text-[11.5px]" value={minToHM(user.quietTo)} onChange={(e) => e.target.value && app.updateUser({ quietTo: hmToMin(e.target.value) })} aria-label="Тихие часы: конец" />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* календарь */}
        <section className="card !rounded-xl p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/8 bg-white/4">
                <GoogleG size={17} />
              </span>
              <div>
                <div className="text-[13.5px] font-bold text-mist-100">Google Calendar</div>
                <div className="text-[12px] text-mist-400">
                  {sync.connected ? (
                    <>
                      {sync.account} · синхр. {timeAgo(sync.lastSyncAt)}
                    </>
                  ) : (
                    "Двусторонняя синхронизация событий"
                  )}
                </div>
              </div>
            </div>
            {sync.connected ? (
              <button className="btn btn-ghost !px-3 !py-1.5 !text-[12px]" onClick={app.disconnectCalendar}>
                Отключить
              </button>
            ) : (
              <button className="btn btn-primary !px-3.5 !py-1.5 !text-[12px]" onClick={() => void app.connectCalendar()} disabled={sync.syncing}>
                {sync.syncing ? <Spinner size={14} /> : <I n="external" size={14} />} Подключить
              </button>
            )}
          </div>

          {sync.connected && (
            <div className="anim-rise mt-3.5 space-y-3 border-t border-white/6 pt-3.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <button className="btn btn-aqua !px-3.5 !py-1.5 !text-[12px]" onClick={() => void app.syncNow()} disabled={sync.syncing}>
                  {sync.syncing ? <Spinner size={13} /> : <I n="refresh" size={13} />} Синхронизировать сейчас
                </button>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-mist-400">Автосинхронизация</span>
                  <button
                    role="switch"
                    aria-checked={sync.autoSync}
                    onClick={() => app.setAutoSync(!sync.autoSync)}
                    className={`relative h-[22px] w-[40px] rounded-full transition-colors ${sync.autoSync ? "bg-aqua-500" : "bg-ink-600"}`}
                  >
                    <span
                      className={`absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all ${sync.autoSync ? "left-[21px]" : "left-[3px]"}`}
                    />
                  </button>
                </div>
              </div>
              {syncLog.length > 0 && (
                <div ref={logRef} className="max-h-[110px] space-y-1 overflow-y-auto rounded-lg bg-ink-950/70 p-2.5 font-mono text-[11px] leading-relaxed">
                  {syncLog.map((l, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-mist-500">{new Date(l.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                      <span className={l.kind === "ok" ? "text-ok" : l.kind === "warn" ? "text-warn" : "text-mist-300"}>{l.text}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-mist-500">Демо-провайдер: OAuth и Calendar API v3 подключаются в этом же интерфейсе.</p>
            </div>
          )}
        </section>

        {/* данные */}
        <section className="flex flex-wrap items-center gap-2.5">
          {armed ? (
            <>
              <button
                className="btn btn-danger"
                onClick={() => {
                  setArmed(false);
                  void app.wipeAndReseed();
                }}
              >
                <I n="trash" size={14} /> Да, пересоздать
              </button>
              <button className="btn btn-ghost" onClick={() => setArmed(false)}>Отмена</button>
            </>
          ) : (
            <button className="btn btn-ghost" onClick={() => setArmed(true)}>
              <I n="refresh" size={14} /> Пересоздать демо-данные
            </button>
          )}
          <button className="btn btn-ghost ml-auto" onClick={app.signOut}>
            <I n="logout" size={14} /> Выйти
          </button>
        </section>
      </div>
    </Modal>
  );
}

/* ================= Горячие клавиши ================= */
const HOTKEYS: { keys: string; desc: string }[] = [
  { keys: "N", desc: "Новая задача" },
  { keys: "T / F / R / J", desc: "Сегодня · Фокус · Ритм · Журнал" },
  { keys: "C / G / I", desc: "Персонаж · Вместе · Инсайты" },
  { keys: "← / →", desc: "Предыдущий / следующий день (на «Сегодня»)" },
  { keys: "?", desc: "Эта справка" },
  { keys: "Esc", desc: "Закрыть окно" },
];

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Горячие клавиши" icon="bolt" width={420}>
      <div className="space-y-1.5">
        {HOTKEYS.map((h) => (
          <div key={h.keys} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-3 py-2">
            <span className="text-[12.5px] font-semibold text-mist-300">{h.desc}</span>
            <span className="font-display text-[11px] font-bold text-vio-300">{h.keys}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] font-semibold text-mist-500">Сочетания не срабатывают, когда фокус в поле ввода.</p>
    </Modal>
  );
}

/* ================= Каркас ================= */
export default function Shell({
  onNewTask,
  onHelp,
  helpOpen,
  onCloseHelp,
  children,
}: {
  onNewTask: () => void;
  onHelp: () => void;
  helpOpen: boolean;
  onCloseHelp: () => void;
  children: React.ReactNode;
}) {
  const app = useApp();
  const { tab, user, sync } = app;
  const [settings, setSettings] = useState(false);
  const [clock, setClock] = useState(fmtClock());
  /* Планировщик промптов (Фаза D): живёт в Shell, чтобы тикать на любой вкладке. */
  const prompts = useMoodPrompts();

  useEffect(() => {
    const t = window.setInterval(() => setClock(fmtClock()), 10_000);
    return () => window.clearInterval(t);
  }, []);

  const title = TITLES[tab];
  const pending = useMemo(() => app.tasks.filter((t) => t.syncStatus === "pending").length, [app.tasks]);

  return (
    <div className="relative z-10 flex h-full">
      {/* -------- sidebar -------- */}
      <aside className="hidden w-[218px] shrink-0 flex-col border-r border-white/6 bg-ink-900/55 px-3 py-4 lg:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          <LogoMark size={34} />
          <div>
            <div className="font-display text-[16px] font-bold leading-tight tracking-tight text-mist-50">Rhythm</div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-mist-500">in tune with you</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => app.setTab(n.id)}
                className={`group relative flex items-center gap-3 rounded-[10px] px-3 py-[9px] text-left text-[13.5px] font-bold transition-all duration-200 ${
                  active ? "bg-white/6 text-mist-50" : "text-mist-400 hover:bg-white/[0.035] hover:text-mist-200"
                }`}
              >
                {active && <span className="grad-brand absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full" />}
                <I n={n.icon} size={17} className={active ? "text-vio-300" : ""} />
                {n.label}
                {n.id === "today" && pending > 0 && (
                  <span className="ml-auto rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warn">{pending}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="mt-auto space-y-2.5">
          <button
            onClick={() => setSettings(true)}
            className={`flex w-full items-center gap-2.5 rounded-[10px] border px-3 py-2.5 text-left transition ${
              sync.connected
                ? "border-aqua-400/20 bg-aqua-400/[0.06] hover:bg-aqua-400/[0.1]"
                : "border-white/8 bg-white/[0.02] hover:bg-white/[0.05]"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${sync.connected ? "bg-aqua-400 now-dot" : "bg-ink-500"}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-bold text-mist-200">
                {sync.connected ? "Calendar подключён" : "Calendar не подключён"}
              </span>
              <span className="block text-[10.5px] text-mist-500">
                {sync.connected ? `синхр. ${timeAgo(sync.lastSyncAt)}` : "нажми, чтобы настроить"}
              </span>
            </span>
            {sync.syncing && <Spinner size={13} className="text-aqua-300" />}
          </button>

          {user && (
            <div className="flex items-center gap-2.5 rounded-[10px] border border-white/6 bg-white/[0.02] px-2.5 py-2">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold text-white"
                style={{
                  background:
                    user.accent === "violet"
                      ? "linear-gradient(120deg,#9D7BFF,#6C7BFF)"
                      : user.accent === "indigo"
                      ? "linear-gradient(120deg,#6C7BFF,#5AB8F2)"
                      : "linear-gradient(120deg,#37D6C0,#6C7BFF)",
                }}
              >
                {initials(user.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-bold text-mist-100">{user.name}</div>
                <div className="truncate text-[10.5px] text-mist-500">{user.email}</div>
              </div>
              <button className="iconbtn !h-7 !w-7" onClick={() => setSettings(true)} aria-label="Настройки">
                <I n="sliders" size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* -------- main -------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-white/6 bg-ink-900/40 px-4 py-3 backdrop-blur-sm sm:px-6">
          <span className="lg:hidden">
            <LogoMark size={30} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[17px] font-bold tracking-tight text-mist-50 sm:text-[19px]">
              {title.t}
              <span className="ml-2.5 hidden font-body text-[12px] font-semibold text-mist-500 sm:inline">
                {tab === "today" ? fmtDateLong(todayKey()) : title.s}
              </span>
            </h1>
          </div>
          <span className="chip hidden !text-[11.5px] md:inline-flex">
            <I n="clock" size={12} className="text-aqua-300" />
            <span className="font-display font-bold text-mist-200">{clock}</span>
          </span>
          <button className="btn btn-ghost !px-3 !py-2" onClick={onHelp} aria-label="Горячие клавиши" title="Горячие клавиши (?)">
            <I n="bolt" size={15} />
          </button>
          <button
            className="btn btn-ghost !px-3 !py-2"
            onClick={() => setSettings(true)}
            aria-label="Настройки"
          >
            <I n="sliders" size={15} />
          </button>
          <button className="btn btn-primary !px-3.5 sm:!px-4" onClick={onNewTask}>
            <I n="plus" size={15} sw={2.4} />
            <span className="hidden sm:inline">Задача</span>
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 pb-24 sm:px-6 lg:pb-6">
          {children}
        </main>

        {/* -------- mobile bottom nav -------- */}
        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/8 bg-ink-900/90 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
          {NAV.map((n) => {
            const active = tab === n.id;
            return (
              <button
                key={n.id}
                onClick={() => app.setTab(n.id)}
                className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[9px] font-bold transition ${
                  active ? "text-vio-300" : "text-mist-500"
                }`}
              >
                <I n={n.icon} size={19} sw={active ? 2.1 : 1.8} />
                {n.short}
              </button>
            );
          })}
        </nav>
      </div>

      <SettingsModal open={settings} onClose={() => setSettings(false)} />
      <HelpModal open={helpOpen} onClose={onCloseHelp} />
      <ToastHost />
    </div>
  );
}
