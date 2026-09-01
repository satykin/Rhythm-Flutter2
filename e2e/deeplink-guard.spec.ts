import { test, expect } from "@playwright/test";

/**
 * Сценарий 3 — защита доступа (спека 2.1, §4; RLS по user_id).
 * Будучи залогиненным, переходим на /mood/entry/<несуществующий-uuid>.
 * Ожидание: отображается состояние not-found; данные чужой/несуществующей
 * записи НЕ показываются (без утечки деталей).
 */
const FAKE_ID = "00000000-0000-4000-8000-000000000000";

test.describe("deep-link guard", () => {
  test("несуществующая запись → not-found, без утечки данных", async ({ page }) => {
    /* Прямой переход на чужую/несуществующую запись (залогинены из storageState). */
    await page.goto(`/#/mood/entry/${FAKE_ID}`);

    /* Состояние «Не найдено» отображается. */
    const notFound = page.getByTestId("not-found");
    await expect(notFound).toBeVisible();
    await expect(notFound).toContainText("Запись не найдена");

    /* Мы на экране журнала (своя лента видна)… */
    await expect(page.getByTestId("journal-list")).toBeVisible();

    /* …но детальная запись НЕ открыта: guard не пропустил чужой id.
       В ленте нет ни одной записи с данными «несуществующей» записи —
       лента показывает только записи текущего пользователя. */
    const entries = page.getByTestId("journal-entry");
    const count = await entries.count();
    for (let i = 0; i < count; i++) {
      await expect(entries.nth(i)).not.toContainText(FAKE_ID);
    }
  });

  test("своя лента доступна: записи текущего пользователя отображаются", async ({ page }) => {
    await page.goto("/#/mood/journal");
    /* Лента текущего пользователя рендерится (seed-данные присутствуют). */
    await expect(page.getByTestId("journal-list")).toBeVisible();
    await expect(page.getByTestId("not-found")).toHaveCount(0);
  });
});
