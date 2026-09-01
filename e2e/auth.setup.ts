import { test as setup, expect } from "@playwright/test";

/**
 * Глобальный setup: тестовый пользователь + storageState для всех спеков.
 *
 * Два режима (Фаза 1.5, §4):
 *  · С секретами (SUPABASE_URL + SUPABASE_ANON_KEY + E2E_PASSWORD):
 *    ПРОГРАММНЫЙ вход через supabase.auth.signInWithPassword (стабильнее UI),
 *    сессия инжектится в localStorage браузера до загрузки приложения.
 *  · Без секретов (dev / PR из форка): фолбэк на демо-режим —
 *    регистрация кликами по UI (приложение работает на localStorage).
 *
 * Креды — из env (в CI — из секретов репозитория), с предсказуемыми дефолтами.
 */
const email = process.env.E2E_EMAIL ?? "e2e@rhythm.test";
const password = process.env.E2E_PASSWORD ?? "e2e-password-123";
const name = process.env.E2E_NAME ?? "E2E Tester";

const sbUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const sbAnonKey = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";

setup("create test user & save storage state", async ({ page }) => {
  /* ---------- режим Supabase: программный вход ---------- */
  if (sbUrl && sbAnonKey) {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(sbUrl, sbAnonKey);

    let session = (await sb.auth.signInWithPassword({ email, password })).data.session;
    if (!session) {
      /* Пользователя ещё нет — создаём (в проекте должно быть выключено
         подтверждение почты для e2e-аккаунта, см. docs/supabase-activation.md). */
      await sb.auth.signUp({ email, password, options: { data: { name } } });
      session = (await sb.auth.signInWithPassword({ email, password })).data.session;
    }
    expect(session, "E2E: не удалось войти в Supabase (проверьте секреты и e2e-пользователя)").toBeTruthy();

    /* supabase-js хранит сессию в localStorage под ключом sb-<ref>-auth-token.
       Инжектим её ДО загрузки приложения — app стартует уже залогиненным. */
    const projectRef = new URL(sbUrl).hostname.split(".")[0];
    const storageKey = `sb-${projectRef}-auth-token`;
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [storageKey, JSON.stringify(session)] as [string, string]
    );

    await page.goto("/");
    await expect(page.getByTestId("nav-journal")).toBeVisible();
    await page.context().storageState({ path: ".auth/user.json" });
    return;
  }

  /* ---------- фолбэк: демо-режим (localStorage), вход через UI ---------- */
  await page.goto("/");

  /* Дожидаемся формы авторизации (приложение грузится из Splash). */
  const signupTab = page.getByTestId("auth-tab-signup");
  await expect(signupTab).toBeVisible();

  await signupTab.click();
  await page.getByTestId("auth-name").fill(name);
  await page.getByTestId("auth-email").fill(email);
  await page.getByTestId("auth-password").fill(password);
  await page.getByTestId("auth-submit").click();

  /* Залогиненный каркас: видна навигация. */
  await expect(page.getByTestId("nav-journal")).toBeVisible();

  await page.context().storageState({ path: ".auth/user.json" });
});
