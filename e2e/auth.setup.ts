import { test as setup, expect } from "@playwright/test";

/**
 * Глобальный setup: создаёт тестового пользователя через существующий
 * механизм регистрации (UI) и сохраняет storageState (localStorage + cookies).
 * Все спеки используют его и стартуют уже залогиненными — порядок выполнения
 * не важен, каждый запуск Playwright начинает с чистого контекста.
 *
 * Креды — из env (в CI — из секретов репозитория), с предсказуемыми дефолтами.
 */
const email = process.env.E2E_EMAIL ?? "e2e@rhythm.test";
const password = process.env.E2E_PASSWORD ?? "e2e-password-123";
const name = process.env.E2E_NAME ?? "E2E Tester";

setup("create test user & save storage state", async ({ page }) => {
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
