import { test, expect } from "@playwright/test";

/**
 * Сценарий 2 — приватность экспорта (спека 2.1, §14): выгрузка ТОЛЬКО по
 * явному подтверждению. Диалог показывает сводку (число записей + период
 * из АКТИВНЫХ фильтров), «Отмена» закрывает диалог БЕЗ скачивания файла.
 */
test.describe("приватность экспорта", () => {
  test("CSV: сводка с числом записей и периодом; Отмена не скачивает", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-journal")).toBeVisible();
    await page.getByTestId("nav-journal").click();

    /* Флаг скачивания — должен остаться false после «Отмена». */
    let downloaded = false;
    page.on("download", () => {
      downloaded = true;
    });

    /* Открываем диалог подтверждения экспорта CSV. */
    await page.getByTestId("export-csv-trigger").click();
    const dialog = page.getByTestId("export-confirm-dialog");
    await expect(dialog).toBeVisible();

    /* Сводка: «Экспортировать N … за период …» (N и период из фильтров). */
    const summary = page.getByTestId("export-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("Экспортировать");
    await expect(summary).toContainText(/за период/);
    /* Число записей — число, а не пустое место. */
    await expect(summary).toContainText(/\d+/);

    /* Кнопка подтверждения присутствует, но мы её НЕ нажимаем. */
    await expect(page.getByTestId("export-confirm")).toBeVisible();

    /* Отмена — явный отказ от выгрузки. */
    await page.getByTestId("export-cancel").click();
    await expect(dialog).toBeHidden();

    /* Даём возможному (несанкционированному) скачиванию проявиться. */
    await page.waitForTimeout(600);
    expect(downloaded).toBe(false);
  });
});
