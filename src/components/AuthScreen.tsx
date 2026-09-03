import React, { useMemo, useState } from "react";
import { AppleMark, GoogleG, I, LogoMark } from "./icons";
import { Field, Spinner } from "./ui";
import { useApp } from "../state/store";
import { fmtClock } from "../lib/time";

type Mode = "login" | "signup";

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());

/* декоративный мини-таймлайн для бренд-панели */
function MiniTimeline() {
  const rows = useMemo(
    () => [
      { t: "09:00", w: "72%", c: "#9D7BFF", label: "Deep Work" },
      { t: "11:30", w: "46%", c: "#6C7BFF", label: "Созвон" },
      { t: "13:00", w: "58%", c: "#37D6C0", label: "Прогулка" },
      { t: "16:00", w: "64%", c: "#F0B45A", label: "Тренировка" },
    ],
    []
  );
  return (
    <div className="card relative w-full max-w-[340px] overflow-hidden p-4 anim-rise d-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-display text-[13px] font-semibold text-mist-200">Сегодня</span>
        <span className="chip !text-aqua-300 !border-aqua-400/25 !bg-aqua-400/10">
          <span className="now-dot h-1.5 w-1.5 rounded-full bg-aqua-400" /> в ритме
        </span>
      </div>
      <div className="relative space-y-2.5 border-l border-white/8 pl-3">
        {rows.map((r, i) => (
          <div key={i} className={`anim-rise d-${i + 2} flex items-center gap-2`}>
            <span className="w-9 font-display text-[11px] font-semibold text-mist-500">{r.t}</span>
            <div
              className="flex h-8 items-center rounded-lg border px-2.5 text-[11.5px] font-bold text-mist-100"
              style={{ width: r.w, borderColor: `${r.c}44`, background: `${r.c}1a` }}
            >
              {r.label}
            </div>
          </div>
        ))}
        <div className="absolute -left-[5px] top-[38%] h-[9px] w-[9px] rounded-full bg-aqua-400 now-dot" />
      </div>
    </div>
  );
}

export default function AuthScreen() {
  const { signIn, signUp, signInWith } = useApp();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "form" | "google" | "apple">(null);
  const [clock, setClock] = useState(fmtClock());

  React.useEffect(() => {
    const t = window.setInterval(() => setClock(fmtClock()), 15_000);
    return () => window.clearInterval(t);
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (mode === "signup" && name.trim().length < 2) next.name = "Укажите имя (минимум 2 символа)";
    if (!emailOk(email)) next.email = "Похоже, в адресе ошибка";
    if (pass.length < 6) next.pass = "Пароль — минимум 6 символов";
    setErrs(next);
    setFormErr(null);
    if (Object.keys(next).length) return;

    setBusy("form");
    /* Устойчивость: любая ошибка (в т.ч. выброшенное исключение) показывает
     * текст и ГАРАНТИРОВАННО гасит спиннер через finally. */
    try {
      const err = mode === "signup" ? await signUp(name.trim(), email.trim(), pass) : await signIn(email.trim(), pass);
      if (err) setFormErr(err);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Не удалось войти — попробуйте ещё раз");
    } finally {
      setBusy(null);
    }
  };

  const oauth = async (p: "google" | "apple") => {
    setBusy(p);
    setFormErr(null);
    try {
      const err = await signInWith(p);
      if (err) setFormErr(err);
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : "Не удалось войти — попробуйте ещё раз");
    } finally {
      setBusy(null);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setErrs({});
    setFormErr(null);
  };

  return (
    <div className="relative z-10 flex h-full">
      {/* ------- бренд-панель ------- */}
      <aside className="relative hidden w-[46%] max-w-[620px] flex-col justify-between overflow-hidden border-r border-white/6 bg-ink-900/60 p-10 lg:flex">
        <div className="pointer-events-none absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-vio-400/12 blur-3xl" style={{ animation: "drift 9s ease-in-out infinite" }} />
        <div className="pointer-events-none absolute -right-16 bottom-10 h-64 w-64 rounded-full bg-aqua-400/10 blur-3xl" style={{ animation: "drift 11s ease-in-out infinite reverse" }} />

        <div className="anim-rise flex items-center gap-3">
          <LogoMark size={40} />
          <div>
            <div className="font-display text-[19px] font-bold tracking-tight text-mist-50">Rhythm</div>
            <div className="text-[11.5px] font-semibold text-mist-500">Your day, in tune with you</div>
          </div>
        </div>

        <div className="space-y-7">
          <div className="anim-rise d-1">
            <div className="mb-3 flex h-12 items-end gap-[5px]" aria-hidden>
              {[10, 22, 34, 46, 30, 18, 40, 26, 14, 32, 44, 20].map((h, i) => (
                <span
                  key={i}
                  className="eq-bar w-[5px] rounded-full"
                  style={{
                    height: h,
                    background: `linear-gradient(180deg,#9D7BFF,#37D6C0)`,
                    opacity: 0.35 + (i % 4) * 0.16,
                    animationDelay: `${i * 0.11}s`,
                  }}
                />
              ))}
            </div>
            <h1 className="font-display text-[34px] font-bold leading-[1.12] tracking-tight text-mist-50">
              Планировщик, который<br />
              <span className="text-grad">подстраивается под тебя</span>
            </h1>
            <p className="mt-3 max-w-[400px] text-[14px] leading-relaxed text-mist-400">
              Rhythm чувствует энергию, настроение и контекст — и перестраивает день,
              когда жизнь идёт не по плану.
            </p>
          </div>
          <MiniTimeline />
        </div>

        <div className="anim-rise d-4 flex items-center gap-2.5 text-[12px] font-semibold text-mist-500">
          <I n="shield" size={15} className="text-aqua-400" />
          Данные шифруются и никогда не продаются. Локальная обработка — по умолчанию.
        </div>
      </aside>

      {/* ------- форма ------- */}
      <main className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-[400px] py-8">
          <div className="anim-rise mb-7 flex items-center gap-3 lg:hidden">
            <LogoMark size={38} />
            <div>
              <div className="font-display text-[18px] font-bold tracking-tight text-mist-50">Rhythm</div>
              <div className="text-[11.5px] font-semibold text-mist-500">Your day, in tune with you</div>
            </div>
          </div>

          <div className="card anim-pop p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-display text-[19px] font-bold tracking-tight text-mist-50">
                  {mode === "login" ? "С возвращением" : "Начни свой ритм"}
                </h2>
                <p className="mt-0.5 text-[12.5px] text-mist-400">
                  {mode === "login" ? "День уже ждёт. Сейчас " : "30 секунд — и день собран. Сейчас "}
                  <span className="font-display font-semibold text-aqua-300">{clock}</span>
                </p>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 rounded-[10px] border border-white/8 bg-ink-800 p-[3px]">
              {(["login", "signup"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  data-testid={`auth-tab-${m}`}
                  className={`rounded-lg py-1.5 text-[12.5px] font-bold transition-all ${
                    mode === m ? "bg-ink-600/80 text-mist-50" : "text-mist-400 hover:text-mist-200"
                  }`}
                >
                  {m === "login" ? "Войти" : "Создать аккаунт"}
                </button>
              ))}
            </div>

            {formErr && (
              <div className="anim-pop mb-4 flex items-start gap-2.5 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2.5 text-[12.5px] font-semibold text-[#ff9aa8]">
                <I n="alert" size={15} className="mt-[1px]" /> {formErr}
              </div>
            )}

            <form onSubmit={submit} className="space-y-4" noValidate>
              {mode === "signup" && (
                <Field label="Имя" error={errs.name}>
                  <input
                    className={`input ${errs.name ? "err" : ""}`}
                    placeholder="Алекс"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    data-testid="auth-name"
                  />
                </Field>
              )}
              <Field label="Почта" error={errs.email}>
                  <input
                    className={`input ${errs.email ? "err" : ""}`}
                    placeholder="you@rhythm.app"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    data-testid="auth-email"
                  />              </Field>
              <Field label="Пароль" error={errs.pass}>
                  <input
                    className={`input ${errs.pass ? "err" : ""}`}
                    placeholder="••••••••"
                    type="password"
                    value={pass}
                    onChange={(e) => setPass(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    data-testid="auth-password"
                  />              </Field>
              <button type="submit" className="btn btn-primary w-full !py-[11px]" disabled={busy !== null} data-testid="auth-submit">
                {busy === "form" ? <Spinner size={16} /> : <I n="arrowRight" size={16} />}
                {mode === "login" ? "Войти в свой день" : "Создать аккаунт"}
              </button>
            </form>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/8" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-mist-500">или</span>
              <span className="h-px flex-1 bg-white/8" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button className="btn btn-ghost" onClick={() => oauth("google")} disabled={busy !== null}>
                {busy === "google" ? <Spinner size={15} /> : <GoogleG />} Google
              </button>
              <button className="btn btn-ghost" onClick={() => oauth("apple")} disabled={busy !== null}>
                {busy === "apple" ? <Spinner size={15} /> : <AppleMark />} Apple
              </button>
            </div>
          </div>

          <p className="anim-rise d-2 mt-4 text-center text-[11.5px] leading-relaxed text-mist-500">
            Демо-режим: аккаунт и данные хранятся локально в браузере.
            <br />В проде — Supabase Auth + end-to-end шифрование.
          </p>
        </div>
      </main>
    </div>
  );
}
