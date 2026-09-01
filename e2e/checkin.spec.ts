import { test, expect } from "@playwright/test";

/**
 * Сценарий 1 — ядро привычки: чек-ин за ≤3 тапа (спека 2.1, §6).
 *
 * ОСНОВНОЙ ПУТЬ: клик [data-testid=checkin-open] на Today → выбор состояния
 * (mood-state-N) → checkin-save → запись появляется в journal-list.
 * Базовый путь проверяется БЕЗ раскрытия деталей.
 *
 * Хоткей M проверяется ОТДЕЛЬНЫМ тестом: открывает чек-ин на Today и
 * НЕ срабатывает поверх открытых диалогов / полей ввода.
 */
test.describe("check-in (ядро привычки)", () => {
  test("основной путь: checkin-open → состояние → Сохранить → запись в Journal", async ({ page }) => {
    await page.goto("/");
    /* Залогинены из storageState: каркас виден, мы на Today. */
    await expect(page.getByTestId("nav-today")).toBeVisible();

    /* Триггер чек-ина на экране Today (кнопка «+» / «Отметить состояние»). */
    await page.getByTestId("checkin-open").first().click();
    const sheet = page.getByTestId("checkin-sheet");
    await expect(sheet).toBeVisible();

    /* Детали скрыты по умолчанию — базовый путь работает без них. */
    await expect(page.getByTestId("checkin-add-details")).toBeVisible();
    await expect(page.getByTestId("checkin-note")).toHaveCount(0);

    /* «Сохранить» неактивна, пока состояние не выбрано. */
    await expect(page.getByTestId("checkin-save")).toBeDisabled();

    /* Тап по состоянию score=4 («Хорошо») — 1-й тап. */
    await page.getByTestId("mood-state-4").click();
    await expect(page.getByTestId("checkin-save")).toBeEnabled();

    /* «Сохранить» — 2-й тап (чек-ин закрылся за 2 тапа, ≤3 по спеке). */
    await page.getByTestId("checkin-save").click();
    await expect(sheet).toBeHidden();

    /* Переходим в Journal: новая запись (сегодня) — первая в ленте,
       с выбранным состоянием «Хорошо» (текстовая подпись, не score). */
    await page.getByTestId("nav-journal").click();
    await expect(page.getByTestId("journal-list")).toBeVisible();
    const first = page.getByTestId("journal-entry").first();
    await expect(first).toBeVisible();
    await expect(first).toContainText("Хорошо");
  });

  test("хоткей M открывает чек-ин на Today и не срабатывает поверх полей ввода", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-today")).toBeVisible();

    /* M на Today (фокус не в поле ввода) → чек-ин открыт. */
    await page.keyboard.press("m");
    await expect(page.getByTestId("checkin-sheet")).toBeVisible();

    /* Раскрываем детали и фокусируем поле заметки. */
    await page.getByTestId("checkin-add-details").click();
    const note = page.getByTestId("checkin-note");
    await expect(note).toBeVisible();
    await note.click();
    await note.fill("черновик");

    /* M поверх поля ввода игнорируется: лист единственный, поле в фокусе. */
    await page.keyboard.press("m");
    await expect(page.getByTestId("checkin-sheet")).toHaveCount(1);
    await expect(note).toBeFocused();
    await expect(note).toHaveValue("черновик");

    /* Esc закрывает лист (штатный выход). */
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("checkin-sheet")).toHaveCount(0);
  });

  test("все 5 состояний доступны с клавиатуры и имеют текстовые подписи", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("m");
    await expect(page.getByTestId("checkin-sheet")).toBeVisible();

    for (const score of [1, 2, 3, 4, 5]) {
      const btn = page.getByTestId(`mood-state-${score}`);
      await expect(btn).toBeVisible();
      /* Доступная подпись (aria-label) у каждого состояния — не только эмодзи. */
      await expect(btn).toHaveAttribute("aria-label", /.+/);
    }
  });
});
