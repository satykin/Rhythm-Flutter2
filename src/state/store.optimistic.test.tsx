import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { AppProvider, useApp, type Ctx } from "./store";
import { db } from "../lib/db";
import { todayKey } from "../lib/time";
import type { Task } from "../lib/types";

/**
 * Фикс 16: созданная/изменённая/удалённая задача видна на таймлайне
 * МГНОВЕННО (оптимистичное обновление), а не после F5.
 *  - addTask добавляет строку в store сразу, до ответа «БД»;
 *  - при ошибке записи задача в store НЕ попадает (или удаляется);
 *  - update/remove отражаются сразу.
 */

const DB_KEY = "rhythm.db.v1";
const SESSION_KEY = "rhythm.session.v1";

type AppRef = { current: Ctx | null };

function Harness({ appRef }: { appRef: AppRef }) {
  const app = useApp();
  appRef.current = app;
  return null;
}

async function bootAndSignUp(appRef: AppRef, email: string): Promise<void> {
  await act(async () => {
    render(
      <AppProvider>
        <Harness appRef={appRef} />
      </AppProvider>
    );
  });
  await waitFor(() => expect(appRef.current?.booted).toBe(true));
  await act(async () => {
    const err = await appRef.current!.signUp("Тест", email, "password123");
    expect(err).toBeNull();
  });
  await waitFor(() => expect(appRef.current!.user).toBeTruthy());
}

/* Окно 800–860 (13:20–14:20) гарантированно свободно в сиде в любое
   время суток (обед 720–780, Дизайн-ревью с 870 — фикс 13). */
const FREE_START = 800;
const FREE_END = 860;

const newTaskInput = (title: string) => ({
  title,
  description: "",
  date: todayKey(),
  startMin: FREE_START,
  endMin: FREE_END,
  color: "violet" as const,
  icon: "target",
  tags: [],
  energy: "medium" as const,
});

describe("store: оптимистичные обновления задач (фикс 16)", () => {
  const appRef: AppRef = { current: null };

  beforeEach(() => {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
    appRef.current = null;
  });

  it("addTask: задача попадает в store СРАЗУ (до ответа удалённой БД)", async () => {
    await bootAndSignUp(appRef, "opt1@test.local");

    let created: Task | null = null;
    act(() => {
      created = appRef.current!.addTask(newTaskInput("Мгновенная"));
    });

    expect(created).not.toBeNull();
    /* Без waitFor: состояние обновлено синхронно, серверного чтения нет. */
    expect(appRef.current!.tasks.some((t) => t.id === created!.id && t.title === "Мгновенная")).toBe(true);
  });

  it("addTask: ошибка записи — задача НЕ попадает в store", async () => {
    await bootAndSignUp(appRef, "opt2@test.local");
    const before = appRef.current!.tasks.length;

    const spy = vi.spyOn(db, "insertTask").mockImplementation(() => {
      throw new Error("диск переполнен");
    });
    let created: Task | null = null;
    act(() => {
      created = appRef.current!.addTask(newTaskInput("Не сохранится"));
    });
    spy.mockRestore();

    expect(created).toBeNull();
    expect(appRef.current!.tasks.length).toBe(before);
    expect(appRef.current!.tasks.some((t) => t.title === "Не сохранится")).toBe(false);
  });

  it("updateTask: изменение видно в store сразу", async () => {
    await bootAndSignUp(appRef, "opt3@test.local");

    let created: Task | null = null;
    act(() => {
      created = appRef.current!.addTask(newTaskInput("До переименования"));
    });
    expect(created).not.toBeNull();

    act(() => {
      appRef.current!.updateTask(created!.id, { title: "После переименования" });
    });

    const row = appRef.current!.tasks.find((t) => t.id === created!.id);
    expect(row?.title).toBe("После переименования");
  });

  it("removeTask: строка исчезает из store сразу", async () => {
    await bootAndSignUp(appRef, "opt4@test.local");

    let created: Task | null = null;
    act(() => {
      created = appRef.current!.addTask(newTaskInput("На удаление"));
    });
    expect(appRef.current!.tasks.some((t) => t.id === created!.id)).toBe(true);

    act(() => {
      appRef.current!.removeTask(created!.id);
    });

    expect(appRef.current!.tasks.some((t) => t.id === created!.id)).toBe(false);
  });
});
