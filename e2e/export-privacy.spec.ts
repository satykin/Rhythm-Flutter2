import { test, expect } from "@playwright/test";

/**
 * Сценарий 2 — приватность экспорта (§14): выгрузка только по явному
 * подтверждению. Проверяем, что диалог показывает сводку (число записей +
 * период), а «Отмена» закрывает диалог БЕЗ скачивания файла.
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

    /* Открываем диалог экспорта CSV. */
    await page.getByTestId("export-csv-btn").click();
    const summary = page.getByTestId("export-csv-summary");
    await expect(summary).toBeVisible();

    /* Сводка: «Экспортировать N … за период …». */
    await expect(summary).toContainText("Экспортировать");
    await expect(summary).toContainText(/за период/);

    /* Кнопка подтверждения присутствует, но мы её НЕ нажимаем. */
    await expect(page.getByTestId("export-confirm")).toBeVisible();

    /* Отмена — явный отказ от выгрузки. */
    await page.getByTestId("export-cancel").click();
    await expect(summary).toBeHidden();

    /* Даём возможному (несанкционированному) скачиванию проявиться. */
    await page.waitForTimeout(600);
    expect(downloaded).toBe(false);
  });
});
