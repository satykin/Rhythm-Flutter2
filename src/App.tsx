import React, { lazy, Suspense, useState } from "react";
import { AppProvider, useApp } from "./state/store";
import Shell from "./components/Shell";
import { Spinner } from "./components/ui";
import { LogoMark } from "./components/icons";
import { todayKey } from "./lib/time";
import { useHotkeys } from "./shared/hooks/useHotkeys";
import { parseMoodRoute, routeTab } from "./features/mood/domain/deeplinks";
import { deserializeFilters } from "./features/mood/domain/moodFilters";
import type { TabId, Task } from "./lib/types";
import type { TaskDraft } from "./components/TaskModal";

/* ---------- code-splitting (гигиена-спринт, пункт 2) ----------
 * Экраны вкладок и экранные модалки грузятся лениво: главный чанк
 * < 500 КБ, recharts автоматически выделяется в чанки
 * Insights/MoodOverview. Сегодня/Shell/auth-состояние — eagerly. */
const AuthScreen = lazy(() => import("./components/AuthScreen"));
const TodayScreen = lazy(() => import("./components/TodayScreen"));
const RhythmScreen = lazy(() => import("./components/RhythmScreen"));
const CharacterScreen = lazy(() => import("./components/CharacterScreen"));
const TogetherScreen = lazy(() => import("./components/TogetherScreen"));
const FlowScreen = lazy(() => import("./features/flow/FlowScreen"));
const JournalScreen = lazy(() => import("./features/mood/presentation/JournalScreen"));
const MoodOverviewScreen = lazy(() => import("./features/mood/presentation/MoodOverviewScreen"));
const InsightsScreen = lazy(() => import("./features/insights/InsightsScreen"));
const MoodCheckInSheet = lazy(() => import("./features/mood/presentation/MoodCheckInSheet"));
const TaskModal = lazy(() => import("./components/TaskModal"));

function ScreenLoader() {
  return (
    <div className="anim-fade flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner size={22} className="text-vio-300" />
      <p className="text-[12px] font-semibold text-mist-500">Загружаем экран…</p>
    </div>
  );
}

/**
 * Мост hash-роутинга (Фаза F, §4): #/mood, #/mood/journal?filters=...,
 * #/mood/entry/:id, #/mood/overview/week|month|insights.
 * Экраны синхронизируют hash через replaceState (без лишних событий),
 * а навигация по ссылкам/back-forward приходит сюда через hashchange.
 */
function DeepLinkBridge() {
  const app = useApp();
  const userId = app.user?.id;

  React.useEffect(() => {
    if (!app.booted || !userId) return;
    const apply = () => {
      const route = parseMoodRoute(window.location.hash);
      if (route.kind === "none") return;
      const tab = routeTab(route);
      if (tab) app.setTab(tab);
      if (route.kind === "journal") app.setDeepLink({ filters: deserializeFilters(route.filters) });
      else if (route.kind === "entry") app.setDeepLink({ entryId: route.id });
      else if (route.kind === "overview") app.setDeepLink({ overviewTab: route.tab });
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
    // намеренно: реагируем только на загрузку, смену пользователя и hashchange
  }, [app.booted, userId]);

  return null;
}

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

const KEY_TABS: Record<string, TabId> = {
  t: "today", f: "flow", r: "rhythm", j: "journal", o: "mood", c: "character", g: "together", i: "insights",
};

function Body() {
  const app = useApp();
  const [modal, setModal] = useState<{ open: boolean; task: Task | null; draft: TaskDraft | null }>({
    open: false,
    task: null,
    draft: null,
  });
  const [helpOpen, setHelpOpen] = useState(false);

  useHotkeys(
    {
      ...Object.fromEntries(Object.entries(KEY_TABS).map(([k, tab]) => [k, () => app.setTab(tab)])),
      n: () => setModal({ open: true, task: null, draft: { date: todayKey(), startMin: 540 } }),
      m: () => app.openCheckIn(),
      "ь": () => app.openCheckIn(), // M в русской раскладке
      "?": () => setHelpOpen((v) => !v),
    },
    app.booted && !!app.user && !app.checkInOpen
  );

  if (!app.booted) return <Splash />;
  if (!app.user)
    return (
      <>
        <Suspense fallback={<ScreenLoader />}>
          <AuthScreen />
        </Suspense>
        <div className="rhythm-bg" />
      </>
    );

  const openNew = (draft: TaskDraft | null = null) => setModal({ open: true, task: null, draft });
  const openEdit = (task: Task) => setModal({ open: true, task, draft: null });
  const close = () => setModal((m) => ({ ...m, open: false }));

  return (
    <>
      <div className="rhythm-bg" />
      <DeepLinkBridge />
      <Shell onNewTask={() => openNew()} onHelp={() => setHelpOpen(true)} helpOpen={helpOpen} onCloseHelp={() => setHelpOpen(false)}>
        <Suspense fallback={<ScreenLoader />}>
          {app.tab === "today" && <TodayScreen onEdit={openEdit} onNewAt={(date, startMin, endMin) => openNew({ date, startMin, endMin })} />}
          {app.tab === "flow" && <FlowScreen />}
          {app.tab === "rhythm" && <RhythmScreen onPlanSlot={(start, end) => openNew({ date: todayKey(), startMin: start, endMin: end })} />}
          {app.tab === "journal" && <JournalScreen />}
          {app.tab === "mood" && <MoodOverviewScreen />}
          {app.tab === "character" && <CharacterScreen />}
          {app.tab === "together" && <TogetherScreen />}
          {app.tab === "insights" && <InsightsScreen />}
        </Suspense>
      </Shell>
      <Suspense fallback={null}>
        <TaskModal open={modal.open} task={modal.task} draft={modal.draft} onClose={close} />
        <MoodCheckInSheet />
      </Suspense>
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
