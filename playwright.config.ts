import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E (3 критичных потока: check-in, приватность экспорта, deep-link guard).
 *
 * Аутентификация: приложение — локальное демо (localStorage, без Supabase-рантайма),
 * поэтому программный `supabase.auth.signInWithPassword` неприменим. Используется
 * стандартный паттерн setup-проекта: однократный UI-signup → сохранение
 * storageState → все спеки стартуют уже залогиненными (независимо от порядка).
 * При переезде на реальный Supabase setup-проект заменяется на API-логин,
 * креды берутся из тех же env-переменных.
 */

const PORT = Number(process.env.E2E_PORT ?? 4173);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  /* 1–2 ретрая на нестабильность */
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 2 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    /* Однократный signup → storageState (общий для всех спеков). */
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ".auth/user.json" },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    /* Собираем и раздаём прод-бандл — тестируем то, что уйдёт пользователям. */
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
