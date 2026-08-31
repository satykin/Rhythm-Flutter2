import { test, expect } from "@playwright/test";

/**
 * Сценарий 1 — ядро привычки: чек-ин за ≤3 тапа.
 * Хоткей M → выбрать состояние → «Сохранить» → запись в Journal.
 * Базовый путь проверяется БЕЗ раскрытия деталей.
 */
test.describe("check-in (ядро привычки)", () => {
  test("хоткей M → состояние → Сохранить → запись появилась в Journal", async ({ page }) => {
    await page.goto("/");
    /* Залогинены из storageState: виден каркас. */
    await expect(page.getByTestId("nav-today")).toBeVisible();

    /* Хоткей M открывает чек-ин глобально (на экране Today). */
    await page.keyboard.press("m");
    const sheet = page.getByTestId("checkin-sheet");
    await expect(sheet).toBeVisible();

    /* Детали скрыты по умолчанию — базовый путь работает без них. */
    await expect(page.getByTestId("checkin-add-details")).toBeVisible();

    /* «Сохранить» неактивна, пока состояние не выбрано. */
    await expect(page.getByTestId("checkin-save")).toBeDisabled();

    /* Тап по состоянию score=4 («Хорошо») — 1-й тап. */
    await page.getByTestId("mood-state-4").click();
    await expect(page.getByTestId("checkin-save")).toBeEnabled();

    /* «Сохранить» — 2-й тап. */
    await page.getByTestId("checkin-save").click();

    /* Чек-ин закрывается (success-анимация → сохранение). */
    await expect(sheet).toBeHidden();

    /* Переходим в Journal: новая запись (сегодня) — первая, с выбранным состоянием. */
    await page.getByTestId("nav-journal").click();
    const first = page.getByTestId("journal-entry").first();
    await expect(first).toBeVisible();
    await expect(first).toContainText("Хорошо");
  });

  test("все 5 состояний выбираются и имеют текстовые подписи", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("m");
    await expect(page.getByTestId("checkin-sheet")).toBeVisible();

    for (const score of [1, 2, 3, 4, 5]) {
      const btn = page.getByTestId(`mood-state-${score}`);
      await expect(btn).toBeVisible();
      /* Доступная подпись (aria-label) у каждого состояния. */
      await expect(btn).toHaveAttribute("aria-label", /.+/);
    }
  });
});
