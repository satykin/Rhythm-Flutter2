import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { AppProvider, useApp, type Ctx } from "./store";
import { todayKey } from "../lib/time";

/**
 * Фикс 11: создание задачи в занятый слот НЕ должно молча переносить её.
 * store.addTask возвращает null (запись не создаётся, состояние не меняется),
 * а app.checkTaskSlot отдаёт коллизии + предложения для диалога.
 */

const DB_KEY = "rhythm.db.v1";
const SESSION_KEY = "rhythm.session.v1";

type AppRef = { current: Ctx | null };

/** Сохраняет СВЕЖИЙ контекст на каждом рендере (контекст пересоздаётся). */
function Harness({ appRef }: { appRef: AppRef }) {
  const app = useApp();
  appRef.current = app;
  return null;
}

async function bootApp(appRef: AppRef): Promise<void> {
  await act(async () => {
    render(
      <AppProvider>
        <Harness appRef={appRef} />
      </AppProvider>
    );
  });
  await waitFor(() => expect(appRef.current?.booted).toBe(true));
}

async function signUp(appRef: AppRef, email: string): Promise<void> {
  await act(async () => {
    const err = await appRef.current!.signUp("Тест", email, "password123");
    expect(err).toBeNull();
  });
  await waitFor(() => expect(appRef.current!.user).toBeTruthy());
}

describe("store: разведение задач по слотам без молчаливого переноса (фикс 11)", () => {
  const appRef: AppRef = { current: null };

  beforeEach(() => {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    appRef.current = null;
  });

  it("addTask в занятый слот возвращает null и не создаёт задачу", async () => {
    await bootApp(appRef);
    await signUp(appRef, "slot@test.local");

    const date = todayKey();
    /* 1300–1360 — заведомо свободное окно (сид-задачи заканчиваются раньше) */
    let created = null as ReturnType<Ctx["addTask"]>;
    await act(async () => {
      created = appRef.current!.addTask({
        title: "Задача A", description: "", date, startMin: 1300, endMin: 1360,
        color: "violet", icon: "target", tags: [], energy: "medium",
      });
    });
    expect(created).not.toBeNull();
    await waitFor(() => expect(appRef.current!.tasks.some((t) => t.title === "Задача A")).toBe(true));

    const before = appRef.current!.tasks.length;

    /* Попытка создать задачу, пересекающую «Задачу A» (1330–1390). */
    let collided = null as ReturnType<Ctx["addTask"]>;
    await act(async () => {
      collided = appRef.current!.addTask({
        title: "Задача B", description: "", date, startMin: 1330, endMin: 1390,
        color: "indigo", icon: "target", tags: [], energy: "medium",
      });
    });

    /* Перенос НЕ применён: null, число задач не изменилось, «Задачи B» нет. */
    expect(collided).toBeNull();
    await waitFor(() => expect(appRef.current!.tasks.length).toBe(before));
    expect(appRef.current!.tasks.some((t) => t.title === "Задача B")).toBe(false);
  });

  it("checkTaskSlot отдаёт коллизии и предложения для диалога", async () => {
    await bootApp(appRef);
    await signUp(appRef, "slot2@test.local");

    const date = todayKey();
    await act(async () => {
      appRef.current!.addTask({
        title: "Встреча", description: "", date, startMin: 1300, endMin: 1360,
        color: "violet", icon: "users", tags: [], energy: "medium",
      });
    });
    await waitFor(() => expect(appRef.current!.tasks.some((t) => t.title === "Встреча")).toBe(true));

    const check = appRef.current!.checkTaskSlot(date, 1330, 1390);
    expect(check.free).toBe(false);
    expect(check.colliding.length).toBeGreaterThan(0);
    expect(check.colliding[0].title).toBe("Встреча");
    /* предложения — свободные окна той же длительности, не пересекающие «Встречу» */
    expect(check.proposals.length).toBeGreaterThan(0);
    check.proposals.forEach((p) => {
      expect(p.endMin - p.startMin).toBe(60);
      const overlaps = p.startMin < 1360 && p.endMin > 1300;
      expect(overlaps).toBe(false);
    });

    /* свободный слот — free=true, без коллизий */
    const free = appRef.current!.checkTaskSlot(date, 800, 860);
    expect(free.free).toBe(true);
    expect(free.colliding).toEqual([]);
  });
});
