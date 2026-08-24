import React, { useState } from "react";
import { AppProvider, useApp } from "./state/store";
import Shell from "./components/Shell";
import AuthScreen from "./components/AuthScreen";
import TodayScreen from "./components/TodayScreen";
import RhythmScreen from "./components/RhythmScreen";
import CharacterScreen from "./components/CharacterScreen";
import TogetherScreen from "./components/TogetherScreen";
import InsightsScreen from "./components/InsightsScreen";
import TaskModal, { TaskDraft } from "./components/TaskModal";
import { LogoMark } from "./components/icons";
import { todayKey } from "./lib/time";
import type { Task } from "./lib/types";

function Splash() {
  return (
    <div className="relative z-10 flex h-full flex-col items-center justify-center gap-5">
      <div className="anim-pop">
        <LogoMark size={64} />
      </div>
      <div className="flex h-8 items-end gap-[4px]" aria-hidden>
        {[8, 16, 26, 16, 8].map((h, i) => (
          <span
            key={i}
            className="eq-bar w-[4px] rounded-full"
            style={{ height: h, background: "linear-gradient(180deg,#9D7BFF,#37D6C0)", animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </div>
      <p className="anim-rise d-2 text-[12.5px] font-semibold text-mist-500">Настраиваем твой ритм…</p>
    </div>
  );
}

function Body() {
  const app = useApp();
  const [modal, setModal] = useState<{ open: boolean; task: Task | null; draft: TaskDraft | null }>({
    open: false,
    task: null,
    draft: null,
  });

  if (!app.booted) return <Splash />;
  if (!app.user)
    return (
      <>
        <AuthScreen />
        <div className="rhythm-bg" />
      </>
    );

  const openNew = (draft: TaskDraft | null = null) => setModal({ open: true, task: null, draft });
  const openEdit = (task: Task) => setModal({ open: true, task, draft: null });
  const close = () => setModal((m) => ({ ...m, open: false }));

  return (
    <>
      <div className="rhythm-bg" />
      <Shell onNewTask={() => openNew()}>
        {app.tab === "today" && <TodayScreen onEdit={openEdit} onNewAt={(date, startMin) => openNew({ date, startMin })} />}
        {app.tab === "rhythm" && <RhythmScreen onPlanSlot={(start, end) => openNew({ date: todayKey(), startMin: start, endMin: end })} />}
        {app.tab === "character" && <CharacterScreen />}
        {app.tab === "together" && <TogetherScreen />}
        {app.tab === "insights" && <InsightsScreen />}
      </Shell>
      <TaskModal open={modal.open} task={modal.task} draft={modal.draft} onClose={close} />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Body />
    </AppProvider>
  );
}
