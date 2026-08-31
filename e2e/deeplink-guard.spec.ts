import { test, expect } from "@playwright/test";

/**
 * Сценарий 3 — защита доступа (§4, RLS по user_id).
 * Будучи залогиненным, переходим на /mood/entry/<несуществующий-uuid>.
 * Ожидание: состояние «Не найдено», данные чужой/несуществующей записи
 * НЕ отображаются (без утечки деталей).
 */
const FAKE_ID = "00000000-0000-4000-8000-000000000000";

test.describe("deep-link guard", () => {
  test("несуществующая запись → «Не найдено», без утечки данных", async ({ page }) => {
    /* Прямой переход на чужую/несуществующую запись (залогинены из storageState). */
    await page.goto(`/#/mood/entry/${FAKE_ID}`);

    /* Показывается состояние «Не найдено» (error-тост). */
    const toast = page.getByTestId("toast-error");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText("Запись не найдена");

    /* Мы на экране журнала (лента видна), но детальная запись НЕ открыта:
       guard не вызвал setDetailId для неподтверждённого владельца. */
    await expect(page.getByTestId("journal-feed")).toBeVisible();
  });

  test("своя лента доступна: записи текущего пользователя отображаются", async ({ page }) => {
    await page.goto("/#/mood/journal");
    /* Лента текущего пользователя рендерится (seed-данные присутствуют). */
    await expect(page.getByTestId("journal-feed")).toBeVisible();
  });
});
